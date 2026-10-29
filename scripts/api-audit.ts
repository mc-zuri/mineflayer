// The API three ways: what docs/api.md documents, what the public typings (lib/types/api) declare and what a bot
// has at run time. `node scripts/api-audit.ts` prints where they disagree; test/apiAuditTest.ts keeps the
// disagreements to the list in test/apiAudit.snapshot.json, which shrinks as they are fixed
// (`node scripts/api-audit.ts --update` rewrites it). docs/typescript/api-mismatches.md explains each.
//
// - docs: the headings of api.md: `bot.<path>` and `bot.<path>(<params>)` from "## Bot" on, the `"<event>" (...)`
//   headings of "### Events", and `<class>.<member>` in "## Classes".
// - types: the Bot interface, BotEvents and the classes of lib/types/api/index.ts, read with the TypeScript compiler
//   API (the typescript package is TypeScript 6, the one with an API).
// - runtime: a bot logged in to a mock server of the latest supported version; its events are the names the sources
//   pass to bot.emit.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import mc from 'minecraft-protocol'
import prismarineRegistry from 'prismarine-registry'
import ts from 'typescript'
import { createBot } from '../index.ts'
import { once } from '../lib/promise_utils.ts'
import { latestSupportedVersion } from '../lib/version.ts'
import { getPort } from '../test/common/util.ts'

const root = path.resolve(import.meta.dirname, '..')
export const snapshotFile = path.join(root, 'test', 'apiAudit.snapshot.json')

export type Kind = 'method' | 'property'

export interface Member {
  /** the path below bot (or the class), e.g. game.levelType */
  path: string
  kind: Kind
  /** the parameter names, for a method */
  params: string[]
}

export interface ApiSide {
  members: Map<string, Member>
  events: Map<string, string[]>
  classes: Map<string, Map<string, Member>>
}

const paramsOf = (list: string): string[] => {
  // split on top-level commas: `match = (entity) => { return true }` is one parameter
  const params: string[] = []
  let depth = 0
  let current = ''
  for (const char of list) {
    if ('([{'.includes(char)) depth++
    if (')]}'.includes(char)) depth--
    if (char === ',' && depth === 0) {
      params.push(current)
      current = ''
    } else current += char
  }
  params.push(current)
  return params
    .map(param => param.trim().replace(/^\[|\]$/g, '').replace(/^\.\.\./, '').split(/[=:?\s[]/)[0]!.trim())
    .filter(name => name !== '' && name !== '...')
}

/** the members, events and classes docs/api.md documents */
export function docsSide (file = path.join(root, 'docs', 'api.md')): ApiSide {
  const side: ApiSide = { members: new Map(), events: new Map(), classes: new Map() }
  let section = ''
  let currentClass: Map<string, Member> | undefined
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const heading = /^(#{2,5}) (.+)$/.exec(line)
    if (heading === null) continue
    const [, hashes = '', title = ''] = heading
    if (hashes === '##') { section = title; currentClass = undefined; continue }
    if (section === 'Classes' && hashes === '###') {
      const name = /^(?:mineflayer\.|windows\.)?([A-Za-z]+)/.exec(title)?.[1]
      currentClass = name === undefined ? undefined : new Map()
      if (name !== undefined && currentClass !== undefined) side.classes.set(name.toLowerCase(), currentClass)
      continue
    }
    if (section === 'Classes') {
      const member = /^([A-Za-z]+)\.([A-Za-z_]+)(\(([^)]*)\))?/.exec(title)
      if (member !== null && currentClass !== undefined) {
        const [, , name = '', call, list = ''] = member
        currentClass.set(name, { path: name, kind: call === undefined ? 'property' : 'method', params: call === undefined ? [] : paramsOf(list) })
      }
      continue
    }
    if (section !== 'Bot') continue
    const event = /^"([^"]+)"\s*(?:\((.*)\))?/.exec(title)
    if (event !== null && hashes === '####') {
      const [, name = '', list = ''] = event
      side.events.set(name, paramsOf(list))
      continue
    }
    const member = /^bot\.([A-Za-z_][\w.]*?) ?(?:\((.*)\))?(?:\s.*)?$/.exec(title)
    if (member !== null) {
      const [, memberPath = '', list] = member
      // a documented parent (bot.game) of a documented child (bot.game.levelType) is a property
      for (let i = memberPath.indexOf('.'); i !== -1; i = memberPath.indexOf('.', i + 1)) {
        const parent = memberPath.slice(0, i)
        if (!side.members.has(parent)) side.members.set(parent, { path: parent, kind: 'property', params: [] })
      }
      side.members.set(memberPath, { path: memberPath, kind: list === undefined ? 'property' : 'method', params: list === undefined ? [] : paramsOf(list) })
    }
  }
  return side
}

