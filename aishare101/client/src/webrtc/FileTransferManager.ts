import type { FileMetadata, TransferProgress, ControlMessage } from './types';
import { CRC32Incrementer, formatCRC32 } from '../utils/crc32';
import type { FileWithRelativePath } from '../utils/directory';

export interface FileTransferEvents {
  onProgressUpdate: (progressList: TransferProgress[]) => void;
  onTransferComplete: () => void;
  onTransferFailed: (error: string) => void;
  onFileReceived?: (metadata: FileMetadata, blob: Blob) => void;
}

export class FileTransferManager {
  private dataChannel: RTCDataChannel | null = null;
  private events: FileTransferEvents;

  // Transfer State
  private activeTransfers = new Map<string, TransferProgress>();
  private isSending = false;
  private isReceiving = false;
  private cancelRequested = false;

  // Sending State
  private sendAckPromise: { resolve: (status: 'success' | 'crc-error') => void; reject: (err: any) => void } | null = null;

  // Receiving State
  private receivingChunks: ArrayBuffer[] = [];
  private receivingCRC32 = new CRC32Incrementer();
  private currentReceivingMetadata: FileMetadata | null = null;
  private currentReceivingIndex: number = -1;

  // Reconnection and resume state
  private reconnectResolve: (() => void) | null = null;
  private resumeIndexResolve: ((idx: number) => void) | null = null;
  private activeFileId: string | null = null;

  // Performance tracking
  private statsInterval: number | null = null;
  private lastBytesTransferred = 0;
  private lastStatsTime = 0;

  constructor(events: FileTransferEvents) {
    this.events = events;
  }

  public setDataChannel(channel: RTCDataChannel | null): void {
    this.dataChannel = channel;
    if (channel) {
      // Set the buffer threshold low event to fire when buffer drops under 64KB
      channel.bufferedAmountLowThreshold = 64 * 1024;
      
      // Resolve reconnect promise if we are waiting for reconnection
      if (this.reconnectResolve) {
        this.reconnectResolve();
        this.reconnectResolve = null;
      }
    }
  }

