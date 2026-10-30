// bedrock-protocol's packet codec, which its typings leave out
declare module 'bedrock-protocol/src/transforms/serializer.js' {
  export interface PacketToWrite {
    name: string
    params: object
  }

  export interface ParsedPacket {
    data: {
      /** the raw id, and params undefined, when the protocol has no packet with that id */
      name: string | number
      params: object | undefined
    }
    metadata: {
      size: number
    }
    buffer: Buffer
    fullBuffer: Buffer
  }

  export interface Serializer {
    /** a name the protocol does not have is written as id 0 */
    createPacketBuffer (packet: PacketToWrite): Buffer
  }

  export interface Deserializer {
    parsePacketBuffer (buffer: Buffer): ParsedPacket
  }

  export function createSerializer (version: string): Serializer
  export function createDeserializer (version: string): Deserializer
}
