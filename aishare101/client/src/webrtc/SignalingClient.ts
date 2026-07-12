import { io, Socket } from 'socket.io-client';

export interface SignalingEvents {
  onRoomJoined: (roomCode: string, peers: string[]) => void;
  onPeerJoined: (peerId: string) => void;
  onPeerLeft: (peerId: string) => void;
  onSignal: (senderId: string, signalData: any) => void;
  onError: (error: string) => void;
  onDisconnect: () => void;
}

export class SignalingClient {
  private socket: Socket | null = null;
  private url: string;

  constructor(url: string = 'http://localhost:4000') {
    this.url = url;
  }

  public connect(events: SignalingEvents): void {
    if (this.socket) {
      return;
    }

    console.log(`Connecting to signaling server at: ${this.url}`);
    this.socket = io(this.url, {
      transports: ['websocket'],
      autoConnect: true,
    });

    this.socket.on('connect', () => {
      console.log(`Connected to signaling server with socket ID: ${this.socket?.id}`);
    });

    this.socket.on('room-joined', ({ roomCode, peers }: { roomCode: string; peers: string[] }) => {
      events.onRoomJoined(roomCode, peers);
    });

    this.socket.on('peer-joined', (peerId: string) => {
      events.onPeerJoined(peerId);
    });

    this.socket.on('peer-left', (peerId: string) => {
      events.onPeerLeft(peerId);
    });

    this.socket.on('signal', ({ senderId, signalData }: { senderId: string; signalData: any }) => {
      events.onSignal(senderId, signalData);
    });

    this.socket.on('error-msg', (msg: string) => {
      events.onError(msg);
    });

    this.socket.on('disconnect', () => {
      events.onDisconnect();
    });
  }

  public joinRoom(roomCode: string): void {
    if (!this.socket) throw new Error('Socket not connected');
    this.socket.emit('join-room', roomCode);
  }

  public leaveRoom(): void {
    if (!this.socket) return;
    this.socket.emit('leave-room');
  }

  public sendSignal(targetId: string, signalData: any): void {
    if (!this.socket) throw new Error('Socket not connected');
    this.socket.emit('signal', { targetId, signalData });
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public getSocketId(): string | undefined {
    return this.socket?.id;
  }
}
