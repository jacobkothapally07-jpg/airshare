# ✈️ AirShare — Decentralized P2P File Sharing & Universal Clipboard Portal

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19-61dafb.svg?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg?logo=typescript)
![Tailwind](https://img.shields.io/badge/TailwindCSS-v4-38bdf8.svg?logo=tailwindcss)
![WebRTC](https://img.shields.io/badge/WebRTC-P2P%20Mesh-333333.svg?logo=webrtc)
![Socket.io](https://img.shields.io/badge/Socket.io-Signaling-010101.svg?logo=socketdotio)

**A decentralized, browser-to-browser WebRTC portal for instant multi-device file streaming and universal clipboard synchronization. Zero middleman servers, no file size limits, and full end-to-end encryption.**

[🚀 Live Demo](https://airsharez.netlify.app/) • [✨ Features](#-key-features) • [🏗️ Architecture](#-architecture) • [💻 Local Setup](#-getting-started)

</div>

---

## 🌟 Key Features

### 🌐 Multi-Device WebRTC Mesh Rooms
* **Multi-Peer Sync**: Connect multiple laptops, phones, and tablets simultaneously using a single 6-character room code.
* **Decentralized Broadcast**: Files, folders, and messages stream directly peer-to-peer across a full mesh network with zero server bandwidth.
* **Dynamic Room Presence**: Live indicator chips reflect all connected devices in the room.

### 📋 Universal Clipboard Hub
* **Instant Text Broadcast**: Click **"Sync Clipboard"** to automatically read your device's clipboard and broadcast text, code snippets, or URLs to all connected devices in the mesh.
* **1-Click Device Copy**: Received clipboard cards include character counts and an instant copy button with toast feedback.

### 📁 High-Performance P2P File & Folder Streaming
* **Zero-Copy Binary Streaming**: High-throughput file transfers multiplexed over WebRTC `RTCDataChannel`.
* **Adaptive Backpressure**: Monitors `bufferedAmount` to prevent buffer overflow and browser memory exhaustion during multi-gigabyte transfers.
* **Recursive Folder Preservation**: Drag-and-drop entire folders while retaining nested path structures.

### 🛡️ Cryptographic E2EE Security & Fingerprints
* **Deterministic SHA-256 Mesh Keys**: Cryptographic security fingerprints calculated independently by all devices verify connection path integrity (`SHA-256(roomCode + sortedPeers)`).

### 🔍 Holographic Sandbox & In-Browser File Previewer
* **Live HTML Sandbox**: Test and preview dropped HTML mockups inside a secure sandboxed iframe with code inspection tabs.
* **Media Lightbox**: Direct web previewing for images, videos, audio, PDFs, and syntax-highlighted code files.

### 🔄 Auto-Resume & Integrity Checksum Engine
* **Incremental CRC32**: Hardware-accelerated incremental checksum computation validates file integrity upon receipt.
* **Reconnection Recovery**: If a connection temporarily drops, transfers automatically resume from the last acknowledged 64KB chunk.

### 🎵 Retro-Futuristic Sound HUD
* **Zero-Download Audio Engine**: Procedurally synthesized sound effects (radar sweeps, arpeggio chimes, success bells) generated on-the-fly via the Web Audio API.

---

## 🏗️ Architecture & Project Structure

AirShare is structured as an **npm workspaces monorepo**:

```
airshare/
├── package.json               # Monorepo workspaces definition
├── netlify.toml               # Netlify continuous deployment config
├── .gitignore
├── aishare101/
│   ├── client/                # Frontend React 19 Application
│   │   ├── index.html
│   │   ├── vite.config.ts     # Vite bundler with Tailwind CSS v4
│   │   ├── src/
│   │   │   ├── App.tsx        # Dual-pane glassmorphic dashboard & HUD
│   │   │   ├── index.css      # Glassmorphic animations & styling
│   │   │   ├── utils/
│   │   │   │   ├── crc32.ts   # Table-based CRC32 checksum engine
│   │   │   │   ├── directory.ts # HTML5 recursive directory crawler
│   │   │   │   └── sounds.ts  # Web Audio API Sound HUD synthesizer
│   │   │   └── webrtc/
│   │   │       ├── types.ts   # Protocol schemas & control messages
│   │   │       ├── SignalingClient.ts     # Socket.io room coordinator
│   │   │       ├── PeerManager.ts         # Full-mesh RTCPeerConnection manager
│   │   │       ├── ChatManager.ts         # Multi-peer chat & clipboard sync
│   │   │       └── FileTransferManager.ts # Chunking, streaming & ACK recovery
│   │   └── package.json
│   └── server/                # Lightweight Signaling Coordinator
│       ├── tsconfig.json
│       ├── src/
│       │   └── index.ts       # Socket.io room coordinator (zero file transit)
│       └── package.json
```

---

## 💻 Getting Started

### Prerequisites
* **Node.js**: `v18.0.0` or higher
* **npm**: `v9.0.0` or higher

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/jacobkothapally07-jpg/airshare.git
cd airshare/aishare101
npm install
```

### 2. Start the Signaling Server
```bash
npm run dev -w server
# Signaling server runs on http://localhost:4000
```

### 3. Start the Web Client
In a new terminal window:
```bash
npm run dev -w client
# Frontend runs on http://localhost:5173
```

### 4. Open and Test
1. Open `http://localhost:5173` on multiple browser tabs or devices on the same Wi-Fi.
2. Click **Create Shared Room** in Tab 1.
3. Enter the 6-character room code in Tab 2 and Tab 3.
4. Enjoy instant multi-peer file sharing and clipboard synchronization!

---

## 🚀 Deployment

| Component | Platform | Configuration |
| :--- | :--- | :--- |
| **Frontend** | [Netlify](https://netlify.com) | Base: `aishare101/client` • Publish: `dist` • Live at: **[https://airsharez.netlify.app](https://airsharez.netlify.app)** |
| **Signaling Server** | [Render](https://render.com) | Node.js Web Service • Build: `npm install && npm run build` • Live at: **[https://airshare-uhi5.onrender.com](https://airshare-uhi5.onrender.com)** |

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
