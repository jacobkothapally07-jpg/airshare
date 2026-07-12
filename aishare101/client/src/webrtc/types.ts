export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isMe: boolean;
  isClipboard?: boolean;
}

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  relativePath: string;
  totalChunks: number;
}

export interface TransferProgress {
  fileId: string;
  name: string;
  size: number;
  bytesTransferred: number;
  progress: number; // 0 to 100
  speed: number; // MB/s
  eta: number; // seconds remaining
  status: 'pending' | 'transferring' | 'assembling' | 'completed' | 'failed' | 'cancelled' | 'paused' | 'reconnecting';
  error?: string;
}

export type ControlMessage =
  | { type: 'chat'; message: ChatMessage }
  | { type: 'transfer-start'; totalFiles: number; totalBytes: number }
  | { type: 'file-start'; metadata: FileMetadata; fileIndex: number }
  | { type: 'file-end'; fileIndex: number; expectedCrc32: string }
  | { type: 'file-ack'; fileIndex: number; status: 'success' | 'crc-error' }
  | { type: 'transfer-cancel' }
  | { type: 'resume-request'; fileId: string }
  | { type: 'resume-response'; fileId: string; lastChunkIndex: number };

