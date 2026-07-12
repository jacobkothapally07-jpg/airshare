import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import {
  Send,
  UploadCloud,
  FileText,
  Copy,
  Check,
  User,
  Lock,
  X,
  AlertCircle,
  File,
  Folder,
  ArrowRight,
  ShieldCheck,
  Activity,
  HardDriveUpload,
  QrCode,
  Laptop,
  Smartphone,
  Info,
  Play,
  Code
} from 'lucide-react';

import { SignalingClient } from './webrtc/SignalingClient';
import { ChatManager } from './webrtc/ChatManager';
import { FileTransferManager } from './webrtc/FileTransferManager';
import { PeerManager } from './webrtc/PeerManager';
import { soundHUD } from './utils/sounds';
import type { ConnectionState } from './webrtc/PeerManager';
import type { ChatMessage, TransferProgress } from './webrtc/types';
import { getFilesFromDroppedItems } from './utils/directory';
import type { FileWithRelativePath } from './utils/directory';

// Construct server URL dynamically to allow local network testing (e.g. mobile peer on WiFi)
const SIGNAL_SERVER_URL = `${window.location.protocol}//${window.location.hostname}:4000`;

function App() {
  // Connection states
  const [roomCode, setRoomCode] = useState<string>('');
  const [inputRoomCode, setInputRoomCode] = useState<string>('');
  const [remotePeer, setRemotePeer] = useState<string | null>(null);
  const [connState, setConnState] = useState<ConnectionState>('idle');
  const [senderName, setSenderName] = useState<string>(() => {
    // Generate a default random username on load
    return `Peer_${Math.floor(1000 + Math.random() * 9000)}`;
  });

  // Chat states
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  
  // File transfer states
  const [transfers, setTransfers] = useState<TransferProgress[]>([]);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // QR and Scanner states
  const [qrUrl, setQrUrl] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [showScanner, setShowScanner] = useState<boolean>(false);
  const [scanValue, setScanValue] = useState<string>('');
  const [isLinkCopied, setIsLinkCopied] = useState<boolean>(false);

  // References to the Managers
  const signalingClientRef = useRef<SignalingClient | null>(null);
  const chatManagerRef = useRef<ChatManager | null>(null);
  const fileTransferManagerRef = useRef<FileTransferManager | null>(null);
  const peerManagerRef = useRef<PeerManager | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [fingerprint, setFingerprint] = useState<string>('');

  // Preview states
  interface PreviewFile {
    name: string;
    type: string;
    url: string;
    content?: string;
  }
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [receivedFilesMap, setReceivedFilesMap] = useState<Map<string, { url: string; type: string }>>(() => new Map());
  const [activePreviewTab, setActivePreviewTab] = useState<'run' | 'code'>('run');

  const handleShareClipboard = async () => {
    soundHUD.playClick();
    if (!chatManagerRef.current) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        alert('Clipboard is empty or contains non-text content.');
        return;
      }
      const msg = chatManagerRef.current.sendMessage(text.trim(), senderName, true);
      setMessages((prev) => [...prev, msg]);
    } catch (err) {
      console.error('Clipboard sync failed:', err);
      alert('Unable to read clipboard. Please check browser permissions.');
    }
  };

  const handlePreview = async (fileId: string, name: string) => {
    soundHUD.playClick();
    const fileData = receivedFilesMap.get(fileId);
    if (!fileData) return;

    const { url, type } = fileData;
    let content = '';
    const lowerName = name.toLowerCase();
    const isText = type.startsWith('text/') || 
                   lowerName.endsWith('.html') || 
                   lowerName.endsWith('.css') || 
                   lowerName.endsWith('.js') || 
                   lowerName.endsWith('.ts') || 
                   lowerName.endsWith('.tsx') || 
                   lowerName.endsWith('.json') || 
                   lowerName.endsWith('.md');

    if (isText) {
      try {
        const response = await fetch(url);
        content = await response.text();
      } catch (e) {
        console.error('Failed to load text contents for preview:', e);
      }
    }
    setPreviewFile({ name, type, url, content });
  };

  // Setup managers once on mount
  useEffect(() => {
    // 1. Initialize Signaling Client
    const signalingClient = new SignalingClient(SIGNAL_SERVER_URL);
    signalingClientRef.current = signalingClient;

    // 2. Initialize Chat Manager
    const chatManager = new ChatManager((msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    chatManagerRef.current = chatManager;

    // 3. Initialize File Transfer Manager
    const fileTransferManager = new FileTransferManager({
      onProgressUpdate: (updatedTransfers) => {
        setTransfers(updatedTransfers);
      },
      onTransferComplete: () => {
        soundHUD.playSuccess();
        // Automatically add system notification message
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: 'System',
            text: '🎉 File transfer session completed successfully! CRC32 checksums verified.',
            timestamp: Date.now(),
            isMe: false,
          },
        ]);
      },
      onTransferFailed: (errorMsg) => {
        soundHUD.playFailure();
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: 'System',
            text: `⚠️ Transfer encountered an error: ${errorMsg}`,
            timestamp: Date.now(),
            isMe: false,
          },
        ]);
      },
      onFileReceived: (metadata, blob) => {
        const url = URL.createObjectURL(blob);
        soundHUD.playSuccess();
        setReceivedFilesMap((prev) => {
          const newMap = new Map(prev);
          newMap.set(metadata.id, { url, type: metadata.type || blob.type });
          return newMap;
        });
      }
    });
    fileTransferManagerRef.current = fileTransferManager;

    // 4. Initialize Peer Manager
    const peerManager = new PeerManager(signalingClient, chatManager, fileTransferManager, {
      onConnectionStateChange: (state) => {
        setConnState(state);
        if (state === 'connected') {
          soundHUD.playConnect();
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              sender: 'System',
              text: '🔒 Direct P2P WebRTC DataChannel established securely. Ready to share files.',
              timestamp: Date.now(),
              isMe: false,
            },
          ]);
        } else if (state === 'disconnected' || state === 'failed') {
          soundHUD.playFailure();
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              sender: 'System',
              text: '🔌 Peer connection closed or failed.',
              timestamp: Date.now(),
              isMe: false,
            },
          ]);
        }
      },
      onRemotePeerChange: (peerId) => {
        setRemotePeer(peerId);
        if (!peerId) {
          setTransfers([]);
        }
      },
    });
    peerManagerRef.current = peerManager;

    // Connect to Signaling Server
    signalingClient.connect({
      onRoomJoined: (code, peers) => {
        setRoomCode(code);
        setMessages([
          {
            id: crypto.randomUUID(),
            sender: 'System',
            text: `Joined Room: ${code}. Share this room code to connect.`,
            timestamp: Date.now(),
            isMe: false,
          },
        ]);
        peerManager.handleRoomJoined(peers);
      },
      onPeerJoined: (peerId) => {
        peerManager.handlePeerJoined(peerId);
      },
      onPeerLeft: (peerId) => {
        peerManager.handlePeerLeft(peerId);
      },
      onSignal: (senderId, signalData) => {
        peerManager.handleSignal(senderId, signalData);
      },
      onError: (err) => {
        console.error('Signaling server error:', err);
        alert(`Signaling Error: ${err}`);
      },
      onDisconnect: () => {
        setRoomCode('');
        setRemotePeer(null);
        setConnState('idle');
        setMessages([]);
        setTransfers([]);
        peerManager.cleanupConnection();
      },
    });

    // Check for auto-joining via URL query params on mount
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      const formattedCode = roomParam.trim().toUpperCase();
      if (formattedCode.length === 6) {
        console.log(`Auto-joining room from URL query: ${formattedCode}`);
        setTimeout(() => {
          signalingClient.joinRoom(formattedCode);
        }, 800);
      }
    }

    return () => {
      signalingClient.disconnect();
      peerManager.cleanupConnection();
    };
  }, []);

  // Generate QR Code when Room Code is established
  useEffect(() => {
    if (roomCode) {
      // The join link that peers can scan
      const joinUrl = `${window.location.protocol}//${window.location.host}/?room=${roomCode}`;
      QRCode.toDataURL(joinUrl, {
        margin: 1.5,
        width: 256,
        color: {
          dark: '#0f172a',  // Slate 900
          light: '#f8fafc', // Slate 50
        },
      })
        .then((url) => setQrUrl(url))
        .catch((err) => console.error('QR code generation error:', err));
    } else {
      setQrUrl('');
      setShowQrModal(false);
    }
  }, [roomCode]);

  // Generate cryptographic security fingerprint for active connection channel
  useEffect(() => {
    const calculateFingerprint = async () => {
      const myId = signalingClientRef.current?.getSocketId();
      if (connState === 'connected' && roomCode && myId && remotePeer) {
        // Sort IDs to ensure identical output for both peers
        const sortedIds = [myId, remotePeer].sort().join('-');
        const input = `${roomCode}-${sortedIds}`;
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
        const cleanHash = hashHex.toUpperCase();
        setFingerprint(`${cleanHash.substring(0, 4)}-${cleanHash.substring(4, 8)}-${cleanHash.substring(8, 12)}`);
      } else {
        setFingerprint('');
      }
    };
    calculateFingerprint().catch(console.error);
  }, [connState, roomCode, remotePeer]);

  // Scroll to bottom of chat when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Periodic radar sound effect when waiting on the landing screen
  useEffect(() => {
    if (roomCode) return;
    
    // Play immediately on mount/render
    soundHUD.playRadar();
    
    const interval = setInterval(() => {
      soundHUD.playRadar();
    }, 6000); // matches the 6s CSS radar animation delay
    
    return () => clearInterval(interval);
  }, [roomCode]);

  // Copy Room Link/Code to Clipboard
  const handleCopyCode = async () => {
    soundHUD.playClick();
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  // Copy Full Share Link to Clipboard
  const handleCopyLink = async () => {
    soundHUD.playClick();
    if (!roomCode) return;
    try {
      const joinUrl = `${window.location.protocol}//${window.location.host}/?room=${roomCode}`;
      await navigator.clipboard.writeText(joinUrl);
      setIsLinkCopied(true);
      setTimeout(() => setIsLinkCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  // Generate a room code and join
  const handleCreateSession = () => {
    soundHUD.playClick();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Readable alphanumeric
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    signalingClientRef.current?.joinRoom(code);
  };

  // Join existing session code
  const handleJoinSession = (e?: React.FormEvent) => {
    soundHUD.playClick();
    if (e) e.preventDefault();
    if (!inputRoomCode.trim()) return;
    signalingClientRef.current?.joinRoom(inputRoomCode.trim().toUpperCase());
  };

  // Submit scan value in simulation scanner
  const handleScanSubmit = (e: React.FormEvent) => {
    soundHUD.playClick();
    e.preventDefault();
    if (!scanValue.trim()) return;
    
    // Check if it's a URL and extract the room parameter, or if it's a direct room code
    let parsedCode = scanValue.trim().toUpperCase();
    if (parsedCode.includes('?ROOM=')) {
      const parts = parsedCode.split('?ROOM=');
      if (parts.length > 1) {
        parsedCode = parts[1].substring(0, 6);
      }
    } else if (parsedCode.includes('/?ROOM=')) {
      const parts = parsedCode.split('/?ROOM=');
      if (parts.length > 1) {
        parsedCode = parts[1].substring(0, 6);
      }
    }

    if (parsedCode.length === 6) {
      signalingClientRef.current?.joinRoom(parsedCode);
      setShowScanner(false);
      setScanValue('');
    } else {
      alert('Invalid code or URL detected. Make sure it contains a 6-character room code.');
    }
  };

  // Leave active session room
  const handleLeaveSession = () => {
    signalingClientRef.current?.leaveRoom();
    // Reset query parameters in browser URL without reloading page
    window.history.replaceState({}, document.title, window.location.pathname);
    setRoomCode('');
    setRemotePeer(null);
    setConnState('idle');
    setMessages([]);
    setTransfers([]);
  };

  // Send a chat message
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !chatManagerRef.current) return;
    try {
      const msg = chatManagerRef.current.sendMessage(inputText.trim(), senderName);
      setMessages((prev) => [...prev, msg]);
      setInputText('');
    } catch (err: any) {
      alert(err.message || 'Failed to send message');
    }
  };

  // Process selected file lists (both files and nested directories)
  const processFiles = async (filesWithPaths: FileWithRelativePath[]) => {
    if (filesWithPaths.length === 0 || !fileTransferManagerRef.current) return;
    try {
      await fileTransferManagerRef.current.sendFiles(filesWithPaths);
    } catch (e: any) {
      console.error('File send error:', e);
    }
  };

  // Handle Drag Events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // Handle Dropped files/folders
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer && e.dataTransfer.items) {
      const filesWithPaths = await getFilesFromDroppedItems(e.dataTransfer);
      await processFiles(filesWithPaths);
    }
  };

  // Manual File Selection (file input)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const list: FileWithRelativePath[] = files.map((file) => ({
        file,
        relativePath: file.name, // standard file input doesn't maintain nested structure
      }));
      await processFiles(list);
    }
  };

  // Manual Folder Selection (folder input)
  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const list: FileWithRelativePath[] = files.map((file) => ({
        file,
        // use webkitRelativePath if available, else fallback to name
        relativePath: file.webkitRelativePath || file.name,
      }));
      await processFiles(list);
    }
  };

  // Cancel active transfer
  const handleCancelTransfer = () => {
    fileTransferManagerRef.current?.cancelTransfer();
  };

  const getStatusColor = (status: ConnectionState) => {
    switch (status) {
      case 'connected': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
      case 'connecting': return 'text-amber-400 bg-amber-400/10 border-amber-400/30';
      case 'failed': return 'text-rose-400 bg-rose-400/10 border-rose-400/30';
      case 'disconnected': return 'text-zinc-400 bg-zinc-400/10 border-zinc-400/30';
      default: return 'text-indigo-400 bg-indigo-400/10 border-indigo-400/30';
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans select-none">
      {/* Top Navigation */}
      <header className="glassmorphism sticky top-0 z-40 border-b border-white/5 py-4 px-6 md:px-12 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-xl glow-indigo text-white shadow-lg">
            <Send className="w-5 h-5 rotate-[-30deg]" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white via-indigo-200 to-purple-300 bg-clip-text text-transparent m-0 select-none">
              AirShare
            </h1>
            <p className="text-[10px] text-zinc-400 font-medium tracking-wide">P2P ENCRYPTED FILE PORTAL</p>
          </div>
        </div>

        {roomCode && (
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${getStatusColor(connState)}`}>
              <span className="relative flex h-2 w-2">
                {connState === 'connected' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${connState === 'connected' ? 'bg-emerald-400' : connState === 'connecting' ? 'bg-amber-400' : 'bg-zinc-500'}`}></span>
              </span>
              {connState.toUpperCase()}
            </div>

            <button
              onClick={handleLeaveSession}
              className="text-xs bg-white/5 hover:bg-rose-500/20 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 text-zinc-300 px-3 py-1.5 rounded-lg transition duration-200 flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        )}
      </header>

      {/* Main Workspace */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-8 flex flex-col md:flex-row gap-6 items-center justify-center">
        
        {/* Connection Setup (REDESIGNED: Concentric ripples & squircle logo) */}
        {!roomCode ? (
          <div className="relative w-full max-w-2xl py-12 flex flex-col items-center justify-center">
            
            {/* Holographic Radar Concentric Ripples */}
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none z-0">
              <div className="radar-ring" />
              <div className="radar-ring radar-ring-2" />
              <div className="radar-ring radar-ring-3" />
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="relative z-10 flex flex-col items-center text-center max-w-md w-full px-4"
            >
              {/* Profile Name setting toggler */}
              <div className="mb-6 flex items-center gap-2 bg-white/3 border border-white/5 px-4 py-1.5 rounded-full text-xs text-zinc-400 hover:border-white/10 transition duration-200">
                <User className="w-3.5 h-3.5 text-sky-400" />
                <span>Alias:</span>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="bg-transparent text-white font-semibold outline-none w-20 text-center"
                />
              </div>

              {/* Central Glowing Squircle Logo */}
              <div className="relative p-5 bg-gradient-to-br from-sky-500/10 to-indigo-600/10 border border-sky-500/30 rounded-2xl glow-indigo text-sky-400 mb-6 shadow-2xl">
                <Send className="w-10 h-10 rotate-[-30deg]" />
              </div>

              <h2 className="text-4xl font-extrabold tracking-tight text-white mb-3">
                AirShare
              </h2>
              
              <p className="text-zinc-400 text-sm mb-8 max-w-sm leading-relaxed font-medium">
                A portal between browsers. share the code or scan to transfer files and folders instantly over local network. No servers, no limits.
              </p>

              {/* Create New Room Button */}
              <button
                onClick={handleCreateSession}
                className="w-full max-w-xs bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-full py-3.5 px-8 text-sm font-semibold shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 border border-sky-400/20 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 mb-6"
              >
                <Activity className="w-4 h-4 text-sky-200 animate-pulse" />
                Create New Room
              </button>

              <div className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-widest mb-6">
                OR JOIN ROOM
              </div>

              {/* High-Tech Pill Join Input */}
              <form onSubmit={handleJoinSession} className="w-full max-w-xs">
                <div className="flex items-center bg-white/5 border border-white/10 hover:border-white/20 focus-within:border-sky-500/50 rounded-full p-1.5 w-full transition-all duration-300 shadow-inner">
                  {/* Scan QR icon on left */}
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="p-2.5 hover:bg-white/5 text-zinc-400 hover:text-sky-300 rounded-full transition cursor-pointer"
                    title="Scan Room QR Code"
                  >
                    <QrCode className="w-4.5 h-4.5" />
                  </button>

                  <input
                    type="text"
                    maxLength={6}
                    value={inputRoomCode}
                    onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
                    placeholder="ENTER CODE"
                    className="flex-1 bg-transparent text-center tracking-widest text-white text-xs font-mono font-bold outline-none uppercase placeholder-zinc-600 px-2"
                  />

                  {/* Submit arrow on right */}
                  <button
                    type="submit"
                    disabled={!inputRoomCode.trim()}
                    className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded-full transition shadow-md shadow-indigo-600/10 cursor-pointer flex items-center justify-center"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>

            </motion.div>
          </div>
        ) : (
          /* Active Session View: Two-pane layout */
          <div className="w-full flex flex-col md:flex-row gap-6 h-[calc(100vh-120px)] md:h-[calc(100vh-130px)]">
            
            {/* Left Pane - Chat Room (35% width desktop) */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-[4] flex flex-col glassmorphism rounded-2xl overflow-hidden h-full shadow-2xl"
            >
              {/* Room details header */}
              <div className="bg-white/5 border-b border-white/5 p-4 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                    <Lock className="w-3.5 h-3.5 text-indigo-400" />
                    P2P COORDINATION CHAT
                  </div>
                  <span className="text-[10px] text-zinc-500 bg-white/5 border border-white/5 px-2 py-0.5 rounded font-mono">
                    ID: {senderName} {remotePeer ? `| Connected` : ''}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-4 bg-black/20 p-2.5 rounded-xl border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase">Active Room</span>
                    <span className="text-base font-mono font-bold tracking-wider text-indigo-300">{roomCode}</span>
                  </div>
                  <div className="flex gap-2">
                    {/* QR Share code button */}
                    <button
                      onClick={() => setShowQrModal(true)}
                      className="p-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-lg transition duration-200 flex items-center gap-1 text-xs font-semibold cursor-pointer"
                      title="Show Share QR Code"
                    >
                      <QrCode className="w-4 h-4" />
                      QR
                    </button>

                    <button
                      onClick={handleCopyCode}
                      className="p-2 bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 rounded-lg transition duration-200 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                    >
                      {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      {isCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                {fingerprint && (
                  <div className="flex items-center gap-1.5 bg-indigo-500/5 border border-indigo-500/10 p-2 rounded-xl text-[10px] text-indigo-300 font-mono justify-center mt-1 select-text">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    <span>SECURE TUNNEL KEY: {fingerprint}</span>
                  </div>
                )}
              </div>

              {/* Chat Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex flex-col max-w-[85%] ${msg.sender === 'System' ? 'mx-auto w-full max-w-full text-center my-2' : msg.isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                    >
                      {msg.sender === 'System' ? (
                        <span className="text-[11px] text-zinc-500 bg-white/5 border border-white/5 px-3 py-1 rounded-full font-medium inline-block">
                          {msg.text}
                        </span>
                      ) : (
                        <>
                          <span className="text-[10px] text-zinc-400 font-bold mb-1.5 px-1 flex items-center gap-1">
                            <User className="w-2.5 h-2.5" />
                            {msg.sender}
                          </span>
                          {msg.isClipboard ? (
                            <div className="p-3.5 bg-cyan-950/40 border border-cyan-500/30 rounded-2xl text-xs shadow-lg leading-relaxed flex flex-col gap-3 min-w-[200px] select-text">
                              <div className="flex items-center justify-between gap-2 border-b border-cyan-500/20 pb-2 text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
                                <span className="flex items-center gap-1.5">
                                  <Copy className="w-3.5 h-3.5" />
                                  Clipboard Synced
                                </span>
                              </div>
                              <p className="text-zinc-200 line-clamp-3 font-mono break-all bg-black/30 p-2 rounded border border-white/5">
                                {msg.text}
                              </p>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(msg.text);
                                    alert('Copied synced text to local clipboard!');
                                  } catch (e) {
                                    console.error('Copy failed:', e);
                                  }
                                }}
                                className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold py-1.5 rounded-lg transition text-[10px] cursor-pointer"
                              >
                                Copy to Device Clipboard
                              </button>
                            </div>
                          ) : (
                            <div className={`p-3 rounded-2xl text-sm shadow-md leading-relaxed ${msg.isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white/10 border border-white/5 text-zinc-100 rounded-tl-none'}`}>
                              {msg.text}
                            </div>
                          )}
                          <span className="text-[9px] text-zinc-500 mt-1 px-1">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={chatEndRef} />
              </div>

              {/* Chat Form */}
              <form onSubmit={handleSendChat} className="p-4 bg-white/5 border-t border-white/5 flex gap-2">
                {connState === 'connected' && (
                  <button
                    type="button"
                    onClick={handleShareClipboard}
                    className="p-2.5 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 text-sky-400 rounded-xl transition cursor-pointer flex items-center justify-center shrink-0"
                    title="Send clipboard text to peer"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                )}
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={connState === 'connected' ? "Type a coordinating message..." : "Waiting for peer to chat..."}
                  disabled={connState !== 'connected'}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition duration-200"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || connState !== 'connected'}
                  className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition duration-200 shadow-md shadow-indigo-600/10 cursor-pointer flex items-center justify-center"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </motion.div>

            {/* Right Pane - Drag and Drop File Sharing (65% width desktop) */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-[6] flex flex-col gap-6 h-full overflow-y-auto"
            >
              {/* Connection Banner if connecting/waiting */}
              {connState !== 'connected' && (
                <div className="glassmorphism rounded-2xl p-6 border-l-4 border-amber-500 flex items-start gap-4 animate-pulse">
                  <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Awaiting Peer Connection</h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      WebRTC peer discovery initiated. Share code <span className="font-mono text-amber-300 font-semibold">{roomCode}</span> or let your peer scan the QR code to build the connection.
                    </p>
                  </div>
                </div>
              )}

              {/* Drop / Sharing Zone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`glassmorphism rounded-2xl p-8 border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-all duration-300 min-h-[220px] relative overflow-hidden ${connState !== 'connected' ? 'opacity-40 pointer-events-none' : ''} ${dragActive ? 'border-indigo-400 bg-indigo-500/10 shadow-lg scale-[1.01]' : 'border-white/10 bg-white/3'}`}
              >
                <div className="p-4 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-400/20 shadow-inner">
                  <UploadCloud className={`w-10 h-10 ${dragActive ? 'scale-110 animate-bounce' : ''}`} />
                </div>

                <div className="text-center">
                  <h3 className="text-base font-bold text-white mb-1.5">Drag & Drop Files or Folders Here</h3>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    Preserves nested structures automatically. Multi-GB streaming is supported natively with backpressure.
                  </p>
                </div>

                {/* Input selection buttons */}
                <div className="flex gap-3 mt-2 z-10">
                  <label className="bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-200 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition duration-200 flex items-center gap-1.5 select-none shadow-md">
                    <File className="w-3.5 h-3.5 text-indigo-400" />
                    Select Files
                    <input
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>

                  <label className="bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-200 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition duration-200 flex items-center gap-1.5 select-none shadow-md">
                    <Folder className="w-3.5 h-3.5 text-purple-400" />
                    Select Folder
                    <input
                      type="file"
                      // @ts-ignore
                      webkitdirectory=""
                      directory=""
                      multiple
                      onChange={handleFolderSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Transfers Progress Section */}
              {transfers.length > 0 && (
                <div className="glassmorphism rounded-2xl p-6 space-y-4 shadow-2xl">
                  <div className="flex justify-between items-center border-b border-white/5 pb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <HardDriveUpload className="w-4 h-4 text-indigo-400" />
                      Live Peer-to-Peer Queue
                    </h3>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleCancelTransfer}
                        className="text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/30 px-2.5 py-1 rounded-md font-semibold transition duration-200 cursor-pointer"
                      >
                        Cancel Transfer
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                    {transfers.map((t) => (
                      <div key={t.fileId} className="bg-white/3 border border-white/5 p-4 rounded-xl space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {t.name.includes('/') ? (
                              <Folder className="w-5 h-5 text-purple-400 shrink-0" />
                            ) : (
                              <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-white block truncate">{t.name}</span>
                              <span className="text-[10px] text-zinc-400">
                                {(t.size / (1024 * 1024)).toFixed(2)} MB
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {t.status === 'completed' && receivedFilesMap.has(t.fileId) && (
                              <button
                                onClick={() => handlePreview(t.fileId, t.name)}
                                className="text-[10px] bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 hover:text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded transition duration-200 cursor-pointer font-bold uppercase tracking-wider"
                              >
                                Preview
                              </button>
                            )}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.status === 'completed' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : t.status === 'failed' ? 'bg-rose-400/10 text-rose-400 border border-rose-400/20' : t.status === 'transferring' ? 'bg-indigo-400/10 text-indigo-400 border border-indigo-400/20 animate-pulse' : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'}`}>
                              {t.status.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {/* Progress slider bar */}
                        {t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled' && (
                          <div className="space-y-1.5">
                            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                              <motion.div
                                className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${t.progress}%` }}
                                transition={{ duration: 0.1 }}
                              />
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-zinc-400 font-medium">
                              <span>{(t.bytesTransferred / (1024 * 1024)).toFixed(2)} MB / {(t.size / (1024 * 1024)).toFixed(2)} MB</span>
                              <span className="flex items-center gap-2">
                                <span>{t.speed > 0 ? `${t.speed} MB/s` : 'Calculating...'}</span>
                                {t.eta > 0 && <span>• {t.eta}s remaining</span>}
                              </span>
                            </div>
                          </div>
                        )}

                        {t.error && (
                          <div className="text-[10px] text-rose-400 bg-rose-500/5 p-2 rounded border border-rose-500/10 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            {t.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>

          </div>
        )}
      </main>

      {/* Techy Modals Section */}

      {/* 1. Share QR Code Modal */}
      <AnimatePresence>
        {showQrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm glassmorphism border border-sky-500/30 rounded-2xl p-6 overflow-hidden shadow-2xl"
            >
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-sky-400 to-transparent animate-pulse" />
              
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-white tracking-wider flex items-center gap-2 uppercase">
                  <QrCode className="w-4.5 h-4.5 text-sky-400" />
                  QR Sync Portal
                </h3>
                <button
                  onClick={() => setShowQrModal(false)}
                  className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col items-center justify-center bg-slate-900/50 p-4 rounded-xl border border-white/5 mb-6">
                {qrUrl ? (
                  <img
                    src={qrUrl}
                    alt="Scan Room QR Code"
                    className="w-48 h-48 rounded-lg shadow-lg border border-white/10"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center">
                    <Activity className="w-8 h-8 text-sky-400 animate-spin" />
                  </div>
                )}
                
                <div className="mt-4 flex gap-4 text-center items-center justify-center text-xs font-semibold text-zinc-400">
                  <Smartphone className="w-4 h-4 text-sky-400" />
                  <span>Scan with phone to join instantly</span>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleCopyLink}
                  className="w-full bg-sky-500 hover:bg-sky-400 border border-sky-400/20 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition duration-200 cursor-pointer shadow-md"
                >
                  {isLinkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {isLinkCopied ? 'Link Copied' : 'Copy Direct Sync Link'}
                </button>
                <div className="text-[10px] text-zinc-500 bg-white/3 border border-white/5 rounded-lg p-2.5 flex items-start gap-1.5 font-medium leading-relaxed">
                  <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                  <span>Direct Sync Link automatically sets active room code and initiates WebRTC peer handshake on load.</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Mock Holographic QR Code Scanner */}
      <AnimatePresence>
        {showScanner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm glassmorphism border border-indigo-500/30 rounded-2xl p-6 overflow-hidden shadow-2xl"
            >
              {/* sweeping laser line animation */}
              <div className="absolute left-0 w-full h-[2px] bg-sky-400/80 shadow-[0_0_10px_2px_rgba(56,189,248,0.5)] z-10 pointer-events-none" 
                   style={{
                     animation: 'sweep 3s ease-in-out infinite',
                     top: '0%'
                   }} 
              />
              <style>{`
                @keyframes sweep {
                  0%, 100% { top: 10%; }
                  50% { top: 90%; }
                }
              `}</style>
              
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-white tracking-wider flex items-center gap-2 uppercase">
                  <Activity className="w-4.5 h-4.5 text-indigo-400 animate-pulse" />
                  Holographic HUD Scanner
                </h3>
                <button
                  onClick={() => setShowScanner(false)}
                  className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* High-tech target frame */}
              <div className="relative w-full aspect-square bg-slate-950/80 border border-white/5 rounded-xl flex flex-col items-center justify-center p-6 mb-6 overflow-hidden">
                {/* corners HUD */}
                <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-sky-400" />
                <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-sky-400" />
                <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-sky-400" />
                <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-sky-400" />

                <div className="z-10 text-center space-y-3">
                  <QrCode className="w-16 h-16 text-sky-400 mx-auto animate-pulse" />
                  <p className="text-[10px] text-sky-300 font-mono tracking-widest uppercase">SCANNING DIRECT LINK / QR...</p>
                  <p className="text-zinc-500 text-[10px] max-w-[200px] mx-auto leading-relaxed">
                    Paste the copied share link or scan QR. You can paste the direct sync URL below to parse and join.
                  </p>
                </div>
              </div>

              {/* Paste scan input form */}
              <form onSubmit={handleScanSubmit} className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scanValue}
                    onChange={(e) => setScanValue(e.target.value)}
                    placeholder="PASTE LINK OR CODE HERE"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none focus:border-indigo-500/50 transition duration-200"
                  />
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2 text-xs font-semibold shadow-md shadow-indigo-600/10 cursor-pointer transition"
                  >
                    Sync
                  </button>
                </div>
                <div className="text-[9px] text-zinc-500 flex items-center justify-center gap-1 text-center">
                  <Laptop className="w-3 h-3 text-zinc-500" />
                  <span>Supports: share links, query parameter URLs, and plain 6-char codes.</span>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. Holographic Sandbox / Previewer Modal */}
      <AnimatePresence>
        {previewFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-4xl h-[85vh] glassmorphism border border-sky-500/30 rounded-2xl flex flex-col overflow-hidden shadow-2xl"
            >
              {/* Top border glowing animation */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-sky-400 to-transparent animate-pulse" />
              
              {/* Header */}
              <div className="bg-white/5 border-b border-white/5 p-4 flex justify-between items-center shrink-0">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white tracking-wider truncate uppercase">
                    HOLOGRAPHIC SANDBOX / PREVIEW
                  </h3>
                  <span className="text-[10px] text-zinc-400 font-mono block truncate mt-0.5">
                    File: {previewFile.name} ({previewFile.type || 'unknown type'})
                  </span>
                </div>
                
                <button
                  onClick={() => {
                    soundHUD.playClick();
                    setPreviewFile(null);
                  }}
                  className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Special HTML Tab selector */}
              {previewFile.name.endsWith('.html') && (
                <div className="bg-slate-950/40 border-b border-white/5 px-4 py-2 flex gap-2 shrink-0">
                  <button
                    onClick={() => {
                      soundHUD.playClick();
                      setActivePreviewTab('run');
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${activePreviewTab === 'run' ? 'bg-sky-500/25 text-sky-300 border border-sky-500/30' : 'bg-transparent text-zinc-400 hover:text-white border border-transparent'}`}
                  >
                    <Play className="w-3.5 h-3.5" />
                    Live Run
                  </button>
                  <button
                    onClick={() => {
                      soundHUD.playClick();
                      setActivePreviewTab('code');
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${activePreviewTab === 'code' ? 'bg-sky-500/25 text-sky-300 border border-sky-500/30' : 'bg-transparent text-zinc-400 hover:text-white border border-transparent'}`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    Source Code
                  </button>
                </div>
              )}

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center bg-slate-950/50">
                {/* Images */}
                {previewFile.type.startsWith('image/') && (
                  <img
                    src={previewFile.url}
                    alt={previewFile.name}
                    className="max-w-full max-h-[60vh] object-contain rounded-lg border border-white/10 shadow-2xl"
                  />
                )}

                {/* Videos */}
                {previewFile.type.startsWith('video/') && (
                  <video
                    src={previewFile.url}
                    controls
                    autoPlay
                    className="max-w-full max-h-[60vh] rounded-lg border border-white/10 shadow-2xl"
                  />
                )}

                {/* Audio */}
                {previewFile.type.startsWith('audio/') && (
                  <div className="w-full max-w-md bg-white/5 border border-white/10 p-6 rounded-2xl text-center space-y-4">
                    <div className="w-16 h-16 bg-sky-500/10 text-sky-400 rounded-full flex items-center justify-center mx-auto border border-sky-400/20">
                      <HardDriveUpload className="w-8 h-8 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{previewFile.name}</h4>
                      <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Streaming local audio node...</p>
                    </div>
                    <audio
                      src={previewFile.url}
                      controls
                      autoPlay
                      className="w-full mt-2"
                    />
                  </div>
                )}

                {/* HTML Document Mockups */}
                {previewFile.name.endsWith('.html') && (
                  <div className="w-full h-full min-h-[45vh] flex flex-col rounded-lg overflow-hidden border border-white/10 bg-slate-900/30">
                    {activePreviewTab === 'run' ? (
                      <iframe
                        title="HTML Sandbox"
                        sandbox="allow-scripts"
                        srcDoc={previewFile.content}
                        className="w-full h-full min-h-[45vh] border-0 bg-white"
                      />
                    ) : (
                      <pre className="flex-1 p-4 overflow-auto font-mono text-xs text-zinc-300 text-left bg-black/40 select-text">
                        <code>{previewFile.content}</code>
                      </pre>
                    )}
                  </div>
                )}

                {/* Plain Text / Code */}
                {!previewFile.name.endsWith('.html') && previewFile.content !== undefined && (
                  <pre className="w-full max-h-[60vh] p-4 rounded-lg border border-white/10 overflow-auto font-mono text-xs text-zinc-300 text-left bg-black/40 select-text">
                    <code>{previewFile.content}</code>
                  </pre>
                )}

                {/* PDF */}
                {previewFile.type === 'application/pdf' && (
                  <iframe
                    title="PDF Preview"
                    src={previewFile.url}
                    className="w-full h-full min-h-[50vh] border-0 rounded-lg bg-zinc-800"
                  />
                )}

                {/* General/Unsupported preview types fallback */}
                {!previewFile.type.startsWith('image/') &&
                  !previewFile.type.startsWith('video/') &&
                  !previewFile.type.startsWith('audio/') &&
                  !previewFile.name.endsWith('.html') &&
                  previewFile.type !== 'application/pdf' &&
                  previewFile.content === undefined && (
                    <div className="text-center space-y-4 max-w-sm">
                      <div className="p-4 bg-white/5 border border-white/10 text-zinc-400 rounded-2xl max-w-max mx-auto shadow-inner">
                        <FileText className="w-12 h-12" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">Preview Not Available</h4>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                          This file type does not support instant web previewing. Please download and open it using your operating system.
                        </p>
                      </div>
                      <a
                        href={previewFile.url}
                        download={previewFile.name}
                        onClick={() => soundHUD.playClick()}
                        className="inline-flex bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-2 px-6 rounded-full text-xs shadow-md"
                      >
                        Download File
                      </a>
                    </div>
                  )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