/** the members, events and classes the public typings declare */
export function typesSide (file = path.join(root, 'lib', 'types', 'api', 'index.ts')): ApiSide {
  const program = ts.createProgram([file], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ESNext,
    allowImportingTsExtensions: true,
    noEmit: true,
    strict: true,
    skipLibCheck: true
  })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(file)
  if (source === undefined) throw new Error(`cannot read ${file}`)
  const moduleSymbol = checker.getSymbolAtLocation(source)
  if (moduleSymbol === undefined) throw new Error(`${file} is not a module`)
  const exports = new Map(checker.getExportsOfModule(moduleSymbol).map(symbol => [symbol.getName(), symbol]))
  const declaredType = (name: string): ts.Type => {
    const symbol = exports.get(name)
    if (symbol === undefined) throw new Error(`lib/types/api exports no ${name}`)
    return checker.getDeclaredTypeOfSymbol(symbol)
  }

  const membersOf = (type: ts.Type, prefix: string, into: Map<string, Member>, depth: number): void => {
    for (const property of checker.getPropertiesOfType(type)) {
      const name = property.getName()
      const declaration = property.valueDeclaration ?? property.declarations?.[0]
      if (declaration === undefined) continue
      const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration)
      const signatures = checker.getNonNullableType(propertyType).getCallSignatures()
      const memberPath = prefix + name
      // an overloaded method's parameters are its longest overload's
      const longest = signatures.reduce<ts.Signature | undefined>((best, signature) => best === undefined || signature.getParameters().length > best.getParameters().length ? signature : best, undefined)
      const params = longest?.getParameters().map(parameter => parameter.getName()) ?? []
      into.set(memberPath, { path: memberPath, kind: signatures.length > 0 ? 'method' : 'property', params })
      // the objects below bot whose type is an interface or object literal of the typings (bot.game, bot.settings,
      // bot.creative...), not a dependency's class (bot.entity) nor an array
      const nested = checker.getNonNullableType(propertyType)
      const nestedDeclaration = nested.getSymbol()?.declarations?.[0]
      if (depth > 0 && signatures.length === 0 && !checker.isArrayType(nested) && nestedDeclaration !== undefined &&
          nestedDeclaration.getSourceFile().fileName === source.fileName &&
          (ts.isInterfaceDeclaration(nestedDeclaration) || ts.isTypeLiteralNode(nestedDeclaration))) {
        membersOf(nested, `${memberPath}.`, into, depth - 1)
      }
    }
  }

  const side: ApiSide = { members: new Map(), events: new Map(), classes: new Map() }
  const bot = declaredType('Bot')
  // EventEmitter's own methods (on, once, emit...) are not the bot's API
  const emitterMethods = new Set(['addListener', 'on', 'once', 'prependListener', 'prependOnceListener', 'off', 'removeAllListeners', 'removeListener', 'emit', 'eventNames', 'rawListeners', 'listeners', 'listenerCount', 'getMaxListeners', 'setMaxListeners'])
  membersOf(bot, '', side.members, 2)
  for (const name of emitterMethods) side.members.delete(name)

  for (const event of checker.getPropertiesOfType(declaredType('BotEvents'))) {
    const declaration = event.valueDeclaration ?? event.declarations?.[0]
    if (declaration === undefined) continue
    const signature = checker.getTypeOfSymbolAtLocation(event, declaration).getCallSignatures()[0]
    side.events.set(event.getName(), signature?.getParameters().map(parameter => parameter.getName()) ?? [])
  }

  for (const name of ['Furnace', 'EnchantmentTable', 'Anvil', 'Villager', 'ScoreBoard', 'Team', 'BossBar', 'Particle', 'Chest', 'Location', 'Painting']) {
    const members = new Map<string, Member>()
    membersOf(declaredType(name), '', members, 0)
    // a class's own members: what it inherits (a Window's) is documented with its base class
    const declarations = exports.get(name)?.declarations ?? []
    for (const member of [...members.keys()]) {
      const owner = declaredType(name).getProperty(member)?.declarations?.[0]?.parent
      if (owner === undefined || !declarations.includes(owner as ts.Declaration)) members.delete(member)
    }
    side.classes.set(name.toLowerCase(), members)
  }
  return side
}

/**
 * the names the sources emit bot events under, a template's static part as <name>*: bot.emit('<name>') and
 * bot.emit(`<prefix>${...}`), the names in the tables events are emitted from by a variable (animationEvents,
 * entityStatusEvents, forwardedEvents), chat patterns' names (a pattern emits its name and chat:<name>) and the
 * blockUpdate:(x, y, z) events the bot forwards from its world
 */
