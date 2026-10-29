import * as mineflayer from './lib/loader.ts'

export * from './lib/loader.ts'
// require('mineflayer') returns the same object as it did before the ES modules (Node >= 22.12)
export { mineflayer as 'module.exports' }
// and import mineflayer from 'mineflayer' too
export default mineflayer
