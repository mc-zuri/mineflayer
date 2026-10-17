const { Vec3 } = require('vec3')

module.exports = inject

const CARDINAL_DIRECTIONS = ['south', 'west', 'north', 'east']

function inject (bot) {
  bot.isSleeping = false

  const beds = new Set(['white_bed', 'orange_bed', 'magenta_bed', 'light_blue_bed', 'yellow_bed', 'lime_bed', 'pink_bed', 'gray_bed',
    'light_gray_bed', 'cyan_bed', 'purple_bed', 'blue_bed', 'brown_bed', 'green_bed', 'red_bed', 'black_bed', 'bed'])

  function isABed (block) {
    return beds.has(block.name)
  }

  function parseBedMetadata (bedBlock) {
    const metadata = {
      part: false, // true: head, false: foot
      occupied: 0,
      facing: 0, // 0: south, 1: west, 2: north, 3 east
      headOffset: new Vec3(0, 0, 1)
    }

    if (bot.supportFeature('blockStateId')) {
      const state = bedBlock.stateId - bot.registry.blocksByStateId[bedBlock.stateId].minStateId
      const bitMetadata = state.toString(2).padStart(4, '0') // FACING (first 2 bits), PART (3rd bit), OCCUPIED (4th bit)
      metadata.part = bitMetadata[3] === '0'
      metadata.occupied = bitMetadata[2] === '0'

      switch (bitMetadata.slice(0, 2)) {
        case '00':
          metadata.facing = 2
          metadata.headOffset.set(0, 0, -1)
          break
        case '10':
          metadata.facing = 1
          metadata.headOffset.set(-1, 0, 0)
          break
        case '11':
          metadata.facing = 3
          metadata.headOffset.set(1, 0, 0)
      }
    } else if (bot.supportFeature('blockMetadata')) {
      const bitMetadata = bedBlock.metadata.toString(2).padStart(4, '0') // PART (1st bit), OCCUPIED (2nd bit), FACING (last 2 bits)
      metadata.part = bitMetadata[0] === '1'
      metadata.occupied = bitMetadata[1] === '1'

      switch (bitMetadata.slice(2, 4)) {
        case '01':
          metadata.facing = 1
          metadata.headOffset.set(-1, 0, 0)
          break
        case '10':
          metadata.facing = 2
          metadata.headOffset.set(0, 0, -1)
          break
        case '11':
          metadata.facing = 3
          metadata.headOffset.set(1, 0, 0)
      }
    }

    return metadata
  }

  async function wake () {
    if (!bot.isSleeping) {
      throw new Error('already awake')
    } else {
      bot._client.write('entity_action', {
        entityId: bot.entity.id,
        actionId: 'stop_sleeping',
        jumpBoost: 0
      })
    }
  }

  async function sleep (bedBlock) {
    const thunderstorm = bot.isRaining && (bot.thunderState > 0)
    if (!thunderstorm && !(bot.time.timeOfDay >= 12541 && bot.time.timeOfDay <= 23458)) {
      throw new Error("it's not night and it's not a thunderstorm")
    } else if (bot.isSleeping) {
      throw new Error('already sleeping')
    } else if (!isABed(bedBlock)) {
      throw new Error('wrong block : not a bed block')
    } else {
      const botPos = bot.entity.position.floored()
      const metadata = parseBedMetadata(bedBlock)
      let headPoint = bedBlock.position

      if (metadata.occupied) {
        throw new Error('the bed is occupied')
      }

      if (!metadata.part) { // Is foot
        const upperBlock = bot.blockAt(bedBlock.position.plus(metadata.headOffset))

        if (isABed(upperBlock)) {
          headPoint = upperBlock.position
        } else {
          const lowerBlock = bot.blockAt(bedBlock.position.plus(metadata.headOffset.scaled(-1)))

          if (isABed(lowerBlock)) {
            // If there are 2 foot parts, minecraft only lets you sleep if you click on the lower one
            headPoint = bedBlock.position
            bedBlock = lowerBlock
          } else {
            throw new Error("there's only half bed")
          }
        }
      }

      if (!bot.canDigBlock(bedBlock)) {
        throw new Error('cant click the bed')
      }

      const clickRange = [2, -3, -3, 2] // [south, west, north, east]
      const monsterRange = [7, -8, -8, 7]
      const oppositeCardinal = (metadata.facing + 2) % CARDINAL_DIRECTIONS.length

      if (clickRange[oppositeCardinal] < 0) {
        clickRange[oppositeCardinal]--
      } else {
        clickRange[oppositeCardinal]++
      }

      const nwClickCorner = headPoint.offset(clickRange[1], -2, clickRange[2]) // North-West lower corner
      const seClickCorner = headPoint.offset(clickRange[3], 2, clickRange[0]) // South-East upper corner
      if (botPos.x > seClickCorner.x || botPos.x < nwClickCorner.x || botPos.y > seClickCorner.y || botPos.y < nwClickCorner.y || botPos.z > seClickCorner.z || botPos.z < nwClickCorner.z) {
        throw new Error('the bed is too far')
      }

      if (bot.game.gameMode !== 'creative' || bot.supportFeature('creativeSleepNearMobs')) { // If in creative mode the bot should be able to sleep even if there are monster nearby (starting in 1.13)
        const nwMonsterCorner = headPoint.offset(monsterRange[1], -6, monsterRange[2]) // North-West lower corner
        const seMonsterCorner = headPoint.offset(monsterRange[3], 4, monsterRange[0]) // South-East upper corner

        for (const key of Object.keys(bot.entities)) {
          const entity = bot.entities[key]
          if (entity.kind === 'Hostile mobs') {
            const entityPos = entity.position.floored()
            if (entityPos.x <= seMonsterCorner.x && entityPos.x >= nwMonsterCorner.x && entityPos.y <= seMonsterCorner.y && entityPos.y >= nwMonsterCorner.y && entityPos.z <= seMonsterCorner.z && entityPos.z >= nwMonsterCorner.z) {
              throw new Error('there are monsters nearby')
            }
          }
        }
      }

      // We need to register the listener before actually going to sleep to avoid race conditions
      const waitingPromise = waitUntilSleep()
      bot.activateBlock(bedBlock)
      await waitingPromise
    }
  }

  async function waitUntilSleep () {
    return new Promise((resolve, reject) => {
      const timeoutForSleep = setTimeout(() => {
        reject(new Error('bot is not sleeping'))
      }, 3000)

      bot.once('sleep', () => {
        clearTimeout(timeoutForSleep)
        resolve()
      })
    })
  }

  bot._client.on('game_state_change', (packet) => {
    if (packet.reason === 0 || packet.reason === 'no_respawn_block_available') {
      // occurs when you can't spawn in your bed and your spawn point gets reset
      bot.emit('spawnReset')
    }
  })

  bot.on('entitySleep', (entity) => {
    if (entity === bot.entity) {
      bot.isSleeping = true
      bot.emit('sleep')
    }
  })

  // 1.14 - 1.15: the bed the player sleeps in (LivingEntity.SLEEPING_POS_ID, after the entity's and the living entity's
  // data: 12 on 1.14, 13 on 1.15 after the bee stingers)
  const standsUpOnClient = bot.registry.version['>=']('1.14') && bot.registry.version['<']('1.16')
  const sleepingPosKey = bot.registry.version['<']('1.15') ? 12 : 13
  let sleepingPos = null
  bot._client.on('entity_metadata', (packet) => {
    if (!standsUpOnClient || packet.entityId !== bot.entity?.id) return
    const entry = packet.metadata.find(entry => entry.key === sleepingPosKey)
    if (entry) sleepingPos = entry.value && typeof entry.value === 'object' ? new Vec3(entry.value.x, entry.value.y, entry.value.z) : null
  })

  // 1.14 - 1.15: the server's wake-up stands the player up on the client at once (ClientPacketListener.handleAnimate:
  // LivingEntity.stopSleeping), where BedBlock.findStandUpPosition finds room around the bed, else above it
  function standUp () {
    const bed = sleepingPos
    sleepingPos = null
    const bedBlock = bed && bot.blockAt(bed)
    if (!bedBlock || !isABed(bedBlock)) return
    const facing = bedBlock.getProperties().facing
    const [dx, dz] = { east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] }[facing] ?? [0, 0]
    let at = null
    for (let m = 0; m <= 1 && !at; m++) {
      const x0 = bed.x - dx * m - 1
      const z0 = bed.z - dz * m - 1
      for (let x = x0; x <= x0 + 2 && !at; x++) {
        for (let z = z0; z <= z0 + 2 && !at; z++) at = standingLocationAtOrBelow(new Vec3(x, bed.y, z))
      }
    }
    if (!at) at = new Vec3(bed.x + 0.5, bed.y + 1 + 0.1, bed.z + 0.5)
    bot.entity.position.set(at.x, at.y, at.z)
  }
  // BedBlock.getStandingLocationAtOrBelow: no taller than 7/16 there, then down to the first block that collides (two at
  // most), on its top, where the player's box has room
  const topOf = block => block?.shapes?.length ? Math.max(...block.shapes.map(shape => shape[4])) : null
  function standingLocationAtOrBelow (pos) {
    const own = topOf(bot.blockAt(pos))
    if (own !== null && own > 0.4375) return null
    const below = pos.clone()
    while (below.y >= 0 && pos.y - below.y <= 2 && topOf(bot.blockAt(below)) === null) below.y--
    const top = topOf(bot.blockAt(below))
    if (top === null) return null
    const y = below.y + top + 2.0E-7
    if (pos.y - y > 2) return null
    const at = new Vec3(below.x + 0.5, y, below.z + 0.5)
    const [x0, y0, z0, x1, y1, z1] = [at.x - 0.3, at.y, at.z - 0.3, at.x + 0.3, at.y + 1.8, at.z + 0.3]
    for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
      for (let yy = Math.floor(y0) - 1; yy <= Math.floor(y1); yy++) {
        for (let z = Math.floor(z0); z <= Math.floor(z1); z++) {
          const block = bot.blockAt(new Vec3(x, yy, z))
          const hit = (block?.shapes ?? []).some(([a, b, c, d, e, f]) => x + a < x1 && x + d > x0 && yy + b < y1 && yy + e > y0 && z + c < z1 && z + f > z0)
          if (hit) return null
        }
      }
    }
    return at
  }

  bot.on('entityWake', (entity) => {
    if (entity === bot.entity) {
      if (standsUpOnClient) standUp()
      bot.isSleeping = false
      bot.emit('wake')
    }
  })

  bot.parseBedMetadata = parseBedMetadata
  bot.wake = wake
  bot.sleep = sleep
  bot.isABed = isABed
}
