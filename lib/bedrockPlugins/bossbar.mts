import type { BedrockBot } from '../../index.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export default function inject(bot: BedrockBot) {
  const BossBar = require('../bossbar')(bot.registry);
  const bars: Record<string, any> = {};

  bot.on('entityGone', (entity) => {
    if (!entity) return;
    if (!(entity.unique_id in bars)) return;
    bot.emit('bossBarDeleted', bars[entity.unique_id]);
    delete bars[entity.unique_id];
  });

  bot._client.on('boss_event', (packet) => {
    // 1.26.30+ names the boss target_entity_id and writes every field whatever the event is
    const bossId = packet.boss_entity_id ?? packet.target_entity_id;
    if (packet.type === 'show_bar') {
      let flags = 0;

      if (packet.screen_darkening === 1) {
        flags |= 0x1;
      }

      bars[bossId] = new BossBar(bossId, packet.title, getBossHealth(bossId), 4, packet.color, flags);

      bot._client.write('boss_event', {
        boss_entity_id: bossId,
        target_entity_id: bossId,
        type: 'register_player',
        player_id: bot.entity.unique_id,
        title: '',
        filtered_title: '',
        progress: 0,
        color: 'pink',
        overlay: 'progress',
      });

      bot.emit('bossBarCreated', bars[bossId]);
    } else if (packet.type === 'set_bar_progress') {
      if (!(bossId in bars)) {
        return;
      }

      bars[bossId].health = getBossHealth(bossId);

      bot.emit('bossBarUpdated', bars[bossId]);
    }
  });

  function getBossHealth(boss_id: string | number) {
    let boss_entity = (bot as any).fetchEntity(boss_id);

    let boss_health = 0;

    if ('minecraft:health' in boss_entity.attributes) {
      boss_health = boss_entity.attributes['minecraft:health'].value;
    }

    return boss_health;
  }

  Object.defineProperty(bot, 'bossBars', {
    get() {
      return Object.values(bars);
    },
  });
}
