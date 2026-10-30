import assert from 'assert'
import prismarineRegistry from 'prismarine-registry'
import { bedrockLanguage, bedrockText, rawTextComponent, textComponent, translationComponent } from '../../lib/bedrock/text.ts'
import { latestSupportedBedrockVersion, oldestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import { bedrockTestVersionsFrom } from './common/server.ts'

// The recorded messages are those servers sent the vanilla Bedrock client; the keys tested on every version have the
// same format on all of them.

const GAME_MODE_CHANGED = '{"rawtext":[{"translate":"gameMode.changed","with":{"rawtext":[{"text":"%createWorldScreen.gameMode.survival"}]}}]}\n'

describe('bedrock text', () => {
  describe('every version, with its own language', () => {
    for (const version of bedrockTestVersionsFrom(oldestSupportedBedrockVersion)) {
      it(`bedrock ${version}: reads the recorded messages and every kind of format specifier as the vanilla client shows them`, () => {
        const text = bedrockText(prismarineRegistry(version))
        const died = text.translation('death.attack.generic', ['McZuri5840'])
        assert.deepStrictEqual([died.toString(), died.translate], ['McZuri5840 died', 'death.attack.generic'])
        const joined = text.translation('§e%multiplayer.player.joined', ['observer_bot'])
        assert.deepStrictEqual([joined.toString(), joined.translate], ['observer_bot joined the game', 'multiplayer.player.joined'])
        assert.strictEqual(text.rawText(GAME_MODE_CHANGED)?.toString(), 'Your game mode has been updated to Survival')
        const shown = (key: string, ...parameters: string[]): string => text.translation(key, parameters).toString()
        assert.strictEqual(shown('commands.give.successRecipient', 'Oak Log', '3'), 'You have been given Oak Log * 3')
        assert.strictEqual(shown('commands.time.set', '1000'), 'Set the time to 1000')
        assert.strictEqual(shown('attribute.modifier.plus.1', '50', 'Speed'), '+50%% Speed')
        assert.strictEqual(shown('immersive_reader.book_page_header', '2', '9'), 'Page 2 of 9')
        assert.strictEqual(shown('commands.generic.double.tooBig'), 'The number you have entered (%.2f) is too big, it must be at most %.2f')
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const text = bedrockText(prismarineRegistry(latestSupportedBedrockVersion))
    const { language } = text

    it("rewrites the language's format specifiers as prismarine-chat formats them", () => {
      const formats = { s: '<%s> %s', d: '%d of %d', positional: '%1$d * %2$d, %1$s', bare: 'Page %1 of %2', bareThenDigit: '%12', percent: '%s%% and %d%%', float: '%.2f' }
      assert.deepStrictEqual(bedrockLanguage(formats), {
        s: '<%s> %s',
        d: '%s of %s',
        positional: '%1$s * %2$s, %1$s',
        bare: 'Page %1$s of %2$s',
        // the vanilla client reads one digit
        bareThenDigit: '%1$s2',
        percent: '%s%%%% and %s%%%%',
        float: '%.2f'
      })
      assert.strictEqual(language['commands.time.set'], 'Set the time to %1$s')
      assert.strictEqual(new text.ChatMessage({ translate: 'commands.give.success', with: ['Oak Log', '3', 'McZuri5840'] }).toString(), 'Gave Oak Log * 3 to McZuri5840')
    })

    it('styles the rest of a string with each § code, never showing the code', () => {
      assert.deepStrictEqual(textComponent('§eYellow §lbold §rplain'), { text: '', extra: [{ text: 'Yellow ', color: 'yellow' }, { text: 'bold ', color: 'yellow', bold: true }, { text: 'plain' }] })
      assert.deepStrictEqual(textComponent('§l§o§kall §cand a colour §rnone'), {
        text: '',
        extra: [{ text: 'all ', bold: true, italic: true, obfuscated: true }, { text: 'and a colour ', bold: true, italic: true, obfuscated: true, color: 'red' }, { text: 'none' }]
      })
      assert.deepStrictEqual(textComponent('McZuri5840§r'), { text: 'McZuri5840' })
      assert.deepStrictEqual(textComponent('plain'), { text: 'plain' })
      assert.deepStrictEqual(textComponent(''), { text: '', extra: [] })
      assert.deepStrictEqual(textComponent('§ca§xb§'), { text: '', extra: [{ text: 'a', color: 'red' }, { text: 'b', color: 'red' }] }, 'an unknown code and a § at the end')
      assert.deepStrictEqual(textComponent('a§\nb§😀c'), { text: '', extra: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] }, 'a code is the one character after the §, whichever it is')
      const message = text.text('§eYellow §lbold §rplain')
      assert.deepStrictEqual([message.toString(), message.toMotd()], ['Yellow bold plain', '§eYellow §e§lbold plain'])
    })

    it("has Bedrock's colours: §m and §n are colours, and the material colours", () => {
      const colors: Array<[string, string]> = [
        ['0', 'black'], ['1', 'dark_blue'], ['2', 'dark_green'], ['3', 'dark_aqua'], ['4', 'dark_red'], ['5', 'dark_purple'], ['6', 'gold'], ['7', 'gray'],
        ['8', 'dark_gray'], ['9', 'blue'], ['a', 'green'], ['b', 'aqua'], ['c', 'red'], ['d', 'light_purple'], ['e', 'yellow'], ['f', 'white'],
        ['g', '#DDD605'], ['h', '#E3D4D1'], ['i', '#CECACA'], ['j', '#443A3B'], ['m', '#971607'], ['n', '#B4684D'], ['p', '#DEB12D'], ['q', '#47A036'],
        ['s', '#2CBAA8'], ['t', '#21497B'], ['u', '#9A5CC6'], ['v', '#EB7114']
      ]
      for (const [code, color] of colors) assert.deepStrictEqual(textComponent(`§${code}x`), { text: 'x', color }, code)
      assert.strictEqual(text.text('§gGold').toMotd(), '§#DDD605Gold')
    })

    it('translates a message that is a key with its parameters, and shows any other without % as it is', () => {
      assert.deepStrictEqual(translationComponent('death.attack.generic', ['McZuri5840'], language), { translate: 'death.attack.generic', with: [{ text: 'McZuri5840' }] })
      assert.deepStrictEqual(translationComponent('§cnot a key', ['x'], language), { text: 'not a key', color: 'red' })
      assert.deepStrictEqual(translationComponent('constructor', [], language), { text: 'constructor' })
    })

    it("puts each %key token's format in its place, in the style of the codes before it, and formats the whole message", () => {
      assert.deepStrictEqual(translationComponent('§e%multiplayer.player.joined', ['observer_bot'], language), { translate: 'multiplayer.player.joined', with: [{ text: 'observer_bot' }], color: 'yellow' })
      assert.deepStrictEqual(translationComponent('§e%multiplayer.player.changeToPersona§r', ['observer_bot'], language), { translate: 'multiplayer.player.changeToPersona', with: [{ text: 'observer_bot' }], color: 'yellow' })
      const around = translationComponent('§aBefore %multiplayer.player.left! §lafter %multiplayer.player.joined', ['Steve', 'Alex'], language)
      assert.deepStrictEqual(around, {
        text: '',
        extra: [
          { text: 'Before ', color: 'green' },
          { translate: 'multiplayer.player.left', with: [{ text: 'Steve' }, { text: 'Alex' }], color: 'green' },
          { text: '! ', color: 'green' },
          { text: 'after ', color: 'green', bold: true },
          { translate: 'multiplayer.player.joined', with: [{ text: 'Alex' }], color: 'green', bold: true }
        ]
      })
      assert.strictEqual(text.translation('§aBefore %multiplayer.player.left! §lafter %multiplayer.player.joined', ['Steve', 'Alex']).toString(), 'Before Steve left the game! after Alex joined the game')
      assert.strictEqual(text.translation('%commands.gametips-off.success, %multiplayer.player.joined: ', ['Steve']).toString(), 'Game tips are now disabled, Steve joined the game: ')
    })

    it('shows an unknown token without its %, a lone % as nothing, %% as %, and text that is a key as text', () => {
      assert.deepStrictEqual(translationComponent('%nokey here and %toString', [], language), { text: 'nokey here and toString' })
      assert.deepStrictEqual(translationComponent('100% sure, 100%% sure', [], language), { text: '100 sure, 100% sure' })
      assert.deepStrictEqual(translationComponent('multiplayer.player.left%nokey', [], language), { text: 'multiplayer.player.leftnokey' })
    })

    it('formats the literal text of a message with %: %%s and %%1 are its specifiers, counted with those of its keys', () => {
      assert.deepStrictEqual(translationComponent('§bHello %%s and %%s', ['Steve', 'Alex'], language), { translate: 'Hello %s and %s', with: [{ text: 'Steve' }, { text: 'Alex' }], color: 'aqua' })
      const shown = (message: string, ...parameters: string[]): string => text.translation(message, parameters).toString()
      assert.strictEqual(shown('Hello %%s and %%s', 'Steve', 'Alex'), 'Hello Steve and Alex')
      assert.strictEqual(shown('%%2 before %%1', 'a', 'b'), 'b before a')
      assert.strictEqual(shown('Gave %%d items', '3'), 'Gave 3 items')
      assert.strictEqual(shown('%%s: %multiplayer.player.joined', 'Alex', 'Steve'), 'Alex: Steve joined the game')
      assert.strictEqual(shown('%multiplayer.player.joined, %%s', 'Steve', 'Alex'), 'Steve joined the game, Alex')
      assert.strictEqual(shown('%attribute.modifier.plus.1 %%s', '50', 'Speed', 'fast'), '+50%% Speed fast')
      assert.strictEqual(shown('%commands.give.successRecipient (%%3)', 'Oak Log', '3', 'McZuri5840'), 'You have been given Oak Log * 3 (McZuri5840)')
    })

    it('translates a parameter that is a %key, and keeps the % of one that is not', () => {
      assert.deepStrictEqual(translationComponent('gameMode.changed', ['%createWorldScreen.gameMode.survival'], language), { translate: 'gameMode.changed', with: [{ translate: 'createWorldScreen.gameMode.survival' }] })
      assert.deepStrictEqual(translationComponent('record.nowPlaying', ['%C418 - cat'], language), { translate: 'record.nowPlaying', with: [{ text: '%C418 - cat' }] })
      assert.deepStrictEqual(translationComponent('record.nowPlaying', ['§bblue', 'item.apple.name', 'item.apple.name%', '%constructor'], language), {
        translate: 'record.nowPlaying',
        with: [{ text: 'blue', color: 'aqua' }, { text: 'item.apple.name' }, { text: 'item.apple.name%' }, { text: '%constructor' }]
      })
      assert.strictEqual(text.translation('record.nowPlaying', ['%C418 - cat']).toString(), 'Now playing: %C418 - cat')
    })

    it('reads the recorded rawtext messages', () => {
      assert.deepStrictEqual(rawTextComponent('{"rawtext":[{"text":"observer raw json"}]}\n', language), { text: 'observer raw json' })
      assert.deepStrictEqual(rawTextComponent('{"rawtext":[{"text":"observer "},{"translate":"item.apple.name"}]}\n', language), { text: '', extra: [{ text: 'observer ' }, { translate: 'item.apple.name', with: [] }] })
      assert.strictEqual(text.rawText('{"rawtext":[{"translate":"commands.generic.unknown","with":{"rawtext":[{"text":"observer"}]}}]}\n')?.toString(), 'Unknown command: observer. Please check that the command exists and that you have permission to use it.')
      assert.deepStrictEqual(rawTextComponent(GAME_MODE_CHANGED, language), { translate: 'gameMode.changed', with: [{ translate: 'createWorldScreen.gameMode.survival' }] })
    })

    it("reads a translate's parameters as strings or rawtext, a %key among them translated, and translates it as a text packet's message", () => {
      const shown = (json: string): string | undefined => text.rawText(json)?.toString()
      assert.strictEqual(shown('{"rawtext":[{"translate":"commands.give.successRecipient","with":["%item.apple.name","3"]}]}'), 'You have been given Apple * 3')
      assert.strictEqual(shown('{"rawtext":[{"translate":"commands.give.successRecipient","with":{"rawtext":[{"translate":"item.apple.name"},{"text":"§a2"}]}}]}'), 'You have been given Apple * 2')
      assert.deepStrictEqual(rawTextComponent('{"rawtext":[{"translate":"§cno.such.key","with":["x"]}]}', language), { text: 'no.such.key', color: 'red' })
      assert.strictEqual(shown('{"rawtext":[{"translate":"Hello %%s, you have %%s","with":{"rawtext":[{"selector":"@p"},{"text":"3"}]}}]}'), 'Hello @p, you have 3')
      assert.deepStrictEqual(rawTextComponent('{"rawtext":[{"text":"%item.apple.name"},{"text":"§cred"}]}', language), { text: '', extra: [{ text: '%item.apple.name' }, { text: 'red', color: 'red' }] }, 'a text outside the parameters is never translated')
    })

    it('keeps selectors and scores', () => {
      assert.deepStrictEqual(rawTextComponent('{"rawtext":[{"selector":"@p"},{"score":{"name":"@s","objective":"kills"}}]}', language), { text: '', extra: [{ selector: '@p' }, { score: { name: '@s', objective: 'kills' } }] })
    })

    it('reads nothing the vanilla client would not show: not JSON, not a rawtext object, or any component wrong', () => {
      const invalid = [
        '{"rawtext":', '[]', '"text"', 'null', '{}', '{"rawtext":{}}', '{"rawtext":["text"]}', '{"rawtext":[{}]}', '{"rawtext":[{"text":1}]}',
        '{"rawtext":[{"text":"fine"},{"color":"red"}]}', '{"rawtext":[null]}', '{"rawtext":[{"translate":1}]}', '{"rawtext":[{"selector":1}]}',
        '{"rawtext":[{"translate":"item.apple.name","with":5}]}', '{"rawtext":[{"translate":"item.apple.name","with":["a",1]}]}',
        '{"rawtext":[{"translate":"item.apple.name","with":{"rawtext":"a"}}]}', '{"rawtext":[{"translate":"item.apple.name","with":{"rawtext":[{"bad":1}]}}]}',
        '{"rawtext":[{"score":{"name":"@s"}}]}', '{"rawtext":[{"score":{"objective":"kills"}}]}', '{"rawtext":[{"score":"kills"}]}', '{"rawtext":[{"score":null}]}'
      ]
      for (const json of invalid) {
        assert.strictEqual(rawTextComponent(json, language), undefined, json)
        assert.strictEqual(text.rawText(json), undefined, json)
      }
    })
  })
})
