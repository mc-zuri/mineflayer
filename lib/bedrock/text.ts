import prismarineChat from 'prismarine-chat'
import type { ChatMessage, ChatMessageClass, TextComponent } from 'prismarine-chat'
import type { Registry } from 'prismarine-registry'

// Bedrock's text as prismarine-chat messages that read as the vanilla client draws them: § codes, the client's
// translation of a message and its parameters, and rawtext JSON.

/** a language whose format strings are prismarine-chat's, as bedrockLanguage writes them */
export type BedrockLanguage = Readonly<Record<string, string>>

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

interface Style {
  color?: string
  bold?: true
  italic?: true
  obfuscated?: true
}

/** prismarine-chat messages over the version's language */
export interface BedrockText {
  readonly ChatMessage: ChatMessageClass
  readonly language: BedrockLanguage
  text: (text: string) => ChatMessage
  /** as a text packet whose needs_translation is set (translationComponent) */
  translation: (message: string, parameters: readonly string[]) => ChatMessage
  /** undefined when the vanilla client shows nothing: not JSON, or not a valid rawtext object */
  rawText: (json: string) => ChatMessage | undefined
}

// Java's sixteen colours, then Bedrock's own; §m and §n are colours on Bedrock, which has no strikethrough or underline
const COLORS: Readonly<Record<string, string>> = Object.freeze({
  0: 'black',
  1: 'dark_blue',
  2: 'dark_green',
  3: 'dark_aqua',
  4: 'dark_red',
  5: 'dark_purple',
  6: 'gold',
  7: 'gray',
  8: 'dark_gray',
  9: 'blue',
  a: 'green',
  b: 'aqua',
  c: 'red',
  d: 'light_purple',
  e: 'yellow',
  f: 'white',
  g: '#DDD605',
  h: '#E3D4D1',
  i: '#CECACA',
  j: '#443A3B',
  m: '#971607',
  n: '#B4684D',
  p: '#DEB12D',
  q: '#47A036',
  s: '#2CBAA8',
  t: '#21497B',
  u: '#9A5CC6',
  v: '#EB7114'
})

export function bedrockText (registry: Registry): BedrockText {
  const language = bedrockLanguage(registry.language)
  const ChatMessage = prismarineChat({ ...registry, language })
  return {
    ChatMessage,
    language,
    text: text => new ChatMessage(textComponent(text)),
    translation: (message, parameters) => new ChatMessage(translationComponent(message, parameters, language)),
    rawText: json => {
      const component = rawTextComponent(json, language)
      return component === undefined ? undefined : new ChatMessage(component)
    }
  }
}

/**
 * A Bedrock language with its format strings rewritten for prismarine-chat's formatter, which knows only %s, %1$s and
 * %%: %d and %1$d are %s and %1$s, a bare %1 is %1$s, and %% stays two characters, as the vanilla client prints it.
 */
export function bedrockLanguage (language: Readonly<Record<string, string>>): BedrockLanguage {
  return Object.fromEntries(Object.entries(language).map(([key, format]) => [key, prismarineFormat(format)]))
}

function prismarineFormat (format: string): string {
  return format
    .replace(/%%/g, '%%%%')
    .replace(/%(\d\$)?d/g, '%$1s')
    .replace(/%(\d)(?!\$)/g, '%$1$$s')
}

/** a string whose § codes style the rest of it; the code's character is never shown, an unknown code does nothing */
export function textComponent (text: string): TextComponent {
  const pieces: TextComponent[] = []
  forEachStyledRun(text, {}, (run, style) => { pieces.push({ text: run, ...style }) })
  return joined(pieces)
}

/**
 * A message and its parameters as the vanilla client translates them: a message that is a key is its format; in one
 * with %, each %key token is the key's format, an unknown token shows without its % and %% is %, and the whole is
 * then formatted; any other message shows as it is. A parameter that is a %key is translated.
 */
export function translationComponent (message: string, parameters: readonly string[], language: BedrockLanguage): TextComponent {
  return translated(message, parameters.map(parameter => parameterComponent(parameter, language)), language)
}

/** a rawtext JSON ({"rawtext":[{"text":…},{"translate":…,"with":…},{"selector":…},{"score":…}]}) */
export function rawTextComponent (json: string, language: BedrockLanguage): TextComponent | undefined {
  let root: Json
  try {
    root = JSON.parse(json)
  } catch {
    return undefined
  }
  const components = rawTextComponents(root, language, textComponent)
  return components === undefined ? undefined : joined(components)
}

