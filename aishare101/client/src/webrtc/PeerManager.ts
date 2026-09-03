import { SignalingClient } from './SignalingClient';
import { ChatManager } from './ChatManager';
import { FileTransferManager } from './FileTransferManager';
import type { ControlMessage } from './types';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface PeerManagerEvents {
  onConnectionStateChange: (state: ConnectionState) => void;
  onConnectedPeersChange: (peers: string[]) => void;
}

export class PeerManager {
  private signalingClient: SignalingClient;
  private chatManager: ChatManager;
  private fileTransferManager: FileTransferManager;
  private events: PeerManagerEvents;

  // Map of peerId -> RTCPeerConnection and RTCDataChannel
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
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

  public getConnectedPeers(): string[] {
    return Array.from(this.dataChannels.keys());
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.events.onConnectionStateChange(state);
  }

  private notifyPeersChanged(): void {
    const peers = Array.from(this.dataChannels.keys());
    this.events.onConnectedPeersChange(peers);
    if (peers.length > 0) {
      this.setConnectionState('connected');
    } else if (this.peerConnections.size > 0) {
      this.setConnectionState('connecting');
    } else {
      this.setConnectionState('idle');
    }
  }

  /**
   * Handle room join updates from the signaling server.
   */
  public handleRoomJoined(peers: string[]): void {
    console.log('Room joined. Other peers in room:', peers);
    const myId = this.signalingClient.getSocketId();
    if (!myId) return;

    if (peers.length > 0) {
      this.setConnectionState('connecting');
      for (const peerId of peers) {
        if (myId > peerId) {
          console.log(`[Mesh] Initiating connection to peer ${peerId}...`);
          this.initiateConnection(peerId);
        } else {
          console.log(`[Mesh] Waiting for offer from peer ${peerId}...`);
        }
      }
    } else {
      console.log('Waiting for other peers to join the room...');
      this.cleanupConnection();
      this.setConnectionState('idle');
    }
  }

  /**
   * Handle new peer entering the room.
   */
  public handlePeerJoined(peerId: string): void {
    console.log(`[Mesh] Peer joined room: ${peerId}`);
    const myId = this.signalingClient.getSocketId();
    if (!myId || peerId === myId) return;

    if (myId > peerId) {
      console.log(`[Mesh] Initiating connection to newly joined peer ${peerId}...`);
      this.initiateConnection(peerId);
    } else {
      console.log(`[Mesh] Waiting for offer from newly joined peer ${peerId}...`);
      this.setConnectionState('connecting');
    }
  }

  /**
   * Handle peer departing the room.
   */
  public handlePeerLeft(peerId: string): void {
    console.log(`[Mesh] Peer left room: ${peerId}`);
    this.teardownPeerConnection(peerId);
    this.notifyPeersChanged();
  }

  /**
   * Handle incoming signaling messages.
   */
  public async handleSignal(senderId: string, signalData: any): Promise<void> {
    try {
      if (signalData.sdp) {
        const sdp = new RTCSessionDescription(signalData.sdp);
        if (sdp.type === 'offer') {
          console.log(`[Mesh] Received SDP offer from ${senderId}, answering...`);
          await this.createAnswer(senderId, sdp);
        } else if (sdp.type === 'answer') {
          console.log(`[Mesh] Received SDP answer from ${senderId}, setting remote description...`);
          const pc = this.peerConnections.get(senderId);
          if (pc) {
            await pc.setRemoteDescription(sdp);
          }
        }
      } else if (signalData.candidate) {
        console.log(`[Mesh] Received ICE candidate from ${senderId}...`);
        const pc = this.peerConnections.get(senderId);
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        }
      }
    } catch (err) {
      console.error(`Signaling processing error with ${senderId}:`, err);
    }
  }

  /**
   * Initiates WebRTC peer connection to a target peer.
   */
  private async initiateConnection(targetId: string): Promise<void> {
    const pc = this.getOrCreatePeerConnection(targetId);

    // Create custom data channel
    const channel = pc.createDataChannel(`airshare-channel-${targetId}`, {
      ordered: true,
    });
    this.setupDataChannel(targetId, channel);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signalingClient.sendSignal(targetId, { sdp: offer });
    } catch (err) {
      console.error(`Failed to create SDP Offer for ${targetId}:`, err);
    }
  }

  /**
   * Handles incoming SDP offer and creates SDP answer.
   */
  private async createAnswer(targetId: string, offer: RTCSessionDescription): Promise<void> {
    const pc = this.getOrCreatePeerConnection(targetId);

    try {
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signalingClient.sendSignal(targetId, { sdp: answer });
    } catch (err) {
      console.error(`Failed to create SDP Answer for ${targetId}:`, err);
    }
  }

  /**
   * Retrieves or creates an RTCPeerConnection for a given peer.
   */
  private getOrCreatePeerConnection(targetId: string): RTCPeerConnection {
    let pc = this.peerConnections.get(targetId);
    if (pc) {
      return pc;
    }

    console.log(`[Mesh] Creating RTCPeerConnection for ${targetId}...`);
    pc = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingClient.sendSignal(targetId, { candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (!pc) return;
      console.log(`[Mesh] Connection state with ${targetId}: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.teardownPeerConnection(targetId);
        this.notifyPeersChanged();
      }
    };

    // Receiver captures data channel here
    pc.ondatachannel = (event) => {
      console.log(`[Mesh] Received incoming data channel from ${targetId}.`);
      this.setupDataChannel(targetId, event.channel);
    };

    this.peerConnections.set(targetId, pc);
    return pc;
  }

  /**
   * Binds event handlers on the WebRTC RTCDataChannel for a peer.
   */
  private setupDataChannel(peerId: string, channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer';
    this.dataChannels.set(peerId, channel);

    this.chatManager.addDataChannel(peerId, channel);
    this.fileTransferManager.addDataChannel(peerId, channel);

    channel.onopen = () => {
      console.log(`[Mesh] RTCDataChannel opened with ${peerId}.`);
      this.notifyPeersChanged();
    };

    channel.onclose = () => {
      console.log(`[Mesh] RTCDataChannel closed with ${peerId}.`);
      this.teardownPeerConnection(peerId);
      this.notifyPeersChanged();
    };

    channel.onerror = (err) => {
      console.error(`[Mesh] RTCDataChannel error with ${peerId}:`, err);
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
   * Tear down connection with a specific peer.
   */
  private teardownPeerConnection(peerId: string): void {
    const channel = this.dataChannels.get(peerId);
    if (channel) {
      try {
        channel.close();
      } catch (e) {}
      this.dataChannels.delete(peerId);
    }

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch (e) {}
      this.peerConnections.delete(peerId);
    }

    this.chatManager.removeDataChannel(peerId);
    this.fileTransferManager.removeDataChannel(peerId);
  }

  /**
   * Clean up and disconnect all mesh connection state variables.
   */
  public cleanupConnection(): void {
    for (const peerId of Array.from(this.peerConnections.keys())) {
      this.teardownPeerConnection(peerId);
    }
    this.peerConnections.clear();
    this.dataChannels.clear();
    this.chatManager.clearDataChannels();
    this.fileTransferManager.clearDataChannels();
    this.setConnectionState('idle');
    this.events.onConnectedPeersChange([]);
  }

  /**
   * Reconnect triggers re-signaling across all active peers.
   */
  public reconnect(): void {
    const activePeers = Array.from(this.peerConnections.keys());
    console.log('[Mesh] Reconnecting all peer connections...');
    this.cleanupConnection();
    for (const peerId of activePeers) {
      this.initiateConnection(peerId);
    }
  }
}