export function emittedEvents (dir = path.join(root, 'lib')): Set<string> {
  const names = new Set<string>()
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const file = path.join(current, entry)
      if (statSync(file).isDirectory()) { walk(file); continue }
      if (!file.endsWith('.ts')) continue
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/\bbot\.emit\(\s*(['`])([^'`$]*)(\$\{)?/g)) {
        names.add(match[3] === undefined ? match[2]! : `${match[2]}*`)
      }
      for (const table of text.matchAll(/\b\w*[Ee]vents\s*=\s*([[{])([^\]}]*)[\]}]/g)) {
        for (const name of table[2]!.matchAll(/'([A-Za-z_]+)'/g)) names.add(name[1]!)
      }
      for (const pattern of text.matchAll(/\baddChatPattern(?:Set)?\(\s*'([^']+)'/g)) names.add(pattern[1]!)
      // blocks forwards a listener of blockUpdate:(x, y, z) to the world, which emits it
      if (text.includes('blockUpdate:\\(')) names.add('blockUpdate:*')
    }
  }
  walk(dir)
  return names
}

/** an event name with a placeholder, as the docs and the typings write it, as <prefix>*: blockUpdate:(x, y, z), chat:name */
const eventPattern = (name: string): string => name.replace(/\(x, y, z\)$/, '*').replace(/:name$/, ':*')

export interface Audit {
  /** documented, but the typings do not declare it */
  docsNotInTypes: string[]
  /** declared, but not documented */
  typesNotInDocs: string[]
  /** documented, but a logged-in bot does not have it */
  docsNotAtRuntime: string[]
  /** a logged-in bot has it, but it is not documented */
  runtimeNotInDocs: string[]
  /** declared, but a logged-in bot does not have it */
  typesNotAtRuntime: string[]
  /** a logged-in bot has it, but the typings do not declare it */
  runtimeNotInTypes: string[]
  /** documented as a method and declared as a property, or the other way round, or a function at run time that is not one in the docs or the typings */
  kindMismatches: string[]
  /** a documented method whose documented parameters are not the ones declared (by count) */
  paramMismatches: string[]
  eventsDocsNotInTypes: string[]
  eventsTypesNotInDocs: string[]
  /** documented or declared, but nothing in lib emits it */
  eventsNeverEmitted: string[]
  /** emitted, but neither documented nor declared */
  eventsEmittedNotDeclared: string[]
  /** class members: <class>.<member> */
  classDocsNotInTypes: string[]
  classTypesNotInDocs: string[]
}

export type RuntimeBot = Record<string, unknown>

/**
 * members a logged-in bot only has once a later packet assigned them (the mock server sends the login, a position
 * and the health): the packet that assigns each
 */
export const assignedByLaterPackets: Record<string, string> = {
  'game.difficulty': 'difficulty (or, before 1.14, the login)',
  'game.serverBrand': 'custom_payload on the brand channel',
  player: 'player_info listing the bot',
  oxygenLevel: "entity_metadata of the bot's air supply"
}

const has = (object: unknown, memberPath: string): { found: boolean, value?: unknown } => {
  let current: unknown = object
  for (const part of memberPath.split('.')) {
    if (current === null || current === undefined || (typeof current !== 'object' && typeof current !== 'function') || !(part in current)) return { found: false }
    current = (current as Record<string, unknown>)[part]
  }
  return { found: true, value: current }
}

/** compares the three sides; runtime is a logged-in bot, or undefined to leave the run time out */
export function audit (docs: ApiSide, types: ApiSide, runtime: RuntimeBot | undefined, emitted: Set<string>): Audit {
  const sorted = (values: Iterable<string>): string[] => [...values].sort()
  const result: Audit = {
    docsNotInTypes: [],
    typesNotInDocs: [],
    docsNotAtRuntime: [],
    runtimeNotInDocs: [],
    typesNotAtRuntime: [],
    runtimeNotInTypes: [],
    kindMismatches: [],
    paramMismatches: [],
    eventsDocsNotInTypes: [],
    eventsTypesNotInDocs: [],
    eventsNeverEmitted: [],
    eventsEmittedNotDeclared: [],
    classDocsNotInTypes: [],
    classTypesNotInDocs: []
  }

  for (const [memberPath, member] of docs.members) {
    const declared = types.members.get(memberPath)
    if (declared === undefined) result.docsNotInTypes.push(memberPath)
    else {
      if (declared.kind !== member.kind) result.kindMismatches.push(`${memberPath}: docs ${member.kind}, types ${declared.kind}`)
      else if (member.kind === 'method' && declared.params.length !== member.params.length) {
        result.paramMismatches.push(`${memberPath}: docs (${member.params.join(', ')}), types (${declared.params.join(', ')})`)
      }
    }
  }
  // the fields of an object below bot are compared only where the docs list them one by one (bot.game.*, not bot.physics)
  const brokenDown = (memberPath: string): boolean => {
    const parent = memberPath.slice(0, memberPath.lastIndexOf('.'))
    return parent === '' || [...docs.members.keys()].some(documented => documented.startsWith(`${parent}.`))
  }
  for (const memberPath of types.members.keys()) {
    if (!docs.members.has(memberPath) && brokenDown(memberPath)) result.typesNotInDocs.push(memberPath)
  }

  if (runtime !== undefined) {
    for (const [memberPath, member] of docs.members) {
      if (memberPath in assignedByLaterPackets) continue
      const { found, value } = has(runtime, memberPath)
      if (!found) result.docsNotAtRuntime.push(memberPath)
      else if (member.kind === 'method' && typeof value !== 'function') result.kindMismatches.push(`${memberPath}: docs method, runtime ${typeof value}`)
    }
    for (const [memberPath, member] of types.members) {
      if (!brokenDown(memberPath) || memberPath in assignedByLaterPackets) continue
      const { found, value } = has(runtime, memberPath)
      if (!found) result.typesNotAtRuntime.push(memberPath)
      else if (member.kind === 'method' && typeof value !== 'function' && value !== undefined && value !== null) result.kindMismatches.push(`${memberPath}: types method, runtime ${typeof value}`)
    }
    const internal = (name: string): boolean => name.startsWith('_') || name === 'test' || name === 'domain'
    for (const name of Object.keys(runtime)) {
      if (internal(name)) continue
      if (!docs.members.has(name)) result.runtimeNotInDocs.push(name)
      if (!types.members.has(name)) result.runtimeNotInTypes.push(name)
    }
  }

  for (const name of docs.events.keys()) if (!types.events.has(name)) result.eventsDocsNotInTypes.push(name)
  for (const name of types.events.keys()) if (!docs.events.has(name)) result.eventsTypesNotInDocs.push(name)
  const matchesEmitted = (name: string): boolean => {
    const pattern = eventPattern(name)
    return emitted.has(pattern) || [...emitted].some(emittedName => emittedName.endsWith('*') && pattern.startsWith(emittedName.slice(0, -1)))
  }
  for (const name of new Set([...docs.events.keys(), ...types.events.keys()])) if (!matchesEmitted(name)) result.eventsNeverEmitted.push(name)
  for (const name of emitted) {
    const declared = (names: Iterable<string>): boolean => [...names].map(eventPattern).some(declaredName => declaredName === name || (name.endsWith('*') && declaredName.startsWith(name.slice(0, -1))))
    if (!declared(docs.events.keys()) && !declared(types.events.keys())) result.eventsEmittedNotDeclared.push(name)
  }

  for (const [name, members] of docs.classes) {
    const declared = types.classes.get(name)
    if (declared === undefined) continue
    for (const member of members.keys()) if (!declared.has(member)) result.classDocsNotInTypes.push(`${name}.${member}`)
  }
  for (const [name, members] of types.classes) {
    const documented = docs.classes.get(name)
    if (documented === undefined) continue
    for (const member of members.keys()) if (!documented.has(member)) result.classTypesNotInDocs.push(`${name}.${member}`)
  }

  for (const key of Object.keys(result) as Array<keyof Audit>) result[key] = sorted(result[key])
  return result
}

/** a bot logged in to a mock server: the login, a position and its health, as the internal tests send them */
export async function loggedInBot (version = latestSupportedVersion): Promise<{ bot: RuntimeBot, close: () => void }> {
  const port = await getPort()
  const server = mc.createServer({ 'online-mode': false, version, port })
  await once(server, 'listening')
  const registry = prismarineRegistry(version)
  server.on('playerJoin', (client) => {
    client.write('login', { ...registry.loginPacket, entityId: 0 })
    client.write('position', { x: 0.5, y: 80, z: 0.5, yaw: 0, pitch: 0, flags: 0, teleportId: 0 })
    client.write('update_health', { health: 20, food: 20, foodSaturation: 0 })
  })
  const bot = createBot({ username: 'player', version, port, hideErrors: true })
  await once(bot, 'spawn')
  return {
    bot,
    close: () => {
      bot.end()
      server.close()
    }
  }
}

if (import.meta.main) {
  const { bot, close } = await loggedInBot()
  try {
    const result = JSON.stringify(audit(docsSide(), typesSide(), bot, emittedEvents()), null, 2) + '\n'
    if (process.argv.includes('--update')) writeFileSync(snapshotFile, result)
    else process.stdout.write(result)
  } finally {
    close()
  }
}
