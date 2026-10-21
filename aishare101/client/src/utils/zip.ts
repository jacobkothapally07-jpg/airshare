import { calculateCRC32 } from './crc32';

export interface ZipFileInput {
  name: string;
  blob: Blob;
}

/**
 * Creates a standard uncompressed ZIP archive (Store method 0) in-browser
 * with zero external dependencies. Compatible with Windows Explorer, macOS, and Linux.
 */
export async function createZipArchive(files: ZipFileInput[]): Promise<Blob> {
  const parts: Uint8Array[] = [];
  const centralDirParts: Uint8Array[] = [];
  let currentOffset = 0;

  const encoder = new TextEncoder();

  for (const file of files) {
    const arrayBuffer = await file.blob.arrayBuffer();
    const fileBytes = new Uint8Array(arrayBuffer);
    const fileNameBytes = encoder.encode(file.name);
    const crc = calculateCRC32(fileBytes);
    const size = fileBytes.length;

    // --- Local File Header (30 bytes + filename) ---
    const localHeader = new Uint8Array(30 + fileNameBytes.length);
    const lv = new DataView(localHeader.buffer);

    lv.setUint32(0, 0x04034b50, true); // Local header signature
    lv.setUint16(4, 20, true);          // Version needed (2.0)
    lv.setUint16(6, 0x0800, true);      // General purpose bit flag (UTF-8)
    lv.setUint16(8, 0, true);           // Compression: 0 = Store
    lv.setUint16(10, 0, true);          // File mod time
    lv.setUint16(12, 0, true);          // File mod date
    lv.setUint32(14, crc, true);        // CRC-32
    lv.setUint32(18, size, true);       // Compressed size
    lv.setUint32(22, size, true);       // Uncompressed size
    lv.setUint16(26, fileNameBytes.length, true); // Filename length
    lv.setUint16(28, 0, true);          // Extra field length
    localHeader.set(fileNameBytes, 30);

    parts.push(localHeader);
    parts.push(fileBytes);

    // --- Central Directory Header (46 bytes + filename) ---
    const centralHeader = new Uint8Array(46 + fileNameBytes.length);
    const cv = new DataView(centralHeader.buffer);

    cv.setUint32(0, 0x02014b50, true);  // Central dir signature
    cv.setUint16(4, 20, true);          // Version made by
    cv.setUint16(6, 20, true);          // Version needed
    cv.setUint16(8, 0x0800, true);      // UTF-8 flag
    cv.setUint16(10, 0, true);          // Compression method: 0
    cv.setUint16(12, 0, true);          // Mod time
    cv.setUint16(14, 0, true);          // Mod date
    cv.setUint32(16, crc, true);        // CRC-32
    cv.setUint32(20, size, true);       // Compressed size
    cv.setUint32(24, size, true);       // Uncompressed size
    cv.setUint16(28, fileNameBytes.length, true); // Filename length
    cv.setUint16(30, 0, true);          // Extra field length
    cv.setUint16(32, 0, true);          // File comment length
    cv.setUint16(34, 0, true);          // Disk number start
    cv.setUint16(36, 0, true);          // Internal file attributes
    cv.setUint32(38, 0, true);          // External file attributes
    cv.setUint32(42, currentOffset, true); // Relative offset of local header
    centralHeader.set(fileNameBytes, 46);

    centralDirParts.push(centralHeader);

    currentOffset += localHeader.length + fileBytes.length;
  }

  const centralDirOffset = currentOffset;
  let centralDirSize = 0;
  for (const ch of centralDirParts) {
    centralDirSize += ch.length;
    parts.push(ch);
  }

  // --- End of Central Directory Record (22 bytes) ---
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);

  ev.setUint32(0, 0x06054b50, true);          // EOCD signature
  ev.setUint16(4, 0, true);                   // Number of this disk
  ev.setUint16(6, 0, true);                   // Disk with start of central directory
  ev.setUint16(8, files.length, true);        // Total entries on this disk
  ev.setUint16(10, files.length, true);       // Total entries in central directory
  ev.setUint32(12, centralDirSize, true);     // Size of central directory
  ev.setUint32(16, centralDirOffset, true);   // Offset of start of central directory
  ev.setUint16(20, 0, true);                  // ZIP file comment length

  parts.push(eocd);

  return new Blob(parts as any, { type: 'application/zip' });
}
