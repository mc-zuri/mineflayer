import particleLoader from '../particle.ts'

export default inject

function inject (bot, { version }) {
  const Particle = particleLoader(bot.registry)

  bot._client.on('world_particles', (packet) => {
    bot.emit('particle', Particle.fromNetwork(packet))
  })
}
