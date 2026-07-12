const makeTable = (): Uint32Array => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
};

const crcTable = makeTable();

/**
 * Calculates CRC32 checksum for a given Uint8Array buffer.
 */
export const calculateCRC32 = (buffer: Uint8Array): number => {
  let crc = 0 ^ -1;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
};

/**
 * Helper to format a number as an 8-character hexadecimal CRC32 string.
 */
export const formatCRC32 = (crc: number): string => {
  return crc.toString(16).toUpperCase().padStart(8, '0');
};

/**
 * Class to incrementally calculate CRC32 of stream data/chunks.
 */
export class CRC32Incrementer {
  private crc = 0 ^ -1;

  public update(chunk: Uint8Array): void {
    for (let i = 0; i < chunk.length; i++) {
      this.crc = (this.crc >>> 8) ^ crcTable[(this.crc ^ chunk[i]) & 0xff];
    }
  }

  public finalize(): number {
    return (this.crc ^ -1) >>> 0;
  }

  public reset(): void {
    this.crc = 0 ^ -1;
  }
}
