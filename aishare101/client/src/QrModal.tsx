import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  X, 
  QrCode, 
  Camera, 
  Copy, 
  Check, 
  Share2, 
  Upload, 
  AlertCircle, 
  RefreshCw, 
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { soundHUD } from './utils/sounds';

interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  initialTab?: 'show' | 'scan';
  onJoinRoom: (code: string) => void;
  onCreateRoom?: () => void;
}

export const QrModal: React.FC<QrModalProps> = ({
  isOpen,
  onClose,
  roomCode,
  initialTab = 'show',
  onJoinRoom,
  onCreateRoom,
}) => {
  const [activeTab, setActiveTab] = useState<'show' | 'scan'>(initialTab);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [manualCode, setManualCode] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanningActive, setIsScanningActive] = useState<boolean>(false);
  const [fileScanLoading, setFileScanLoading] = useState<boolean>(false);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scannerContainerId = 'airshare-qr-scanner-stream';

  // Sync active tab when modal opens or initialTab changes
  useEffect(() => {
    if (isOpen) {
      setActiveTab(roomCode ? initialTab : 'scan');
      setCameraError(null);
      setManualCode('');
    }
  }, [isOpen, initialTab, roomCode]);

  // Generate ultra-high contrast, camera-friendly QR code
  useEffect(() => {
    if (roomCode) {
      const joinUrl = `${window.location.protocol}//${window.location.host}/?room=${roomCode}`;
      QRCode.toDataURL(joinUrl, {
        margin: 3,
        width: 380,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Failed to generate QR code:', err));
    } else {
      setQrDataUrl('');
    }
  }, [roomCode]);

  // Parse room code from scanned string
  const parseScannedText = (text: string): string | null => {
    if (!text) return null;
    const clean = text.trim();
    // Check for ?room= or ?ROOM=
    const upper = clean.toUpperCase();
    if (upper.includes('?ROOM=')) {
      const parts = upper.split('?ROOM=');
      if (parts.length > 1) {
        const potential = parts[1].slice(0, 6);
        if (potential.length === 6) return potential;
      }
    }
    // Check if whole text is 6 alphanumeric characters
    const alphanumericOnly = clean.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (alphanumericOnly.length === 6) {
      return alphanumericOnly;
    }
    // If it contains a URL with a path or query
    try {
      const url = new URL(clean);
      const r = url.searchParams.get('room');
      if (r && r.length === 6) {
        return r.toUpperCase();
      }
    } catch {
      // not a standard URL
    }
    return null;
  };

  const handleScanSuccess = (decodedText: string) => {
    soundHUD.playSuccess();
    const code = parseScannedText(decodedText);
    if (code) {
      stopCameraScanner().then(() => {
        onJoinRoom(code);
        onClose();
      });
    } else {
      setCameraError(`Scanned content is not an AirShare room: "${decodedText.slice(0, 40)}..."`);
    }
  };

  const stopCameraScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      } finally {
        html5QrCodeRef.current = null;
        setIsScanningActive(false);
      }
    }
  };

  // Start the camera scanner when on 'scan' tab
  const startCameraScanner = async () => {
    setCameraError(null);
    await stopCameraScanner();

    // Check if element exists in DOM
    const element = document.getElementById(scannerContainerId);
    if (!element) return;

    try {
      const scanner = new Html5Qrcode(scannerContainerId, { verbose: false });
      html5QrCodeRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        () => {
          // Frame error (no QR code detected in current frame) - intentionally ignore
        }
      );
      setIsScanningActive(true);
    } catch (err: any) {
      console.warn('Camera start error:', err);
      setIsScanningActive(false);
      const msg = err?.message || String(err);
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setCameraError('Camera permission was denied. Please allow camera access in your browser settings.');
      } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError')) {
        setCameraError('No camera found on this device. You can upload an image or enter the room code below.');
      } else {
        setCameraError('Could not start live camera preview. You can upload a QR image or enter the code manually.');
      }
    }
  };

  // Manage scanner lifecycle on tab switch and modal close
  useEffect(() => {
    if (isOpen && activeTab === 'scan') {
      const timer = setTimeout(() => {
        startCameraScanner();
      }, 250);
      return () => {
        clearTimeout(timer);
        stopCameraScanner();
      };
    } else {
      stopCameraScanner();
    }
  }, [isOpen, activeTab]);

  // Scan QR code from uploaded image
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileScanLoading(true);
    setCameraError(null);
    try {
      // Create temporary scanner instance for file decoding
      const tempScanner = new Html5Qrcode('airshare-qr-file-decoder', { verbose: false });
      const result = await tempScanner.scanFile(file, false);
      tempScanner.clear();
      const code = parseScannedText(result);
      if (code) {
        soundHUD.playSuccess();
        await stopCameraScanner();
        onJoinRoom(code);
        onClose();
      } else {
        setCameraError(`Scanned image did not contain an AirShare room code.`);
      }
    } catch (err: any) {
      console.warn('File scan error:', err);
      setCameraError('Could not read a QR code from that image. Ensure the QR is clear and well-lit.');
    } finally {
      setFileScanLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    soundHUD.playClick();
    const code = parseScannedText(manualCode);
    if (code) {
      stopCameraScanner().then(() => {
        onJoinRoom(code);
        onClose();
      });
    } else {
      setCameraError('Invalid code or URL. Please enter a 6-character room code.');
    }
  };

  const handleCopyLink = async () => {
    soundHUD.playClick();
    if (!roomCode) return;
    const shareUrl = `${window.location.protocol}//${window.location.host}/?room=${roomCode}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.error('Copy link failed:', err);
    }
  };

  const handleNativeShare = async () => {
    soundHUD.playClick();
    if (!roomCode) return;
    const shareUrl = `${window.location.protocol}//${window.location.host}/?room=${roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join AirShare Room ${roomCode}`,
          text: `Connect to my peer-to-peer AirShare room to transfer files at Gigabit speeds!`,
          url: shareUrl,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      {/* Hidden file decoder container required by Html5Qrcode for scanFile */}
      <div id="airshare-qr-file-decoder" className="hidden" />

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-sm sm:max-w-md glassmorphism border border-sky-500/30 rounded-3xl p-5 sm:p-6 overflow-hidden shadow-2xl bg-slate-950/90 text-white flex flex-col max-h-[92vh]"
      >
        {/* Glow Header Accent */}
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-sky-400 to-transparent animate-pulse" />

        {/* Modal Top Bar */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-wider uppercase text-white">QR Mesh Portal</h3>
              <p className="text-[10px] text-zinc-400">Instant cross-device peer pairing</p>
            </div>
          </div>
          <button
            onClick={() => {
              soundHUD.playClick();
              stopCameraScanner();
              onClose();
            }}
            className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Tab Switcher */}
        <div className="flex bg-white/5 border border-white/10 rounded-2xl p-1 mb-5">
          <button
            type="button"
            onClick={() => {
              soundHUD.playClick();
              setActiveTab('show');
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'show'
                ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <QrCode className="w-4 h-4" />
            Show QR Code
          </button>
          <button
            type="button"
            onClick={() => {
              soundHUD.playClick();
              setActiveTab('scan');
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'scan'
                ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Camera className="w-4 h-4" />
            Scan QR Code
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar space-y-4">
          {/* TAB 1: SHOW QR CODE */}
          {activeTab === 'show' && (
            <div className="flex flex-col items-center text-center space-y-4 animate-in fade-in duration-200">
              {roomCode ? (
                <>
                  {/* High Contrast White QR Card for 100% Phone Camera Recognition */}
                  <div className="bg-white p-3.5 sm:p-4 rounded-2xl shadow-2xl border-4 border-sky-400/20 flex items-center justify-center">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt={`AirShare Room ${roomCode} QR Code`}
                        className="w-48 h-48 sm:w-56 sm:h-56 block object-contain select-none"
                      />
                    ) : (
                      <div className="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center text-slate-900 font-mono text-xs">
                        Generating QR...
                      </div>
                    )}
                  </div>

                  {/* Room Code Badge */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 w-full flex items-center justify-between">
                    <div className="text-left">
                      <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold block">
                        Room Code
                      </span>
                      <span className="font-mono text-lg font-black tracking-widest text-sky-400">
                        {roomCode}
                      </span>
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {isCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  {/* Share Action Buttons */}
                  <div className="w-full space-y-2">
                    <button
                      onClick={handleNativeShare}
                      className="w-full py-2.5 px-4 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 cursor-pointer transition duration-200"
                    >
                      <Share2 className="w-4 h-4" />
                      Share Room Link / Mobile Sheet
                    </button>
                  </div>

                  <p className="text-[11px] text-zinc-400 max-w-xs leading-relaxed">
                    Point your iPhone or Android camera app at this QR code to automatically open and connect.
                  </p>
                </>
              ) : (
                /* Empty state when not currently in a room */
                <div className="py-8 px-4 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="p-4 bg-white/5 rounded-3xl border border-white/10 text-sky-400">
                    <Sparkles className="w-10 h-10 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">No Active Room Selected</h4>
                    <p className="text-xs text-zinc-400 max-w-xs mt-1 leading-relaxed">
                      Create an instant room first to generate your custom QR code, or switch to the Scan tab to join a peer's room.
                    </p>
                  </div>
                  {onCreateRoom && (
                    <button
                      onClick={() => {
                        soundHUD.playClick();
                        onCreateRoom();
                      }}
                      className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg cursor-pointer transition"
                    >
                      Create Room Now
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SCAN QR CODE */}
          {activeTab === 'scan' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Camera Scanner Container */}
              <div className="relative w-full aspect-square bg-slate-950 rounded-2xl overflow-hidden border border-sky-500/30 shadow-inner flex flex-col items-center justify-center">
                {/* The actual video element managed by Html5Qrcode */}
                <div
                  id={scannerContainerId}
                  className="w-full h-full object-cover [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
                />

                {/* Holographic targeting overlay */}
                {isScanningActive && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                    {/* Targeting frame corners */}
                    <div className="relative w-56 h-56">
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-sky-400" />
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-sky-400" />
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-sky-400" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-sky-400" />

                      {/* Animated Laser Scan Line */}
                      <div className="absolute left-0 right-0 h-[2px] bg-sky-400 shadow-[0_0_8px_2px_rgba(56,189,248,0.7)] animate-bounce top-1/2 -translate-y-1/2" />
                    </div>
                    <span className="mt-3 text-[10px] uppercase font-mono tracking-widest text-sky-300 bg-black/60 px-2.5 py-1 rounded-full border border-sky-500/20">
                      Align QR inside frame
                    </span>
                  </div>
                )}

                {/* Fallback / Error State inside viewport if camera failed */}
                {cameraError && (
                  <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center space-y-3 z-10">
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400">
                      <AlertCircle className="w-8 h-8" />
                    </div>
                    <p className="text-xs text-zinc-300 font-medium max-w-xs leading-relaxed">
                      {cameraError}
                    </p>
                    <button
                      onClick={startCameraScanner}
                      className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Retry Camera
                    </button>
                  </div>
                )}
              </div>

              {/* Upload QR Image / Screenshot Option */}
              <div className="flex gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={fileScanLoading}
                  className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-zinc-200 flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
                >
                  <Upload className="w-4 h-4 text-sky-400" />
                  {fileScanLoading ? 'Decoding Image...' : 'Scan from Photo / Screenshot'}
                </button>
              </div>

              {/* Manual Input / Paste Fallback */}
              <form onSubmit={handleManualSubmit} className="space-y-1.5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="PASTE LINK OR 6-DIGIT CODE"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-white text-xs outline-none focus:border-sky-500/50 uppercase font-mono tracking-wider transition"
                  />
                  <button
                    type="submit"
                    disabled={!manualCode.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded-xl px-4 py-2 text-xs font-bold shadow-md cursor-pointer transition"
                  >
                    Join
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500 text-center">
                  Supports full share links (https://...) and 6-letter room codes.
                </p>
              </form>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
