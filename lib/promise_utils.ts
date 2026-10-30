import type { Window } from 'prismarine-windows'
import type { BedrockBot, BedrockBotEvents, Bot, BotEvents } from './types/api/index.ts'
import type { BotInternal } from './types/internal.ts'
import type { ClientListeners, TypedClient } from './types/protocol/client.ts'

/** a promise settled from outside: finish resolves it, cancel rejects it, and only the first of them counts */
export interface Task<T> {
  done: boolean
  promise: Promise<T>
  finish: (result: T) => void
  cancel: (err: Error) => void
}

/**
 * The listener map of each kind of emitter mineflayer waits on: event name to listener. Their typings type events
 * with generic methods (on<E extends keyof Events>), from which TypeScript cannot infer the map, so each kind is named.
 */
export type EventsOf<Emitter> =
  Emitter extends TypedClient ? ClientListeners
    : Emitter extends Window<infer Events> ? Events
      : Emitter extends BedrockBot ? BedrockBotEvents
        : Emitter extends BotInternal | Bot ? BotEvents
          : never

/** an event's arguments, as its listener receives them */
export type EventArgs<Emitter, Event extends keyof EventsOf<Emitter>> =
  EventsOf<Emitter>[Event] extends (...args: infer Args extends readonly unknown[]) => void ? Args : never

export interface OnceOptions<Args extends readonly unknown[]> {
  /** milliseconds to wait before rejecting; 0 or less waits forever */
  timeout?: number
  /** called with each emission's arguments: only one it returns true for settles the wait */
  checkCondition?: ((...args: Args) => boolean) | undefined
  /** removes the listener and rejects with the signal's reason when it is aborted */
  signal?: AbortSignal | undefined
}

/**
 * what waiting on an emitter needs of it, with listeners of that type; methods are compared bivariantly, so every
 * typed emitter is a Listenable<never>
 */
interface Listenable<Listener> {
  addListener (event: string | symbol, listener: Listener): void
  removeListener (event: string | symbol, listener: Listener): void
}

function sleep (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createTask<T = void> (): Task<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>()
  const task: Task<T> = {
    done: false,
    promise,
    cancel: (err) => {
      if (!task.done) {
        task.done = true
        reject(err)
      }
    },
    finish: (result) => {
      if (!task.done) {
        task.done = true
        resolve(result)
      }
    }
  }
  return task
}

function createDoneTask (): Task<void> {
  const task = {
    done: true,
    promise: Promise.resolve(),
    cancel: () => {},
    finish: () => {}
  }
  return task
}

/**
 * Similar to the 'once' function from the 'events' module, but allows you to add a condition for when you want to
 * actually handle the event, as well as a timeout. The listener is additionally removed if a timeout occurs, instead
 * of with 'once' where a listener might stay forever if it never triggers.
 * Note that timeout and checkCondition, both optional, are in the third parameter as an object.
 * @param emitter - The event emitter to listen to
 * @param event - The name of the event you want to listen for
 * @param [timeout=0] - An amount, in milliseconds, for which to wait before considering the promise failed. <0 = none.
 * @param [checkCondition] - A function which matches the same signature of an event emitter handler, and should return something truthy if you want the event to be handled. If this is not provided, all events are handled.
 * @param [signal] - An AbortSignal which, when aborted, removes the listener and rejects the promise with the signal's reason.
 * @returns {Promise} A promise which will either resolve to an *array* of values in the handled event, or will reject on timeout if applicable. This may never resolve if no timeout is set and the event does not fire.
 */
function onceWithCleanup<Emitter extends Listenable<never>, Event extends keyof EventsOf<Emitter> & (string | symbol)> (emitter: Emitter, event: Event, options?: OnceOptions<EventArgs<Emitter, Event>>): Promise<EventArgs<Emitter, Event>>
function onceWithCleanup<Args extends readonly unknown[]> (emitter: Listenable<(...data: Args) => void>, event: string | symbol, { timeout = 0, checkCondition = undefined, signal = undefined }: OnceOptions<Args> = {}): Promise<Args> {
  const task = createTask<Args>()

  const onEvent = (...data: Args): void => {
    if (typeof checkCondition === 'function') {
      let matches
      try {
        matches = checkCondition(...data)
      } catch (err) {
        // checkCondition runs inside emit(), which for client events is the socket
        // read path: throwing there unwinds it and the client silently stops
        // receiving packets. Reject the promise instead, so the caller sees it.
        task.cancel(err instanceof Error ? err : new Error(String(err)))
        return
      }
      if (!matches) return
    }

    task.finish(data)
  }

  emitter.addListener(event, onEvent)

  let onAbort: (() => void) | undefined
  if (signal) {
    const abortError = (): Error => signal.reason instanceof Error
      ? signal.reason
      : new Error(`Waiting for event ${String(event)} was aborted`)
    if (signal.aborted) {
      task.cancel(abortError())
    } else {
      onAbort = () => task.cancel(abortError())
      signal.addEventListener('abort', onAbort, { once: true })
    }
  }

  if (typeof timeout === 'number' && timeout > 0) {
    // For some reason, the call stack gets lost if we don't create the error outside of the .then call
    const timeoutError = new Error(`Event ${String(event)} did not fire within timeout of ${timeout}ms`)
    sleep(timeout).then(() => {
      if (!task.done) {
        task.cancel(timeoutError)
      }
    })
  }

  task.promise.catch(() => {}).finally(() => {
    emitter.removeListener(event, onEvent)
    if (onAbort) signal?.removeEventListener('abort', onAbort)
  })

  return task.promise
}

function once<Emitter extends Listenable<never>, Event extends keyof EventsOf<Emitter> & (string | symbol)> (emitter: Emitter, event: Event, timeout = 20000): Promise<EventArgs<Emitter, Event>> {
  return onceWithCleanup(emitter, event, { timeout })
}

function withTimeout<T> (promise: Promise<T>, timeout: number): Promise<T> {
  return Promise.race([
    promise,
    sleep(timeout).then(() => {
      throw new Error('Promise timed out.')
    })
  ])
}

export {
  once,
  sleep,
  createTask,
  createDoneTask,
  onceWithCleanup,
  withTimeout
}
