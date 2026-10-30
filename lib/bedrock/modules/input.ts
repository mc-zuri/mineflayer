import assert from 'assert'
import { moveDirection } from 'prismarine-physics/lib/bedrock/index.ts'
import type { BedrockCore } from '../core/core.ts'
import type { ControlState, ControlStateStatus } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { CookedInput, Latch } from './auth_input.ts'

const OWNER = 'input'
const CONTROLS: readonly ControlState[] = Object.freeze(['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak'])

function controlsOf<Value> (value: (control: ControlState) => Value): Record<ControlState, Value> {
  return { forward: value('forward'), back: value('back'), left: value('left'), right: value('right'), jump: value('jump'), sprint: value('sprint'), sneak: value('sneak') }
}

/**
 * The controls as keys: the API sets them at once (getControlState reads them), the input pass after presses and
 * releases them, and the input system makes them a tick's keys and the direction they ask for. A press or release is
 * kept until an auth input that reports the keys is sent, so that a tap shorter than a tick still reaches the server.
 */
export class Controls {
  /** what this tick's input system made of the keys */
  cooked: CookedInput = { direction: { x: 0, z: 0 }, keys: controlsOf(() => ({ level: false, down: false, up: false })) }
  private readonly bot: BedrockBotInternal
  private readonly requested = controlsOf(() => false)
  private readonly latches = controlsOf((): Latch => ({ level: false, down: false, up: false }))

  constructor (bot: BedrockBotInternal) {
    this.bot = bot
  }

  install (core: BedrockCore): void {
    const { bot } = this
    const controlState: ControlStateStatus = { ...this.requested }
    for (const control of CONTROLS) {
      Object.defineProperty(controlState, control, {
        enumerable: true,
        get: () => this.requested[control],
        set: (state: boolean) => { this.set(core, control, state) }
      })
    }
    bot.controlState = controlState
    bot.setControlState = (control, state) => { this.set(core, control, state) }
    bot.getControlState = control => {
      assert.ok(CONTROLS.includes(control), `invalid control: ${control}`)
      return this.requested[control]
    }
    bot.clearControlStates = () => {
      for (const control of CONTROLS) this.set(core, control, false)
    }
    core.system(OWNER, { name: 'input.cook', place: { at: 'ClientInputUpdateSystem' }, gate: 'present', replay: false, run: () => { this.cook() } })
  }

  /** an auth input reported the keys: their presses and releases are told */
  clearEdges (): void {
    for (const control of CONTROLS) this.latches[control] = { ...this.latches[control], down: false, up: false }
  }

  private set (core: BedrockCore, control: ControlState, state: boolean): void {
    assert.ok(CONTROLS.includes(control), `invalid control: ${control}`)
    if (this.requested[control] === state) return
    this.requested[control] = state
    core.command(() => {
      const latch = this.latches[control]
      this.latches[control] = state ? { ...latch, level: true, down: true } : { ...latch, level: false, up: true }
    })
  }

  private cook (): void {
    const keys = controlsOf(control => this.latches[control])
    this.cooked = { direction: moveDirection({ forward: keys.forward.level, back: keys.back.level, left: keys.left.level, right: keys.right.level }), keys }
  }
}
