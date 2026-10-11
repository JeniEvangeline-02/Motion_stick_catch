# Motion Stick Catch — Recreation of SwayJoy Webcam Reaction Game

A faithful recreation of the browser game **Motion Stick Catch** from [SwayJoy](https://swayjoy.com/games/motion-stick-catch-reaction-game).

---

## 🎮 Game Overview

Motion Stick Catch is a reaction-time arcade game where five blue cylinders hang from an overhead yellow rack (`SWAYJOY / REFLEX CLUB`). After a randomized pause, one stick drops without warning. Players must watch the rack, aim their hand/reticle, and close their fist (or click/tap) to catch the falling stick before it passes the screen.

### Features
- **Faithful Visual Design**: Pastel gradient sky, layered clouds, 3D rack structure with hanging cables, 3D blue cylindrical sticks with golden end-caps, animated confetti effects, and authentic typography matching SwayJoy.
- **Three Challenge Modes**:
  - 🟢 **Warm-up** (`gravity: 0.75`, `1.0x` score multiplier)
  - 🔵 **Classic** (`gravity: 1.25`, `1.5x` score multiplier)
  - 🟠 **Lightning** (`gravity: 1.90`, `2.0x` score multiplier)
- **Computer Vision & Hand Tracking**:
  - Real-time on-device hand tracking via MediaPipe.
  - Natural gesture mechanics: Requires showing an **open palm** to arm the grab, then **closing your fist** over the stick to catch. Must reopen between catches.
- **Alternative Controls**:
  - Mouse & Touchscreen: Aim and click/tap.
  - Keyboard: Arrow keys to move cursor, Spacebar to grab, `P` or `Esc` to pause.
- **Audio Synthesizer**: Web Audio API oscillator reproducing authentic game chimes for drops, catches, misses, and UI toggles.
- **Statistics & Persistence**: Tracks caught count (`/12`), reaction times in milliseconds, streaks, and best scores per difficulty saved to `localStorage`.

---

## 📁 Project Structure

```
motion-stick-catch/
├── index.html         # Complete semantic markup, modal overlays, and HUD
├── style.css          # Authentic CSS theme, gradients, animations, and typography
├── script.js          # Game engine, MediaPipe tracking, audio synthesis, and canvas renderer
├── assets/
│   ├── menu-background-v2.webp   # Authentic SwayJoy arcade menu background
│   └── cover.webp                # Reference cover artwork
├── README.md          # Project documentation and guide
├── package.json       # Project metadata and helper scripts
└── motion-stick-catch.zip # Downloadable standalone archive
```

---

## 🚀 Running Locally

### Option 1: Python HTTP Server (Recommended)
Because modern browsers require a secure origin (`localhost` or `HTTPS`) to access the webcam via `navigator.mediaDevices.getUserMedia`, serve the directory over HTTP:

1. Open a terminal or PowerShell in the project directory:
   ```bash
   cd motion-stick-catch
   ```
2. Start the local server:
   ```bash
   python -m http.server 8000
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:8000
   ```

### Option 2: Node.js / NPX
```bash
npx serve .
```
Navigate to the URL displayed in the console (usually `http://localhost:3000`).

---

## 🕹️ How to Play

1. **Select Difficulty**: Choose between *Warm-up*, *Classic*, or *Lightning*.
2. **Choose Control Mode**:
   - **Play with camera**:
     1. Grant browser webcam permissions when prompted.
     2. Press **Start round**.
     3. Present one open hand to the camera. The automatic `3, 2, 1` countdown begins.
     4. Move your hand to move the cartoon glove reticle.
     5. When a stick falls, align the glove over it and **close your fist** to catch!
     6. **Reopen your hand** before the next catch.
   - **Play with mouse / touch**:
     - Aim with your cursor and click to grab.
     - Or use Arrow keys + Space.
3. **Win Conditions**:
   - Each round has **12 drops**.
   - You have **3 chances** (lives).
   - Clear all 12 drops to complete the level!

---

## 📦 Dependencies & Licenses

| Dependency | Purpose | License | CDN / Source |
|---|---|---|---|
| **MediaPipe Hands** | Browser-based real-time 21-landmark hand pose estimation | Apache 2.0 | `@mediapipe/hands` |
| **MediaPipe Camera Utils** | Frame capture helper for video streams | Apache 2.0 | `@mediapipe/camera_utils` |
| **Jost Font** | Google Fonts typography | SIL Open Font License (OFL) | `fonts.google.com` |
| **Web Audio API** | Native browser sound synthesis | Standard W3C API | Native browser |

---

## 🔍 Implementation Notes & Differences

- **Nuxt/Vue vs Vanilla JS**: The original SwayJoy web application is compiled with Nuxt.js/Vue 3. This recreation is implemented in standalone **Vanilla HTML, CSS, and modern JavaScript**, eliminating heavy framework build steps and runtime dependencies while preserving the exact DOM hierarchy, class names, and animations.
- **Computer Vision Pipeline**: The recreation implements the identical landmark angle analysis (`analyzeHandPose`) and arming/disarming timing requirements (`65ms` open palm arming, `32ms` fist grab window).