function translated (message: string, parameters: TextComponent[], language: BedrockLanguage): TextComponent {
  if (Object.hasOwn(language, message)) return { translate: message, with: parameters }
  const pieces: TextComponent[] = []
  // the parameters the pieces so far formatted in order: the next piece's %s is the next parameter
  let taken = 0
  const formatted = (format: string, style: Style): TextComponent => {
    const piece = { translate: format, with: parameters.slice(taken), ...style }
    taken += inOrderSpecifiers(language[format] ?? format)
    return piece
  }
  let style: Style = {}
  let literal = ''
  const appendLiteral = (): void => {
    style = forEachStyledRun(literal, style, (run, runStyle) => {
      pieces.push(/%[sd\d]/.test(run) ? formatted(prismarineFormat(run), runStyle) : { text: run, ...runStyle })
    })
    literal = ''
  }
  // the odd parts are the tokens: % for %%, or a key's name
  for (const [index, part] of message.split(/%(%|[\w.-]*)/).entries()) {
    if (index % 2 === 0 || !Object.hasOwn(language, part)) {
      literal += part
      continue
    }
    appendLiteral()
    pieces.push(formatted(part, style))
  }
  appendLiteral()
  return joined(pieces)
}

function inOrderSpecifiers (format: string): number {
  return [...format.matchAll(/%(\d+\$)?([s%])/g)].filter(([, position, kind]) => position === undefined && kind === 's').length
}

function parameterComponent (parameter: string, language: BedrockLanguage): TextComponent {
  const key = parameter.replace(/^%/, '')
  return key !== parameter && Object.hasOwn(language, key) ? { translate: key } : textComponent(parameter)
}

function rawTextComponents (value: Json | undefined, language: BedrockLanguage, textOf: (text: string) => TextComponent): TextComponent[] | undefined {
  const rawtext = isObject(value) ? value['rawtext'] : undefined
  if (!Array.isArray(rawtext)) return undefined
  const components: TextComponent[] = []
  for (const entry of rawtext) {
    const component = rawTextEntry(entry, language, textOf)
    if (component === undefined) return undefined
    components.push(component)
  }
  return components
}

function rawTextEntry (entry: Json, language: BedrockLanguage, textOf: (text: string) => TextComponent): TextComponent | undefined {
  if (!isObject(entry)) return undefined
  const { text, translate, selector, score } = entry
  if (typeof text === 'string') return textOf(text)
  if (typeof translate === 'string') {
    const parameters = rawTextParameters(entry['with'], language)
    return parameters === undefined ? undefined : translated(translate, parameters, language)
  }
  if (typeof selector === 'string') return { selector }
  if (isObject(score) && typeof score['name'] === 'string' && typeof score['objective'] === 'string') return { score: { name: score['name'], objective: score['objective'] } }
  return undefined
}

/** a translate's with: absent, an array of strings, or a rawtext object; its texts are parameters (a %key translates) */
function rawTextParameters (parameters: Json | undefined, language: BedrockLanguage): TextComponent[] | undefined {
  const asParameter = (text: string): TextComponent => parameterComponent(text, language)
  if (parameters === undefined) return []
  if (!Array.isArray(parameters)) return rawTextComponents(parameters, language, asParameter)
  const components: TextComponent[] = []
  for (const parameter of parameters) {
    if (typeof parameter !== 'string') return undefined
    components.push(asParameter(parameter))
  }
  return components
}

/** calls `append` with each run of `text` and the style the § codes before it give; returns the style at its end */
function forEachStyledRun (text: string, style: Style, append: (run: string, style: Style) => void): Style {
  // the odd parts are the codes: the character after a §, none for a § at the end
  for (const [index, part] of text.split(/§(.?)/su).entries()) {
    if (index % 2 === 1) style = withCode(style, part)
    else if (part !== '') append(part, style)
  }
  return style
}

function withCode (style: Style, code: string): Style {
  const color = COLORS[code]
  if (color !== undefined) return { ...style, color }
  if (code === 'l') return { ...style, bold: true }
  if (code === 'o') return { ...style, italic: true }
  if (code === 'k') return { ...style, obfuscated: true }
  if (code === 'r') return {}
  return style
}

function joined (components: TextComponent[]): TextComponent {
  return components.length === 1 ? components[0]! : { text: '', extra: components }
}

function isObject (value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
