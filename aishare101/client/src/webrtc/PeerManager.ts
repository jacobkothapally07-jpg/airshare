import { SignalingClient } from './SignalingClient';
import { ChatManager } from './ChatManager';
import { FileTransferManager } from './FileTransferManager';
import type { ControlMessage } from './types';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface PeerManagerEvents {
  onConnectionStateChange: (state: ConnectionState) => void;
  onRemotePeerChange: (peerId: string | null) => void;
}

export class PeerManager {
  private signalingClient: SignalingClient;
  private chatManager: ChatManager;
  private fileTransferManager: FileTransferManager;
  private events: PeerManagerEvents;

  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private remotePeerId: string | null = null;
  private connectionState: ConnectionState = 'idle';

  private iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  constructor(
    signalingClient: SignalingClient,
    chatManager: ChatManager,
    fileTransferManager: FileTransferManager,
    events: PeerManagerEvents
  ) {
    this.signalingClient = signalingClient;
    this.chatManager = chatManager;
    this.fileTransferManager = fileTransferManager;
    this.events = events;
  }

  public getRemotePeerId(): string | null {
    return this.remotePeerId;
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.events.onConnectionStateChange(state);
  }

  /**
   * Handle room join updates from the signaling server.
   */
  public handleRoomJoined(peers: string[]): void {
    console.log('Room joined. Peers in room:', peers);
    const myId = this.signalingClient.getSocketId();
    if (!myId) return;

    if (peers.length > 0) {
      // Connect to the first peer in the room (AirShare is designed as a 1-to-1 link for transfers)
      const targetPeer = peers[0];
      this.remotePeerId = targetPeer;
      this.events.onRemotePeerChange(targetPeer);

      // Determine who initiates the connection based on ID alphabetical ordering (prevents collision)
      if (myId > targetPeer) {
        console.log(`Initiating connection to ${targetPeer}...`);
        this.initiateConnection(targetPeer);
      } else {
        console.log(`Waiting for offer from ${targetPeer}...`);
        this.setConnectionState('connecting');
      }
    } else {
      console.log('Waiting for other peers to join...');
      this.cleanupConnection();
      this.events.onRemotePeerChange(null);
      this.setConnectionState('idle');
    }
  }

  /**
   * Handle new peer entering the room.
   */
  public handlePeerJoined(peerId: string): void {
    console.log(`Peer joined: ${peerId}`);
    const myId = this.signalingClient.getSocketId();
    if (!myId) return;

    // Set remote peer
    this.remotePeerId = peerId;
    this.events.onRemotePeerChange(peerId);

    if (myId > peerId) {
      console.log(`Initiating connection to ${peerId}...`);
      this.initiateConnection(peerId);
    } else {
      console.log(`Waiting for offer from ${peerId}...`);
      this.setConnectionState('connecting');
    }
  }

  /**
   * Handle peer departing the room.
   */
  public handlePeerLeft(peerId: string): void {
    if (peerId === this.remotePeerId) {
      console.log(`Peer left: ${peerId}`);
      this.cleanupConnection();
      this.events.onRemotePeerChange(null);
      this.setConnectionState('idle');
    }
  }

  /**
   * Handle incoming signaling messages.
   */
  public async handleSignal(senderId: string, signalData: any): Promise<void> {
    if (senderId !== this.remotePeerId) {
      // Set remote peer if we didn't track it yet
      this.remotePeerId = senderId;
      this.events.onRemotePeerChange(senderId);
    }

    try {
      if (signalData.sdp) {
        const sdp = new RTCSessionDescription(signalData.sdp);
        if (sdp.type === 'offer') {
          console.log('Received SDP offer, building answer...');
          await this.createAnswer(senderId, sdp);
        } else if (sdp.type === 'answer') {
          console.log('Received SDP answer, setting remote description...');
          if (this.pc) {
            await this.pc.setRemoteDescription(sdp);
          }
        }
      } else if (signalData.candidate) {
        console.log('Received ICE candidate, adding to peer connection...');
        if (this.pc) {
          await this.pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        }
      }
    } catch (err) {
      console.error('Signaling processing error:', err);
      this.setConnectionState('failed');
    }
  }

