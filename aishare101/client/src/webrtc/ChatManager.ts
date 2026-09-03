import type { ChatMessage, ControlMessage } from './types';

export class ChatManager {
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private onMessageReceived: (message: ChatMessage) => void;

  constructor(onMessageReceived: (message: ChatMessage) => void) {
    this.onMessageReceived = onMessageReceived;
  }

  public addDataChannel(peerId: string, channel: RTCDataChannel): void {
    this.dataChannels.set(peerId, channel);
  }

  public removeDataChannel(peerId: string): void {
    this.dataChannels.delete(peerId);
  }

  public clearDataChannels(): void {
    this.dataChannels.clear();
  }

  public hasOpenChannels(): boolean {
    for (const channel of this.dataChannels.values()) {
      if (channel.readyState === 'open') return true;
    }
    return false;
  }

  public sendMessage(text: string, sender: string, isClipboard: boolean = false): ChatMessage {
    const chatMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender,
      text,
      timestamp: Date.now(),
      isMe: true,
      isClipboard,
    };

    let sentCount = 0;
    const payload: ControlMessage = {
      type: 'chat',
      message: { ...chatMessage, isMe: false }, // Receiver should see isMe = false
    };
    const stringified = JSON.stringify(payload);

    for (const [peerId, channel] of this.dataChannels.entries()) {
      if (channel.readyState === 'open') {
        try {
          channel.send(stringified);
          sentCount++;
        } catch (err) {
          console.error(`Failed to send message to peer ${peerId}:`, err);
        }
      }
    }

    if (sentCount === 0 && this.dataChannels.size > 0) {
      console.warn('No active data channels were open to send message.');
    }

    return chatMessage;
  }

  /**
   * Processes a received chat control message.
   */
  public handleIncomingMessage(message: ChatMessage): void {
    this.onMessageReceived(message);
  }
}
