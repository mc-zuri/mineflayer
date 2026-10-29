// minecraft-protocol's typings, augmented with what they leave out of its runtime (docs/typescript/api-mismatches.md).
import type { Client, ClientOptions } from 'minecraft-protocol'

declare module 'minecraft-protocol' {
  /** createClient sets version: false itself when none is given, to ask the server for its version */
  export function createClient (options: Omit<ClientOptions, 'version'> & { version?: string | false }): Client
}
