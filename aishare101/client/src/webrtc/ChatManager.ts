import type { ChatMessage, ControlMessage } from './types';

export class ChatManager {
  private dataChannel: RTCDataChannel | null = null;
  private onMessageReceived: (message: ChatMessage) => void;

  constructor(onMessageReceived: (message: ChatMessage) => void) {
    this.onMessageReceived = onMessageReceived;
  }

  public setDataChannel(channel: RTCDataChannel | null): void {
    this.dataChannel = channel;
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

    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel is not open. Cannot send chat message.');
    }

    const payload: ControlMessage = {
      type: 'chat',
      message: { ...chatMessage, isMe: false }, // Receiver should see isMe = false
    };

    this.dataChannel.send(JSON.stringify(payload));
    return chatMessage;
  }

  /**
   * Processes a received chat control message.
   */
  public handleIncomingMessage(message: ChatMessage): void {
    this.onMessageReceived(message);
  }
}