  /**
   * Initiates WebRTC peer connection (as initiator).
   */
  private async initiateConnection(targetId: string): Promise<void> {
    this.setConnectionState('connecting');
    this.createPeerConnection(targetId);

    if (!this.pc) return;

    // Create custom data channel
    const channel = this.pc.createDataChannel('airshare-channel', {
      ordered: true,
    });
    this.setupDataChannel(channel);

    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.signalingClient.sendSignal(targetId, { sdp: offer });
    } catch (err) {
      console.error('Failed to create SDP Offer:', err);
      this.setConnectionState('failed');
    }
  }

  /**
   * Handles incoming SDP offer and creates SDP answer.
   */
  private async createAnswer(targetId: string, offer: RTCSessionDescription): Promise<void> {
    this.setConnectionState('connecting');
    this.createPeerConnection(targetId);

    if (!this.pc) return;

    try {
      await this.pc.setRemoteDescription(offer);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.signalingClient.sendSignal(targetId, { sdp: answer });
    } catch (err) {
      console.error('Failed to create SDP Answer:', err);
      this.setConnectionState('failed');
    }
  }

  /**
   * Creates RTCPeerConnection object and hooks up event listeners.
   */
  private createPeerConnection(targetId: string): void {
    if (this.pc) {
      this.cleanupConnection();
    }

    console.log('Creating RTCPeerConnection...');
    this.pc = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingClient.sendSignal(targetId, { candidate: event.candidate });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      console.log(`WebRTC Connection State: ${this.pc.connectionState}`);
      switch (this.pc.connectionState) {
        case 'connected':
          this.setConnectionState('connected');
          break;
        case 'disconnected':
          this.setConnectionState('disconnected');
          break;
        case 'failed':
          this.setConnectionState('failed');
          break;
        case 'closed':
          this.setConnectionState('idle');
          break;
      }
    };

    // Receiver captures data channel here
    this.pc.ondatachannel = (event) => {
      console.log('Received incoming data channel creation.');
      this.setupDataChannel(event.channel);
    };
  }

  /**
   * Binds event handlers on the WebRTC RTCDataChannel.
   */
  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;
    this.dataChannel.binaryType = 'arraybuffer';

    this.chatManager.setDataChannel(channel);
    this.fileTransferManager.setDataChannel(channel);

    channel.onopen = () => {
      console.log('RTCDataChannel opened.');
      this.setConnectionState('connected');
    };

    channel.onclose = () => {
      console.log('RTCDataChannel closed.');
      this.setConnectionState('disconnected');
      this.chatManager.setDataChannel(null);
      this.fileTransferManager.setDataChannel(null);
    };

    channel.onerror = (err) => {
      console.error('RTCDataChannel error:', err);
      this.setConnectionState('failed');
    };

    channel.onmessage = (event) => {
      const { data } = event;

      // Differentiate between JSON control strings and raw binary file chunk buffers
      if (typeof data === 'string') {
        try {
          const controlMsg: ControlMessage = JSON.parse(data);
          if (controlMsg.type === 'chat') {
            this.chatManager.handleIncomingMessage(controlMsg.message);
          } else {
            this.fileTransferManager.handleControlMessage(controlMsg);
          }
        } catch (err) {
          console.error('Failed to parse incoming text message:', err);
        }
      } else if (data instanceof ArrayBuffer) {
        this.fileTransferManager.handleBinaryChunk(data);
      }
    };
  }

  /**
   * Clean up and disconnect connection state variables.
   */
  public cleanupConnection(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.chatManager.setDataChannel(null);
    this.fileTransferManager.setDataChannel(null);
    this.remotePeerId = null;
    this.setConnectionState('idle');
  }

  /**
   * Reconnect triggers re-signaling between peers.
   */
  public reconnect(): void {
    if (this.remotePeerId) {
      console.log('Attempting WebRTC reconnection...');
      this.cleanupConnection();
      this.initiateConnection(this.remotePeerId);
    }
  }
}
