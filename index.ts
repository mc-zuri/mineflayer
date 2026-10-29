import * as mineflayer from './lib/loader.ts'

if (typeof process !== 'undefined' && !process.browser && process.platform !== 'browser' && parseInt(process.versions.node.split('.')[0]) < 18) {
  console.error('Your node version is currently', process.versions.node)
  console.error('Please update it to a version >= 22.x.x from https://nodejs.org/')
  process.exit(1)
}

export * from './lib/loader.ts'
// require('mineflayer') returns the same object as it did before the ES modules (Node >= 22.12)
export { mineflayer as 'module.exports' }
// and import mineflayer from 'mineflayer' too
export default mineflayer