  /**
   * Start sending a list of files to the connected peer.
   */
  public async sendFiles(filesWithPaths: FileWithRelativePath[]): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel is not open. Cannot transfer files.');
    }
    if (this.isSending || this.isReceiving) {
      throw new Error('A transfer is already in progress.');
    }

    this.isSending = true;
    this.cancelRequested = false;
    this.activeTransfers.clear();

    const CHUNK_SIZE = 64 * 1024; // 64KB chunks
    const BUFFER_THRESHOLD = 256 * 1024; // 256KB threshold to trigger back-pressure pause

    // 1. Map files to metadata and progress structure
    const totalBytes = filesWithPaths.reduce((sum, f) => sum + f.file.size, 0);
    const filesMetadata: { file: File; meta: FileMetadata }[] = filesWithPaths.map(({ file, relativePath }) => {
      const id = crypto.randomUUID();
      const meta: FileMetadata = {
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        relativePath: relativePath,
        totalChunks: Math.ceil(file.size / CHUNK_SIZE),
      };

      this.activeTransfers.set(id, {
        fileId: id,
        name: file.name,
        size: file.size,
        bytesTransferred: 0,
        progress: 0,
        speed: 0,
        eta: 0,
        status: 'pending',
      });

      return { file, meta };
    });

    this.updateUI();

    // Start stats monitoring
    this.startStatsMonitoring();

    try {
      // Send transfer start header
      const startMsg: ControlMessage = {
        type: 'transfer-start',
        totalFiles: filesWithPaths.length,
        totalBytes,
      };
      this.dataChannel.send(JSON.stringify(startMsg));

      // Loop and send files sequentially
      for (let i = 0; i < filesMetadata.length; i++) {
        if (this.cancelRequested) break;

        const { file, meta } = filesMetadata[i];
        const progress = this.activeTransfers.get(meta.id)!;
        progress.status = 'transferring';
        this.updateUI();

        // Send file-start metadata
        const fileStartMsg: ControlMessage = {
          type: 'file-start',
          metadata: meta,
          fileIndex: i,
        };
        this.dataChannel.send(JSON.stringify(fileStartMsg));

        const crcCalc = new CRC32Incrementer();
        let bytesSent = 0;
        let chunkIndex = 0;

        this.activeFileId = meta.id;

        // Stream and chunk the file
        while (bytesSent < file.size) {
          if (this.cancelRequested) break;

          // Auto-Resume Connection Recovery Check
          if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            progress.status = 'reconnecting';
            this.updateUI();
            console.log('Direct P2P channel lost during transfer. Auto-reconnecting...');
            
            await this.waitForReconnection();
            
            progress.status = 'transferring';
            this.updateUI();

            // Retrieve chunk acknowledgement index from receiver
            const resumeIndex = await this.requestResumeIndex(meta.id);
            console.log(`Reconnected successfully! Resuming file from chunk index: ${resumeIndex}`);
            
            bytesSent = resumeIndex * CHUNK_SIZE;
            chunkIndex = resumeIndex;

            // Catch up sender's CRC32 checksum state by processing local slices up to resume index
            crcCalc.reset();
            let catchUpBytes = 0;
            while (catchUpBytes < bytesSent) {
              const sliceStart = catchUpBytes;
              const sliceEnd = Math.min(sliceStart + CHUNK_SIZE, file.size);
              const blobSlice = file.slice(sliceStart, sliceEnd);
              const arrayBuffer = await blobSlice.arrayBuffer();
              crcCalc.update(new Uint8Array(arrayBuffer));
              catchUpBytes += arrayBuffer.byteLength;
            }
            
            continue; // re-evaluate chunk slice coordinates
          }

          // Backpressure management: Check if the buffer is overloaded
          if (this.dataChannel.bufferedAmount > BUFFER_THRESHOLD) {
            await new Promise<void>((resolve) => {
              const onBufferLow = () => {
                this.dataChannel?.removeEventListener('bufferedamountlow', onBufferLow);
                resolve();
              };
              this.dataChannel?.addEventListener('bufferedamountlow', onBufferLow);

              // Setup a timeout check just in case WebRTC fails to trigger the event
              setTimeout(() => {
                this.dataChannel?.removeEventListener('bufferedamountlow', onBufferLow);
                resolve();
              }, 1000);
            });
          }

          const sliceStart = bytesSent;
          const sliceEnd = Math.min(sliceStart + CHUNK_SIZE, file.size);
          const blobSlice = file.slice(sliceStart, sliceEnd);

          // Read slice as ArrayBuffer
          const arrayBuffer = await blobSlice.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);

          // Update CRC32 checksum
          crcCalc.update(uint8Array);

          // Send chunk binary data
          this.dataChannel.send(arrayBuffer);

          bytesSent += arrayBuffer.byteLength;
          chunkIndex++;

          // Update progress metrics
          progress.bytesTransferred = bytesSent;
          progress.progress = Math.round((bytesSent / file.size) * 100);
          this.updateStats(progress, bytesSent, file.size);
        }

        if (this.cancelRequested) break;

        // Send file-end validation checksum
        const fileEndCrc = formatCRC32(crcCalc.finalize());
        progress.status = 'assembling';
        this.updateUI();

        const fileEndMsg: ControlMessage = {
          type: 'file-end',
          fileIndex: i,
          expectedCrc32: fileEndCrc,
        };
        this.dataChannel.send(JSON.stringify(fileEndMsg));

        // Wait for receiver ACK (acknowledgment + integrity check verification)
        const ackStatus = await new Promise<'success' | 'crc-error'>((resolve, reject) => {
          this.sendAckPromise = { resolve, reject };
          // Fail-safe timeout (10 seconds)
          setTimeout(() => {
            if (this.sendAckPromise) {
              reject(new Error('Receiver acknowledgment timed out.'));
              this.sendAckPromise = null;
            }
          }, 15000);
        });

        if (ackStatus === 'success') {
          progress.status = 'completed';
          progress.progress = 100;
        } else {
          progress.status = 'failed';
          progress.error = 'Integrity check (CRC32 checksum mismatch) failed on receiver side.';
          throw new Error(`CRC32 mismatch on file: ${file.name}`);
        }
        this.updateUI();
      }

      if (this.cancelRequested) {
        this.handleTransferCancelled();
      } else {
        this.events.onTransferComplete();
      }
    } catch (err: any) {
      console.error('File transfer error:', err);
      this.events.onTransferFailed(err.message || 'File transfer failed');
      this.resetTransferState('failed');
    } finally {
      this.stopStatsMonitoring();
      this.isSending = false;
    }
  }

  /**
   * Handle incoming control messages (parsed JSON strings) from the peer.
   */
  public handleControlMessage(msg: ControlMessage): void {
    switch (msg.type) {
      case 'transfer-start':
        console.log(`Starting incoming transfer. Total files: ${msg.totalFiles}`);
        this.isReceiving = true;
        this.cancelRequested = false;
        this.activeTransfers.clear();
        this.updateUI();
        break;

      case 'file-start':
        console.log(`Receiving file: ${msg.metadata.name}`);
        this.currentReceivingMetadata = msg.metadata;
        this.currentReceivingIndex = msg.fileIndex;
        this.receivingChunks = [];
        this.receivingCRC32.reset();

        this.activeTransfers.set(msg.metadata.id, {
          fileId: msg.metadata.id,
          name: msg.metadata.name,
          size: msg.metadata.size,
          bytesTransferred: 0,
          progress: 0,
          speed: 0,
          eta: 0,
          status: 'transferring',
        });
        this.startStatsMonitoring();
        this.updateUI();
        break;

      case 'file-end':
        this.handleFileComplete(msg.expectedCrc32);
        break;

      case 'file-ack':
        if (this.sendAckPromise) {
          this.sendAckPromise.resolve(msg.status);
          this.sendAckPromise = null;
        }
        break;

      case 'transfer-cancel':
        this.handleTransferCancelled();
        break;

      case 'resume-request': {
        console.log(`Received resume-request for fileId: ${msg.fileId}`);
        const count = (this.currentReceivingMetadata && this.currentReceivingMetadata.id === msg.fileId)
          ? this.receivingChunks.length
          : 0;
        this.sendControl({
          type: 'resume-response',
          fileId: msg.fileId,
          lastChunkIndex: count,
        });
        break;
      }

      case 'resume-response':
        if (this.resumeIndexResolve && msg.fileId === this.activeFileId) {
          this.resumeIndexResolve(msg.lastChunkIndex);
          this.resumeIndexResolve = null;
        }
        break;
    }
  }

  /**
   * Handle incoming raw chunk (binary ArrayBuffer) from the peer.
   */
  public handleBinaryChunk(chunk: ArrayBuffer): void {
    if (!this.isReceiving || !this.currentReceivingMetadata) {
      console.warn('Received binary chunk without an active file metadata headers.');
      return;
    }

    // Store the chunk
    this.receivingChunks.push(chunk);

    // Update incremental CRC32 calculation
    const uint8Chunk = new Uint8Array(chunk);
    this.receivingCRC32.update(uint8Chunk);

    // Update progress state
    const progress = this.activeTransfers.get(this.currentReceivingMetadata.id)!;
    const currentBytes = progress.bytesTransferred + chunk.byteLength;
    progress.bytesTransferred = currentBytes;
    progress.progress = Math.round((currentBytes / progress.size) * 100);

    this.updateStats(progress, currentBytes, progress.size);
  }

  /**
   * Cancels the active transfer.
   */
  public cancelTransfer(): void {
    if (!this.isSending && !this.isReceiving) return;

    this.cancelRequested = true;
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      const cancelMsg: ControlMessage = { type: 'transfer-cancel' };
      try {
        this.dataChannel.send(JSON.stringify(cancelMsg));
      } catch (e) {
        console.error('Failed to send cancel header:', e);
      }
    }

    this.handleTransferCancelled();
  }

  private handleFileComplete(expectedCrc32: string): void {
    if (!this.currentReceivingMetadata || !this.isReceiving) return;

    const metadata = this.currentReceivingMetadata;
    const fileIndex = this.currentReceivingIndex;
    const progress = this.activeTransfers.get(metadata.id)!;
    progress.status = 'assembling';
    this.updateUI();

    // 1. Calculate matching CRC32
    const calculatedCrc32Val = this.receivingCRC32.finalize();
    const calculatedCrc32Hex = formatCRC32(calculatedCrc32Val);

    console.log(`File complete: ${metadata.name}`);
    console.log(`Expected CRC32: ${expectedCrc32}, Calculated: ${calculatedCrc32Hex}`);

    const isMatch = calculatedCrc32Hex === expectedCrc32;

    if (isMatch) {
      try {
        // Assemble and trigger direct download
        const blob = new Blob(this.receivingChunks, { type: metadata.type || 'application/octet-stream' });
        
        // Notify UI about the completed file so they can preview it
        if (this.events.onFileReceived) {
          this.events.onFileReceived(metadata, blob);
        }

        // Reconstruct directory structures by preparing name/paths
        // If file system support exists or we use standard trigger download
        this.triggerFileDownload(blob, metadata.relativePath || metadata.name);

        progress.status = 'completed';
        progress.progress = 100;
        this.updateUI();

        // Send ACK
        this.sendControl({ type: 'file-ack', fileIndex, status: 'success' });
      } catch (err: any) {
        console.error('Failed to build/download file:', err);
        progress.status = 'failed';
        progress.error = 'Failed to assemble download file';
        this.updateUI();
        this.sendControl({ type: 'file-ack', fileIndex, status: 'crc-error' });
      }
    } else {
      progress.status = 'failed';
      progress.error = 'CRC32 verification mismatch. File may be corrupted.';
      this.updateUI();
      // Send error ACK
      this.sendControl({ type: 'file-ack', fileIndex, status: 'crc-error' });
    }

    // Clean up received chunks immediately to free memory
    this.receivingChunks = [];
    this.currentReceivingMetadata = null;
    this.currentReceivingIndex = -1;
    this.stopStatsMonitoring();
  }

  private triggerFileDownload(blob: Blob, path: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Replace slash in path with underscore to prevent browser from interpreting it 
    // as subfolders in standard downloads, unless webkit relative paths or saving works.
    // In chromium, standard 'download' attribute only supports file name, but we can display the relative path in UI
    a.download = path.replace(/\//g, '_'); 
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private handleTransferCancelled(): void {
    this.resetTransferState('cancelled');
    this.events.onTransferFailed('Transfer was cancelled by peer.');
  }

  private sendControl(msg: ControlMessage): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(msg));
    }
  }

  private startStatsMonitoring(): void {
    this.lastBytesTransferred = 0;
    this.lastStatsTime = performance.now();
  }

  private updateStats(progress: TransferProgress, currentBytes: number, totalBytes: number): void {
    const now = performance.now();
    const timeDiff = (now - this.lastStatsTime) / 1000; // in seconds

    if (timeDiff >= 1) {
      const bytesDiff = currentBytes - this.lastBytesTransferred;
      const speedBps = bytesDiff / timeDiff; // Bytes per second
      
      progress.speed = Number((speedBps / (1024 * 1024)).toFixed(2)); // MB/s

      const remainingBytes = totalBytes - currentBytes;
      progress.eta = speedBps > 0 ? Math.round(remainingBytes / speedBps) : 9999;

      this.lastBytesTransferred = currentBytes;
      this.lastStatsTime = now;
      this.updateUI();
    }
  }

  private stopStatsMonitoring(): void {
    if (this.statsInterval) {
      window.clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  private resetTransferState(status: 'cancelled' | 'failed'): void {
    this.stopStatsMonitoring();
    for (const [, transfer] of this.activeTransfers) {
      if (transfer.status === 'transferring' || transfer.status === 'pending' || transfer.status === 'assembling') {
        transfer.status = status;
      }
    }
    this.receivingChunks = [];
    this.currentReceivingMetadata = null;
    this.currentReceivingIndex = -1;
    this.isSending = false;
    this.isReceiving = false;
    this.updateUI();
  }

  private waitForReconnection(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.reconnectResolve = resolve;
    });
  }

  private requestResumeIndex(fileId: string): Promise<number> {
    return new Promise<number>((resolve) => {
      if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
        resolve(0);
        return;
      }
      this.resumeIndexResolve = resolve;
      this.sendControl({
        type: 'resume-request',
        fileId,
      });
      // Timeout fallback
      setTimeout(() => {
        if (this.resumeIndexResolve) {
          this.resumeIndexResolve(0);
          this.resumeIndexResolve = null;
        }
      }, 5000);
    });
  }

  private updateUI(): void {
    const list = Array.from(this.activeTransfers.values());
    this.events.onProgressUpdate(list);
  }
}
