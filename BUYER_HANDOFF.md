# 🤝 AirShare — Buyer Handoff & Technical Due Diligence Guide

Thank you for acquiring / inspecting **AirShare**! This guide contains all the technical details, architecture specs, deployment instructions, and commercial growth strategies for the asset.

---

## 📦 1. Included Assets
- **Frontend App:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Framer Motion.
- **Backend Signaling Service:** Node.js, Express, Socket.io.
- **Containerization:** Production Dockerfiles + `docker-compose.yml` for 1-command deployment.
- **Full IP & Source Code:** 100% proprietary ownership, clean MIT dependencies.
- **Deployment Setups:** Pre-configured for Netlify/Vercel (Client) and Render/Railway/Docker (Server).

---

## ⚡ 2. Infrastructure Costs & Scalability
- **Bandwidth Cost: ~$0.** All files and clipboard data transfer directly peer-to-peer (P2P) across the browser via WebRTC `RTCDataChannel`.
- **Signaling Server Cost:** A $5/month instance on Render, DigitalOcean, or Railway can handle over 5,000+ concurrent active signaling connections because it only relays room discovery messages (SDP offer/answer and ICE candidates).

---

## 🛠️ 3. How to Deploy (Production)

### Option A: One-Command Docker Setup
```bash
docker-compose up -d --build
```
- Client runs on `http://localhost` (Port 80).
- Signaling server runs on `http://localhost:4000`.

### Option B: Cloud Hosting (Netlify + Render)
1. **Frontend (Netlify / Vercel):**
   - Connect the repository.
   - Base directory: `aishare101/client`
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Environment Variable: `VITE_SIGNAL_SERVER_URL=https://your-signaling-server.onrender.com`
2. **Signaling Server (Render / Railway / Fly.io):**
   - Base directory: `aishare101/server`
   - Build command: `npm install && npm run build`
   - Start command: `npm start`

---

## 💰 4. Growth & Monetization Roadmap for New Owner
1. **Display Advertising:** Embed responsive ad units (EthicalAds, CarbonAds, Google AdSense) on the room lobby.
2. **AirShare Pro (Subscription Tier):**
   - Branded custom room URLs (e.g. `airshare.sh/acme-corp`).
   - Permanent rooms that don't expire after disconnection.
   - P2P file password/PIN protection.
3. **Enterprise / Self-Hosted B2B:**
   - Package as an on-premise internal file transfer appliance for design agencies, hospitals, and engineering firms needing air-gapped local Wi-Fi transfer without cloud leakage.
