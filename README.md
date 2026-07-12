# AirShare 🚀

AirShare is a high-performance, secure, and futuristic peer-to-peer (P2P) file and clipboard sharing web application. Built on top of WebRTC and WebSockets, AirShare allows instantaneous local sharing directly between devices without requiring cloud storage or intermediate servers, acting as a powerful web-based alternative to AirDrop.

---

## 🌟 Key Features

### 1. 🎛️ Holographic Sandbox & Direct Web Previewer
Preview received files directly in the browser before downloading them:
*   **Media support**: Seamless playback of images, video, and audio.
*   **Document support**: View PDF and Markdown files directly.
*   **Code Sandbox**: Run HTML/CSS/JS files in an isolated live preview panel alongside a syntax-highlighted code editor.

### 2. 🎵 Retro-Futuristic Sound HUD
Immersive audio cues synthesized dynamically using the Web Audio API:
*   **Radar Pulse**: Audio pulses aligned with the search animations.
*   **Arpeggio chime**: Plays when a peer connects successfully.
*   **Completion chime**: Dual high-frequency chime on successful transfers.
*   **System fail tone**: Descending sawtooth buzz on transfer errors.

### 3. 🔒 E2EE Verification Fingerprints
End-to-end security verification:
*   Generates a cryptographically secure 256-bit SHA-256 fingerprint based on local and remote WebRTC credentials.
*   Allows users to manually verify they are connected via a secure, un-hijacked tunnel.

### 4. 📋 Universal Clipboard Text Sync
*   Instantly read and share clipboard text between devices with a single click.
*   Received clipboards display clean, quick-copy utility cards.

### 5. 🔄 Auto-Resume Connection Recovery
*   Resilience against dropped connections.
*   If a transfer is interrupted, the receiver calculates the received chunk indexes, syncs the checksum, and resumes the transfer from the last verified block automatically.

---

## 📂 Directory Structure

The project code is organized as follows:

```text
airshare/
├── aishare101/                # Core application directory
│   ├── client/                # React (TypeScript + Vite) frontend
│   │   ├── src/               # React components, custom hooks, WebRTC managers
│   │   └── package.json
│   ├── server/                # Node.js TypeScript signaling server
│   │   ├── src/               # WebSocket server connection logic
│   │   └── package.json
│   └── package.json           # Root scripts
└── README.md                  # This file
```

---

## ⚙️ Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### Setup and Running

1.  **Clone/Open the repository**:
    ```bash
    cd airshare/aishare101
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Run the Signaling Server**:
    ```bash
    npm run dev -w server
    ```
    The server will run on `http://localhost:4000`.

4.  **Run the Web Client**:
    In a new terminal window:
    ```bash
    npm run dev -w client
    ```
    The web interface will start, usually on `http://localhost:5173` or `http://localhost:5174`.

---

## 🛠️ Technology Stack
*   **Frontend**: React, TypeScript, Tailwind CSS, Lucide Icons, Framer Motion
*   **Backend**: Node.js, Express, Socket.io (for signaling)
*   **P2P Connection**: WebRTC Data Channels (for file/chat transmission)
*   **Audio Synthesis**: Web Audio API (custom sound HUD)
