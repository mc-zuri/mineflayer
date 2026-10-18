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

  // The monsters that keep a player from sleeping (ServerPlayer.startSleepInBed, before 1.16 Player.startSleepInBed /
  // trySleep): those of vanilla's Monster class (EntityMob before 1.13), and not the other hostile mobs (slimes, ghasts,
  // phantoms, shulkers, hoglins, the dragon). From 1.12 a zombified piglin keeps one awake only when angry at it
  // (isPreventingPlayerRest), which the client does not know.
  const monsters = new Set(['blaze', 'bogged', 'breeze', 'cave_spider', 'creaking', 'creeper', 'drowned', 'elder_guardian',
    'enderman', 'endermite', 'evoker', 'evocation_illager', 'giant', 'guardian', 'husk', 'illusioner', 'illusion_illager',
    'parched', 'piglin', 'piglin_brute', 'pillager', 'ravager', 'silverfish', 'skeleton', 'spider', 'stray', 'vex',
    'vindicator', 'vindication_illager', 'warden', 'witch', 'wither', 'wither_skeleton', 'zoglin', 'zombie',
    'zombie_villager',
    // (before 1.11)
    'Blaze', 'CaveSpider', 'Creeper', 'Enderman', 'Endermite', 'Giant', 'Guardian', 'PigZombie', 'Silverfish',
    'Skeleton', 'Spider', 'WitherBoss', 'Witch', 'Zombie',
    // (1.11 - 1.15: from 1.12 isPreventingPlayerRest leaves it out, but when angry)
    'zombie_pigman'])
  const preventsRest = bot.registry.version['>=']('1.12') ? name => monsters.has(name) && name !== 'zombie_pigman' : name => monsters.has(name)

  // ServerPlayer.startSleepInBed: a monster whose box meets the box 8 blocks around the bed's head and 5 up and down,
  // from 1.15 around the bottom center of the block (Vec3.atBottomCenterOf), before that around its corner
  // (AABB.intersects: the boxes overlap, not only touch)
  function isMonsterNearby (headPoint) {
    const center = bot.registry.version['>=']('1.15') ? headPoint.offset(0.5, 0, 0.5) : headPoint
    const [x0, y0, z0, x1, y1, z1] = [center.x - 8, center.y - 5, center.z - 8, center.x + 8, center.y + 5, center.z + 8]
    return Object.values(bot.entities).some(entity => {
      if (entity === bot.entity || !preventsRest(entity.name)) return false
      const { x, y, z } = entity.position
      const halfWidth = (entity.width ?? 0) / 2
      return x - halfWidth < x1 && x + halfWidth > x0 && y < y1 && y + (entity.height ?? 0) > y0 && z - halfWidth < z1 && z + halfWidth > z0
    })
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

      // from 1.13 a player in creative sleeps whatever is about (ServerPlayer.startSleepInBed: !isCreative())
      if (!bot.supportFeature('creativeSleepNearMobs') || bot.game.gameMode !== 'creative') {
        if (isMonsterNearby(headPoint)) throw new Error('there are monsters nearby')
      }

      // We need to register the listener before actually going to sleep to avoid race conditions
      const waitingPromise = waitUntilSleep()
      bot.activateBlock(bedBlock)
      await waitingPromise
    }
  }

  // The server's refusal of the bed, as vanilla's client gets it: the message of BedBlock.use (Player.BedSleepingProblem,
  // from 1.21.11 the dimension's BedRule, an occupied bed), in the chat before 1.12 and above the hotbar since. Before
  // 1.13 tile.bed.*, then block.minecraft.bed.* (1.15's set_spawn only tells the spawn was set).
  const refusals = {
    'tile.bed.noSleep': "it's not night and it's not a thunderstorm",
    'tile.bed.notSafe': 'there are monsters nearby',
    'tile.bed.tooFarAway': 'the bed is too far',
    'tile.bed.occupied': 'the bed is occupied',
    'block.minecraft.bed.no_sleep': "it's not night and it's not a thunderstorm",
    'block.minecraft.bed.not_safe': 'there are monsters nearby',
    'block.minecraft.bed.too_far_away': 'the bed is too far',
    'block.minecraft.bed.obstructed': 'the bed is obstructed',
    'block.minecraft.bed.occupied': 'the bed is occupied'
  }
  function refusalOf (message) {
    const key = message?.translate
    if (typeof key !== 'string' || !/^(tile\.bed\.|block\.minecraft\.bed\.)/.test(key) || key === 'block.minecraft.bed.set_spawn') return null
    return Object.assign(new Error(refusals[key] ?? message.toString()), { translate: key })
  }

  // the bot asleep, the server's refusal, or, as a fail-safe for a refusal without a message (the server answers within
  // its tick), nothing in 60 of the bot's ticks (the old 3 seconds at 20 a second)
  const SLEEP_TICKS = 60
  async function waitUntilSleep () {
    return new Promise((resolve, reject) => {
      let ticks = 0
      const done = () => {
        bot.removeListener('sleep', onSleep)
        bot.removeListener('message', onMessage)
        bot.removeListener('physicsTickBegin', onTick)
      }
      const onSleep = () => {
        done()
        resolve()
      }
      const onMessage = (message) => {
        const refusal = refusalOf(message)
        if (!refusal) return
        done()
        reject(refusal)
      }
      const onTick = () => {
        if (++ticks < SLEEP_TICKS) return
        done()
        reject(new Error('bot is not sleeping'))
      }
      bot.on('sleep', onSleep)
      bot.on('message', onMessage)
      bot.on('physicsTickBegin', onTick)
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
