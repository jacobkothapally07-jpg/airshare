# 🚀 AirShare — Commercial Advancements & Feature Roadmap

This document outlines the priority improvements to implement before listing AirShare for sale on Acquire.com, Flippa, or Gumroad.

---

## 📋 1. Core Feature Advancements
- [ ] **PWA & Mobile Install Prompt:** Add `manifest.webmanifest`, service worker, and an "Install AirShare" prompt for iOS/Android home screens.
- [ ] **Transfer Speed (MB/s) & ETA Calculator:** Real-time throughput metrics (`45.2 MB/s • 00:08 remaining`) during P2P chunk transfers.
- [ ] **PIN / Password-Protected Rooms:** Optional 4-digit PIN for private/secure room locks.
- [ ] **Sound HUD Mute Toggle (🔊 / 🔇):** Header icon to mute/unmute Web Audio API synthesized sound effects.
- [ ] **Batch Download as ZIP:** 1-click button to zip and download multiple received files simultaneously.
- [ ] **Mobile Native Share Sheet:** Use `navigator.share` to share room links directly to WhatsApp, iMessage, and Slack.

---

## 💰 2. Monetization & Buyer Appeal
- [ ] **Configurable Ad Slots:** Turnkey banner placeholders (Google AdSense / EthicalAds / CarbonAds) controlled via `.env` or config flags.
- [ ] **AirShare Pro Showcase Modal:** Polished preview modal highlighting future subscription features (Custom URLs, unexpiring rooms, priority relay).
- [ ] **Analytics Snippet Slot:** Ready-to-go script injection for Plausible / Google Analytics.

---

## 📦 3. Completed Foundations (Already in Repo)
- [x] Full-mesh WebRTC multi-peer data streaming & chunking
- [x] Universal clipboard sync with instant toast feedback
- [x] Hardware-accelerated CRC32 file integrity validation
- [x] In-browser HTML sandbox previewer
- [x] One-command Docker & Docker-Compose deployment (`docker-compose.yml`)
- [x] Technical Buyer Handoff Manual (`BUYER_HANDOFF.md`)
