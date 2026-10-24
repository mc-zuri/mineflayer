import type { BedrockBot } from '../../index.js';

export default function inject(bot: BedrockBot) {
  bot._client.on('disconnect', (packet) => {
    const kicked = packet.reason.indexOf('kick') !== -1;
    // (the message is empty for some reasons, invalid_name among them)
    bot.emit('kicked', packet.message || packet.reason, kicked);
  });
  // (bedrock-protocol's client has no end(), and its disconnect() writes field names the disconnect packet lacks)
  bot.end = (reason) => {
    const client = bot._client as any;
    client.write('disconnect', { reason: 'unknown', hide_disconnect_reason: false, message: reason ?? '', filtered_message: '' });
    client.close();
  };
  bot.quit = (reason) => {
    reason = reason ?? 'disconnect.quitting';
    bot.end(reason);
  };
}
