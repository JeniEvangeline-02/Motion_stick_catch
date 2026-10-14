/**
 * Motion Stick Catch — SwayJoy Recreation Game
 * Full-screen layout, seamless flow, and robust real-time webcam hand tracking.
 */

// ============================================================================
// 1. SOUND EFFECTS SYNTHESIZER (Web Audio API)
// ============================================================================
class SoundEffects {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { });
        }
    }

    play(type) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = type === 'miss' ? 'triangle' : 'sine';
            const startFreq = type === 'catch' ? 650 : (type === 'drop' ? 370 : 180);
            const endFreq = type === 'catch' ? 1000 : 100;

            osc.frequency.setValueAtTime(startFreq, now);
            osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.15);

            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.21);
        } catch (e) {
            // Audio context policy fallback
        }
    }
}

const sfx = new SoundEffects();

// ============================================================================
// 2. GAME MECHANICS CONSTANTS & ENGINE
// ============================================================================
const DIFFICULTIES = {
    easy: { label: 'Warm-up', gravity: 0.75, bonus: 1.0 },
    normal: { label: 'Classic', gravity: 1.25, bonus: 1.5 },
    fast: { label: 'Lightning', gravity: 1.9, bonus: 2.0 }
};

const RACK_SCALE = 0.7;
const BASE_LANES = [0.18, 0.34, 0.5, 0.66, 0.82];
const STICK_LANES = BASE_LANES.map(x => 0.5 + (x - 0.5) * RACK_SCALE);
const STICK_HEIGHT_RATIO = 0.20;

class StickCatchEngine {
    constructor(randomFn = Math.random) {
        this.random = randomFn;
        this.reset();
    }

    reset(levelKey = 'normal', stageNum = 1) {
        this.level = DIFFICULTIES[levelKey] ? levelKey : 'normal';
        this.stage = Math.max(1, Math.floor(Number(stageNum)) || 1);
        this.phase = 'idle'; // 'idle' | 'countdown' | 'waiting' | 'falling' | 'result' | 'over'
        this.paused = false;
        this.time = 0;
        this.score = 0;
        this.lives = 3;
        this.drops = 0;
        this.caught = 0;
        this.streak = 0;
        this.bestStreak = 0;
        this.reactions = [];
        this.available = STICK_LANES.map((_, i) => i);
        this.rod = null;
        this.remaining = 0;
        this.grip = null;
        this.lastAttempt = -Infinity;
        this.feedback = '';
        this.lastResult = null;
    }

    start(levelKey, stageNum = 1, showCountdown = true) {
        this.reset(levelKey, stageNum);
        if (showCountdown) {
            this.phase = 'countdown';
            this.remaining = 3;
        } else {
            this.wait();
        }
    }

    get nextStage() {
        return this.lives > 0 && this.drops >= 12 ? this.stage + 1 : this.stage;
    }

    pause() {
        if (this.phase !== 'idle' && this.phase !== 'over') {
            this.paused = true;
            this.grip = null;
        }
    }

    resume() {
        this.paused = false;
        this.grip = null;
    }

    wait() {
        if (!this.available.length) {
            this.available = STICK_LANES.map((_, i) => i);
        }
        this.phase = 'waiting';
        this.rod = null;
        this.feedback = 'Watch the rack…';
        this.remaining = 0.85 + this.random() * 1.2;
    }

    drop() {
        const laneChoice = Math.min(this.available.length - 1, Math.floor(this.random() * this.available.length));
        const laneIndex = this.available.splice(laneChoice, 1)[0];
        this.rod = {
            lane: laneIndex,
            x: STICK_LANES[laneIndex],
            y: 0.23,
            velocity: 0
        };
        this.drops++;
        this.droppedAt = this.time;
        this.phase = 'falling';
        this.feedback = 'Catch it!';
        this.grip = null;
    }

    grab(x, y) {
        if (this.paused || this.phase !== 'falling' || !Number.isFinite(x) || !Number.isFinite(y)) {
            return false;
        }
        this.lastAttempt = this.time;
        this.grip = { x, y, until: this.time + 0.16 };
        return this.checkCatch();
    }

    cancelGrab() {
        this.grip = null;
    }

    checkCatch() {
        if (!this.grip || this.phase !== 'falling' || !this.rod) return false;
        const { x, y } = this.grip;
        // Collision bounding box aligned with stick dimensions
        const xDiff = Math.abs(x - this.rod.x);
        const yInRange = y >= (this.rod.y - 0.05) && y <= (this.rod.y + STICK_HEIGHT_RATIO + 0.05);

        if (xDiff <= 0.085 && yInRange) {
            const reactionMs = Math.round((this.time - this.droppedAt) * 1000);
            this.caught++;
            this.streak++;
            this.bestStreak = Math.max(this.bestStreak, this.streak);
            this.reactions.push(reactionMs);

            const points = Math.round(
                (100 + Math.max(0, 100 - reactionMs / 10) + Math.min(5, this.streak - 1) * 20) *
                DIFFICULTIES[this.level].bonus
            );
            this.score += points;
            this.lastResult = {
                caught: true,
                reaction: reactionMs,
                points: points,
                x: this.rod.x,
                y: this.rod.y
            };
            this.finishDrop(`Nice catch! +${points}`);
            return true;
        }
        return false;
    }

    finishDrop(msg) {
        this.phase = 'result';
        this.feedback = msg;
        this.remaining = 0.9;
        this.grip = null;
    }

    update(dt) {
        if (this.paused || this.phase === 'idle' || this.phase === 'over') return;
        dt = Math.min(0.05, Math.max(0, dt));
        this.time += dt;

        if (this.phase === 'falling') {
            const accel = DIFFICULTIES[this.level].gravity *
                (1 + (this.drops - 1) * 0.018) *
                (1 + Math.min(8, this.stage - 1) * 0.1);

            this.rod.y += this.rod.velocity * dt + 0.5 * accel * dt * dt;
            this.rod.velocity += accel * dt;

            if (this.grip && this.grip.until < this.time) {
                this.grip = null;
            }

            if (this.checkCatch()) return;

            // Bottom floor drop threshold: floor platform is at 0.94, so stick hits ground at 0.95
            if (this.rod.y >= 0.95) {
                this.lives--;
                this.streak = 0;
                this.lastResult = { caught: false, x: this.rod.x, y: 0.95 };
                this.finishDrop('Missed! Stay ready for the next one.');
            }
            return;
        }

        this.remaining -= dt;
        if (this.remaining <= 0) {
            if (this.phase === 'countdown') {
                this.wait();
            } else if (this.phase === 'waiting') {
                this.drop();
            } else if (this.phase === 'result') {
                if (this.lives <= 0 || this.drops >= 12) {
                    this.phase = 'over';
                } else {
                    this.wait();
                }
            }
        }
    }

    get averageReaction() {
        if (!this.reactions.length) return null;
        return Math.round(this.reactions.reduce((a, b) => a + b, 0) / this.reactions.length);
    }
}

// Countdown timer helper for pre-round and auto-advance
class AutoStartTimer {
    constructor() {
        this.cancel();
    }

    cancel() {
        this.phase = 'idle';
        this.remaining = 3;
        this.stage = 1;
    }

    request(stage = 1) {
        this.stage = stage;
        this.phase = 'waiting';
        this.remaining = 3;
    }

    update(dt) {
        if (this.phase === 'idle') return false;
        dt = Math.max(0, Math.min(0.05, dt));
        if (this.phase === 'waiting') {
            this.phase = 'countdown';
        }
        this.remaining = Math.max(0, this.remaining - dt);
        if (this.remaining > 1e-6) return false;
        this.phase = 'idle';
        return true;
    }
}

// ============================================================================
// 3. CANVAS RENDERING ENGINE
// ============================================================================
function fillRoundRect(ctx, x, y, w, h, radius, fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
}

function drawStickElement(ctx, cx, topY, width, height, isCaughtHighlight = false) {
    ctx.save();
    // Drop shadow
    ctx.shadowColor = 'rgba(8, 45, 65, 0.25)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 8;
    fillRoundRect(ctx, cx - width / 2, topY, width, height, width * 0.4, '#10699d');
    ctx.shadowColor = 'transparent';

    // Metallic cylinder gradient
    const grad = ctx.createLinearGradient(cx - width / 2, 0, cx + width / 2, 0);
    if (isCaughtHighlight) {
        grad.addColorStop(0, '#279e90');
        grad.addColorStop(0.32, '#8aecd0');
        grad.addColorStop(0.66, '#39c4a1');
        grad.addColorStop(1, '#178f82');
    } else {
        grad.addColorStop(0, '#148ec3');
        grad.addColorStop(0.32, '#70d6fa');
        grad.addColorStop(0.66, '#21a2de');
        grad.addColorStop(1, '#08669d');
    }
    fillRoundRect(ctx, cx - width / 2, topY, width, height, width * 0.35, grad);

    // Golden top & bottom end-caps
    fillRoundRect(ctx, cx - width * 0.54, topY - 2, width * 1.08, height * 0.09, 4, '#ffdb62');
    fillRoundRect(ctx, cx - width * 0.54, topY + height * 0.89, width * 1.08, height * 0.11, 4, '#ffd348');

    // Horizontal grooves / ridges
    ctx.globalAlpha = 0.32;
    for (let r = 0; r < 3; r++) {
        fillRoundRect(ctx, cx - width * 0.45, topY + height * (0.47 + r * 0.055), width * 0.9, 2, 1, '#075987');
    }
    ctx.restore();
}

function renderScene(canvas, engine, cursor, timeNow, reducedMotion = false) {
    const ctx = canvas.getContext('2d');
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;

    // HiDPI backing store matching viewport
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Pastel Sky Gradient
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#c2b1f3');
    sky.addColorStop(0.6, '#e1d3fa');
    sky.addColorStop(1, '#fce0ec');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // 2. Layered Clouds
    const cloudClusters = [
        [-0.03, 0.49, 0.14],
        [1.02, 0.64, 0.16],
        [0.14, 0.98, 0.12],
        [0.8, 1.02, 0.18]
    ];
    for (const [cx, cy, scale] of cloudClusters) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.53)';
        for (const [ox, oy, rad] of [[-1, 0.12, 0.65], [0, -0.18, 0.9], [1, 0.07, 0.7]]) {
            ctx.beginPath();
            ctx.ellipse(
                width * cx + ox * width * scale * 0.6,
                height * cy + oy * height * scale,
                width * scale * rad,
                height * scale * rad * 0.5,
                0, 0, Math.PI * 2
            );
            ctx.fill();
        }
    }

    // 3. Ground platform & shadow ellipse
    ctx.fillStyle = 'rgba(167, 125, 193, 0.1)';
    ctx.fillRect(0, height * 0.94, width, height * 0.06);
    ctx.fillStyle = 'rgba(144, 107, 180, 0.15)';
    ctx.beginPath();
    ctx.ellipse(width / 2, height * 0.945, width * 0.38, height * 0.015, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. Overhead Yellow Dropper Rack
    const entranceProgress = Math.min(1, engine.time / 0.82);
    const bounceOffset = 1 + 2.3 * Math.pow(entranceProgress - 1, 3) + 1.3 * Math.pow(entranceProgress - 1, 2);
    const rackTranslateY = (reducedMotion || engine.phase === 'idle' || engine.phase === 'over') ? 0 : (bounceOffset - 1) * height * 0.52;

    ctx.save();
    ctx.translate(0, rackTranslateY);

    // Hanging cables from ceiling
    ctx.strokeStyle = '#a79759';
    ctx.lineWidth = Math.max(3, width * 0.004);
    for (const laneRatio of [0.24, 0.76]) {
        const cableX = width * (0.5 + (laneRatio - 0.5) * RACK_SCALE);
        ctx.beginPath();
        ctx.moveTo(cableX, -rackTranslateY);
        ctx.lineTo(cableX, height * 0.18);
        ctx.stroke();
    }

    // Overhead Yellow Bar
    const rackWidth = width * 0.82 * RACK_SCALE;
    const rackX = width * 0.5 - rackWidth / 2;
    const rackY = height * 0.165;
    const rackH = height * 0.061;

    const rackGrad = ctx.createLinearGradient(0, rackY, 0, rackY + rackH);
    rackGrad.addColorStop(0, '#ffe88a');
    rackGrad.addColorStop(0.45, '#ffd049');
    rackGrad.addColorStop(1, '#d99818');

    ctx.save();
    ctx.shadowColor = 'rgba(132, 109, 52, 0.2)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 7;
    fillRoundRect(ctx, rackX, rackY, rackWidth, rackH, 10, rackGrad);
    ctx.restore();

    // Inscribed bar text
    ctx.fillStyle = '#84672d';
    const fontSize = Math.max(9, Math.min(14, width * 0.014)) * RACK_SCALE;
    ctx.font = `700 ${fontSize}px Jost, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('S W A Y J O Y   /   R E F L E X   C L U B', width / 2, rackY + rackH * 0.62);

    // Hanging Sticks on rack
    const stickWidth = Math.max(16, Math.min(38, width * 0.038));
    const stickHeight = height * STICK_HEIGHT_RATIO;
    for (const laneIdx of engine.available) {
        const floatSway = (reducedMotion || engine.phase === 'falling') ? 0 : Math.sin(timeNow / 1100 + laneIdx) * 0.002;
        drawStickElement(ctx, width * (STICK_LANES[laneIdx] + floatSway), height * 0.23, stickWidth, stickHeight);
    }
    ctx.restore();

    // 5. Active Falling / Caught Stick
    if (engine.rod && (engine.phase === 'falling' || (engine.phase === 'result' && engine.lastResult?.caught))) {
        const stickX = engine.rod.x * width;
        const stickY = engine.rod.y * height;

        // Motion speed blur lines
        if (engine.phase === 'falling' && !reducedMotion) {
            ctx.strokeStyle = 'rgba(102, 178, 207, 0.4)';
            ctx.lineWidth = 2;
            for (const offset of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(stickX + offset * stickWidth, stickY - 20);
                ctx.lineTo(stickX + offset * stickWidth, stickY + 15);
                ctx.stroke();
            }
        }
        drawStickElement(ctx, stickX, stickY, stickWidth, stickHeight, engine.phase === 'result');
    }

    // 6. Confetti Burst on Catch
    if (engine.phase === 'result' && engine.lastResult?.caught && !reducedMotion) {
        const elapsed = 0.9 - engine.remaining;
        const colors = ['#ffbb35', '#e97153', '#219b95'];
        for (let i = 0; i < 14; i++) {
            const angle = i * 2.4;
            ctx.fillStyle = colors[i % 3];
            ctx.globalAlpha = Math.max(0, 1 - elapsed);
            ctx.fillRect(
                engine.rod.x * width + Math.cos(angle) * elapsed * 160,
                engine.rod.y * height + Math.sin(angle) * elapsed * 130 + elapsed * elapsed * 160,
                5,
                8
            );
        }
        ctx.globalAlpha = 1;
    }

    // 7. Reticle & Cartoon Glove Cursor
    if (cursor.visible && engine.phase !== 'idle' && engine.phase !== 'over') {
        const cx = cursor.x * width;
        const cy = cursor.y * height;
        const radius = Math.max(22, Math.min(40, width * 0.055));

        ctx.save();
        ctx.translate(cx, cy);

        // Circular reticle ring: dashed circle when open, solid when grabbing/fist
        ctx.strokeStyle = cursor.fist ? '#db6938' : '#147f78';
        ctx.fillStyle = cursor.fist ? 'rgba(255, 227, 171, 0.81)' : 'rgba(255, 255, 255, 0.68)';
        ctx.lineWidth = 3;
        ctx.setLineDash(cursor.fist ? [] : [5, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // Cartoon Hand Graphic inside reticle
        ctx.strokeStyle = '#184858';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.scale(radius / 32, radius / 32);
        ctx.fillStyle = '#fff8de';
        ctx.beginPath();

        if (cursor.fist) {
            // Closed Fist
            ctx.roundRect(-13, -10, 27, 26, 8);
        } else {
            // Open Hand Palm & Fingers
            ctx.moveTo(-12, 16);
            ctx.lineTo(-21, 1);
            ctx.quadraticCurveTo(-23, -7, -17, -3);
            ctx.lineTo(-11, 4);
            ctx.lineTo(-12, -15);
            ctx.quadraticCurveTo(-11, -21, -7, -15);
            ctx.lineTo(-6, -5);
            ctx.lineTo(-5, -22);
            ctx.quadraticCurveTo(-2, -27, 1, -21);
            ctx.lineTo(2, -5);
            ctx.lineTo(4, -19);
            ctx.quadraticCurveTo(7, -23, 9, -17);
            ctx.lineTo(9, -3);
            ctx.lineTo(12, -11);
            ctx.quadraticCurveTo(16, -15, 17, -9);
            ctx.lineTo(15, 11);
            ctx.quadraticCurveTo(13, 20, 4, 20);
            ctx.lineTo(-6, 20);
            ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();

        if (cursor.fist) {
            // Fist knuckle creases
            for (const kx of [-6, 1, 8]) {
                ctx.beginPath();
                ctx.moveTo(kx, -8);
                ctx.lineTo(kx, 1);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
}

// ============================================================================
// 4. APPLICATION CONTROLLER & INTEGRATION
// ============================================================================
class MotionStickCatchApp {
    constructor() {
        this.engine = new StickCatchEngine();
        this.readyTimer = new AutoStartTimer();

        // UI State
        this.screen = 'menu'; // 'menu' | 'play' | 'over'
        this.inputMode = 'camera';
        this.selectedDifficulty = 'normal';
        this.cameraActive = false;
        this.cameraVisible = true;
        this.handTracked = false;
        this.isFist = false;
        this.cameraError = '';

        // Reticle coordinates (screen pixels and normalized canvas coordinates)
        this.cursor = {
            screenX: window.innerWidth / 2,
            screenY: window.innerHeight * 0.65,
            targetX: window.innerWidth / 2,
            targetY: window.innerHeight * 0.65,
            x: 0.5,
            y: 0.65,
            canvasPxX: window.innerWidth / 2,
            canvasPxY: window.innerHeight * 0.65,
            visible: false,
            fist: false,
            isGrabbing: false
        };

        this.lastHandTimestamp = -Infinity;
        this.lastFrameTime = 0;
        this.prevPhase = 'idle';

        // MediaPipe Camera & Hands instance
        this.mediaPipeHands = null;

        this.cacheDOM();
        this.bindEvents();
        this.loadBestScores();
        this.resizeCanvas();
        this.initRoute();

        // Start render loop
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    cacheDOM() {
        this.dom = {
            app: document.getElementById('gameApp'),
            topHud: document.getElementById('topHud'),
            hudStageLabel: document.getElementById('hudStageLabel'),
            hudScore: document.getElementById('hudScore'),
            hudDrop: document.getElementById('hudDrop'),
            hudChances: document.getElementById('hudChances'),
            hudFullscreenBtn: document.getElementById('hudFullscreenBtn'),

            stageContainer: document.getElementById('stageContainer'),
            canvas: document.getElementById('gameCanvas'),
            roundToast: document.getElementById('roundToast'),
            toastFeedback: document.getElementById('toastFeedback'),
            toastStats: document.getElementById('toastStats'),
            toastCountdown: document.getElementById('toastCountdown'),

            screenMenu: document.getElementById('screenMenu'),
            menuSoundBtn: document.getElementById('menuSoundBtn'),
            soundIconOn: document.querySelector('.sound-icon-on'),
            soundIconOff: document.querySelector('.sound-icon-off'),
            levelButtons: document.querySelectorAll('.sc-level-btn'),
            playWithCameraBtn: document.getElementById('playWithCameraBtn'),
            playCamBtnText: document.getElementById('playCamBtnText'),
            playWithMouseBtn: document.getElementById('playWithMouseBtn'),
            menuStatusMsg: document.getElementById('menuStatusMsg'),
            menuErrorMsg: document.getElementById('menuErrorMsg'),

            screenReady: document.getElementById('screenReady'),
            screenPause: document.getElementById('screenPause'),
            pauseMsg: document.getElementById('pauseMsg'),
            resumeGameBtn: document.getElementById('resumeGameBtn'),
            pauseBackMenuBtn: document.getElementById('pauseBackMenuBtn'),

            screenResult: document.getElementById('screenResult'),
            resultEyebrow: document.getElementById('resultEyebrow'),
            resultTitle: document.getElementById('resultTitle'),
            resultFinalScore: document.getElementById('resultFinalScore'),
            resultCaughtStat: document.getElementById('resultCaughtStat'),
            resultReactionStat: document.getElementById('resultReactionStat'),
            resultBestScoreStat: document.getElementById('resultBestScoreStat'),
            resultBestLevelLabel: document.getElementById('resultBestLevelLabel'),
            resultNextLabel: document.getElementById('resultNextLabel'),
            resultContinueBtn: document.getElementById('resultContinueBtn'),
            resultBackMenuBtn: document.getElementById('resultBackMenuBtn'),

            bottomConsole: document.getElementById('bottomConsole'),
            cameraBox: document.getElementById('cameraBox'),
            mpVideo: document.getElementById('mpVideo'),
            webcamVideo: document.getElementById('webcamVideo'),
            dockPromptTitle: document.getElementById('dockPromptTitle'),
            dockPromptSub: document.getElementById('dockPromptSub'),
            dockLevelDetails: document.getElementById('dockLevelDetails'),
            dockCamToggleBtn: document.getElementById('dockCamToggleBtn'),
            dockPauseBtn: document.getElementById('dockPauseBtn'),
            dockSoundBtn: document.getElementById('dockSoundBtn'),
            dockMenuBtn: document.getElementById('dockMenuBtn')
        };
    }

    bindEvents() {
        // Window resize sync
        window.addEventListener('resize', () => this.resizeCanvas());

        // Native Fullscreen Toggle
        if (this.dom.hudFullscreenBtn) {
            this.dom.hudFullscreenBtn.addEventListener('click', () => {
                if (!document.fullscreenElement) {
                    if (document.documentElement.requestFullscreen) {
                        document.documentElement.requestFullscreen().catch(() => {});
                    } else if (document.documentElement.webkitRequestFullscreen) {
                        document.documentElement.webkitRequestFullscreen();
                    }
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen().catch(() => {});
                    } else if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                    }
                }
            });
        }

        document.addEventListener('fullscreenchange', () => {
            const isFs = !!document.fullscreenElement;
            const enterIcon = this.dom.hudFullscreenBtn?.querySelector('.fs-icon-enter');
            const exitIcon = this.dom.hudFullscreenBtn?.querySelector('.fs-icon-exit');
            if (enterIcon) enterIcon.classList.toggle('hidden', isFs);
            if (exitIcon) exitIcon.classList.toggle('hidden', !isFs);
            this.resizeCanvas();
        });

        // Sound Toggle
        const toggleSound = () => {
            sfx.enabled = !sfx.enabled;
            this.updateSoundButtons();
            if (sfx.enabled) sfx.play('catch');
        };
        this.dom.menuSoundBtn.addEventListener('click', toggleSound);
        this.dom.dockSoundBtn.addEventListener('click', toggleSound);

        // Difficulty Selection
        this.dom.levelButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const lvl = btn.getAttribute('data-level');
                this.selectedDifficulty = lvl;
                this.dom.levelButtons.forEach(b => {
                    const active = b.getAttribute('data-level') === lvl;
                    b.setAttribute('aria-pressed', active ? 'true' : 'false');
                    b.querySelector('.sc-level-check').textContent = active ? '✓' : '›';
                });
            });
        });

        // Menu Navigation: Transition directly to active gameplay arena immediately
        this.dom.playWithCameraBtn.addEventListener('click', () => this.startCameraMode());
        this.dom.playWithMouseBtn.addEventListener('click', () => this.startMouseMode());

        // Pause Modal buttons (manual pause only)
        this.dom.resumeGameBtn.addEventListener('click', () => this.resumeGame());
        this.dom.pauseBackMenuBtn.addEventListener('click', () => this.goToMenu());

        // Result Modal buttons
        if (this.dom.resultContinueBtn) {
            this.dom.resultContinueBtn.addEventListener('click', () => {
                this.startLevel(this.engine.nextStage, true);
            });
        }
        this.dom.resultBackMenuBtn.addEventListener('click', () => this.goToMenu());

        // Dock Console
        this.dom.dockCamToggleBtn.addEventListener('click', () => {
            this.cameraVisible = !this.cameraVisible;
            this.dom.cameraBox.classList.toggle('hidden', !this.cameraVisible);
            this.dom.dockCamToggleBtn.textContent = this.cameraVisible ? 'Hide camera' : 'Show camera';
            this.dom.dockCamToggleBtn.setAttribute('aria-pressed', this.cameraVisible ? 'true' : 'false');
        });

        this.dom.dockPauseBtn.addEventListener('click', () => {
            if (this.engine.paused) {
                this.resumeGame();
            } else {
                this.pauseGame('The round is paused. Resume when you are ready.');
            }
        });

        this.dom.dockMenuBtn.addEventListener('click', () => this.goToMenu());

        // Keyboard: ONLY manual Pause key (KeyP / Escape)
        window.addEventListener('keydown', e => this.handleKeyDown(e));

        // Fallback Mouse and Touch Handling:
        // Ensure mouse/touch move and mousedown/mouseup update the exact same reticle coordinates and grab state
        const updateFromPointer = (clientX, clientY) => {
            this.cursor.targetX = clientX;
            this.cursor.targetY = clientY;
            this.cursor.screenX = clientX;
            this.cursor.screenY = clientY;
            this.cursor.visible = true;
            this.updateCanvasCursorFromScreen();
        };

        window.addEventListener('mousemove', e => {
            if (this.screen === 'play') {
                updateFromPointer(e.clientX, e.clientY);
            }
        });

        window.addEventListener('touchmove', e => {
            if (this.screen === 'play' && e.touches && e.touches[0]) {
                updateFromPointer(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });

        const handlePointerDown = (clientX, clientY) => {
            if (this.screen !== 'play') return;
            updateFromPointer(clientX, clientY);
            this.cursor.fist = true;
            this.cursor.isGrabbing = true;
            this.isFist = true;
            this.engine.grab(this.cursor.x, this.cursor.y);
        };

        const handlePointerUp = () => {
            if (this.screen !== 'play') return;
            this.cursor.fist = false;
            this.cursor.isGrabbing = false;
            this.isFist = false;
            this.engine.cancelGrab();
        };

        window.addEventListener('mousedown', e => {
            if (e.target.closest('button')) return;
            handlePointerDown(e.clientX, e.clientY);
        });

        window.addEventListener('mouseup', () => {
            handlePointerUp();
        });

        window.addEventListener('touchstart', e => {
            if (e.target.closest('button')) return;
            if (e.touches && e.touches[0]) {
                handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });

        window.addEventListener('touchend', () => {
            handlePointerUp();
        });
    }

    updateCanvasCursorFromScreen() {
        const rect = this.dom.canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            const pxX = Math.max(0, Math.min(rect.width, this.cursor.screenX - rect.left));
            const pxY = Math.max(0, Math.min(rect.height, this.cursor.screenY - rect.top));
            this.cursor.x = pxX / rect.width;
            this.cursor.y = pxY / rect.height;
            this.cursor.canvasPxX = pxX;
            this.cursor.canvasPxY = pxY;
        }
    }

    resizeCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = this.dom.canvas.clientWidth || window.innerWidth;
        const height = this.dom.canvas.clientHeight || window.innerHeight;
        this.dom.canvas.width = Math.round(width * dpr);
        this.dom.canvas.height = Math.round(height * dpr);
        this.updateCanvasCursorFromScreen();
    }

    loadBestScores() {
        try {
            const best = Number(localStorage.getItem(`swayjoy-stick-catch-${this.selectedDifficulty}`)) || 0;
            this.bestScore = best;
        } catch (e) {
            this.bestScore = 0;
        }
    }

    saveBestScore(score) {
        if (score > this.bestScore) {
            this.bestScore = score;
            try {
                localStorage.setItem(`swayjoy-stick-catch-${this.selectedDifficulty}`, String(score));
            } catch (e) { }
        }
    }

    updateSoundButtons() {
        this.dom.menuSoundBtn.setAttribute('aria-pressed', sfx.enabled ? 'true' : 'false');
        this.dom.menuSoundBtn.setAttribute('aria-label', sfx.enabled ? 'Sound on' : 'Sound off');
        this.dom.soundIconOn.classList.toggle('hidden', !sfx.enabled);
        this.dom.soundIconOff.classList.toggle('hidden', sfx.enabled);

        this.dom.dockSoundBtn.setAttribute('aria-pressed', sfx.enabled ? 'true' : 'false');
        this.dom.dockSoundBtn.textContent = sfx.enabled ? 'Sound on' : 'Sound off';
    }

    // ========================================================================
    // MODE INITIATION & TRANSITIONS
    // ========================================================================
    startCameraMode() {
        this.inputMode = 'camera';
        // Specification 2: Transition directly to the active gameplay arena immediately.
        // Trigger the 3-2-1 countdown right away and start dropping sticks automatically.
        this.startLevel(1, true);

        // Start webcam and hand tracking in background without delaying gameplay
        if (!this.cameraActive) {
            this.setupMediaPipe().catch(err => {
                console.warn('Camera initialization error:', err);
            });
        }
    }

    startMouseMode() {
        this.inputMode = 'mouse';
        this.startLevel(1, true);
    }

    initRoute() {
        const hash = window.location.hash.toLowerCase();
        const search = window.location.search.toLowerCase();
        if (hash === '#play' || search.includes('camera') || search.includes('play')) {
            this.startCameraMode();
        }
    }

    startLevel(stage = 1, showCountdown = true) {
        this.screen = 'play';
        this.cursor.visible = true;
        this.cursor.fist = false;
        this.cursor.isGrabbing = false;
        this.engine.start(this.selectedDifficulty, stage, showCountdown);
        this.prevPhase = this.engine.phase;
        this.updateCanvasCursorFromScreen();
        this.updateUI();
    }

    pauseGame(reasonText) {
        this.engine.pause();
        this.dom.pauseMsg.textContent = reasonText;
        this.updateUI();
    }

    resumeGame() {
        this.engine.resume();
        this.dom.canvas.focus({ preventScroll: true });
        this.updateUI();
    }

    goToMenu() {
        this.readyTimer.cancel();
        this.stopCamera();
        this.inputMode = 'camera';
        this.cursor.visible = false;
        this.screen = 'menu';
        this.engine.reset(this.selectedDifficulty);
        this.updateUI();
    }

    // ========================================================================
    // INPUT HANDLERS
    // ========================================================================
    handleKeyDown(e) {
        if (e.code === 'KeyP' || e.code === 'Escape') {
            e.preventDefault();
            if (this.screen !== 'play') return;
            if (this.engine.paused) {
                this.resumeGame();
            } else {
                this.pauseGame('The round is paused. Resume when you are ready.');
            }
        }
    }

    // ========================================================================
    // MEDIAPIPE WEBCAM INTEGRATION
    // ========================================================================
    async getCameraStream() {
        if (this.stream && this.stream.active) {
            return this.stream;
        }
        if (this.dom.mpVideo && this.dom.mpVideo.srcObject && this.dom.mpVideo.srcObject.active) {
            return this.dom.mpVideo.srcObject;
        }
        if (this.dom.webcamVideo && this.dom.webcamVideo.srcObject && this.dom.webcamVideo.srcObject.active) {
            return this.dom.webcamVideo.srcObject;
        }

        // 1. Preferred constraints (640x480 user-facing)
        try {
            return await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
            });
        } catch (e1) {
            console.warn('FacingMode webcam constraint failed, trying basic resolution:', e1);
        }

        // 2. Fallback without facingMode
        try {
            return await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { width: { ideal: 640 }, height: { ideal: 480 } }
            });
        } catch (e2) {
            console.warn('Resolution constraints failed, trying basic video: true:', e2);
        }

        // 3. Fallback to any available video stream
        return await navigator.mediaDevices.getUserMedia({ video: true });
    }

    async setupMediaPipe() {
        this.cameraError = '';
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Webcam API is not supported in this browser.');
            }

            // Retrieve camera stream with progressive fallbacks
            const stream = await this.getCameraStream();
            this.stream = stream;

            // Target video element for continuous MediaPipe frame decoding (never display:none; uses opacity: 0.001)
            if (this.dom.mpVideo) {
                this.dom.mpVideo.srcObject = stream;
                await this.dom.mpVideo.play().catch(e => console.warn('mpVideo play warning:', e));
            }

            if (this.dom.webcamVideo) {
                this.dom.webcamVideo.srcObject = stream;
                await this.dom.webcamVideo.play().catch(e => console.warn('webcamVideo play warning:', e));
            }

            // Initialize MediaPipe Hands with modelComplexity: 1
            if (typeof Hands !== 'undefined' && !this.mediaPipeHands) {
                this.mediaPipeHands = new Hands({
                    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
                });
                this.mediaPipeHands.setOptions({
                    maxNumHands: 1,
                    modelComplexity: 1,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                this.mediaPipeHands.onResults(results => this.onHandResults(results));
            }

            this.cameraActive = true;
            this.cameraVisible = true;
            this.dom.cameraBox.classList.remove('hidden');

            // Send video frames continuously to MediaPipe Hands via requestAnimationFrame
            let isSendingFrame = false;
            const processVideoFrame = async () => {
                if (!this.cameraActive) return;
                try {
                    const activeVideo = (this.dom.mpVideo && this.dom.mpVideo.readyState >= 2)
                        ? this.dom.mpVideo
                        : (this.dom.webcamVideo && this.dom.webcamVideo.readyState >= 2 ? this.dom.webcamVideo : null);

                    if (this.mediaPipeHands && activeVideo && activeVideo.readyState >= 2 && !isSendingFrame) {
                        isSendingFrame = true;
                        await this.mediaPipeHands.send({ image: activeVideo });
                        isSendingFrame = false;
                    }
                } catch (e) {
                    isSendingFrame = false;
                }
                if (this.cameraActive) {
                    this.videoFrameId = requestAnimationFrame(processVideoFrame);
                }
            };

            if (this.videoFrameId) cancelAnimationFrame(this.videoFrameId);
            this.videoFrameId = requestAnimationFrame(processVideoFrame);

            return true;
        } catch (err) {
            console.warn('Webcam initialization failed:', err);
            this.cameraActive = false;
            return false;
        }
    }

    stopCamera() {
        this.cameraActive = false;
        if (this.videoFrameId) {
            cancelAnimationFrame(this.videoFrameId);
            this.videoFrameId = null;
        }
        if (this.stream) {
            try { this.stream.getTracks().forEach(t => t.stop()); } catch (e) { }
            this.stream = null;
        }
        if (this.dom.mpVideo && this.dom.mpVideo.srcObject) {
            try { this.dom.mpVideo.srcObject.getTracks().forEach(t => t.stop()); } catch (e) { }
            this.dom.mpVideo.srcObject = null;
        }
        if (this.dom.webcamVideo && this.dom.webcamVideo.srcObject) {
            try { this.dom.webcamVideo.srcObject.getTracks().forEach(t => t.stop()); } catch (e) { }
            this.dom.webcamVideo.srcObject = null;
        }
        this.dom.cameraBox.classList.add('hidden');
        this.handTracked = false;
    }

    // ========================================================================
    // HAND TRACKING & COORDINATE RETICLE ENGINE (Spec 4)
    // ========================================================================
    onHandResults(results) {
        if (!this.cameraActive || document.hidden) return;
        const now = performance.now();
        const rawLandmarks = results.multiHandLandmarks?.[0] || null;

        if (rawLandmarks && rawLandmarks.length === 21 && rawLandmarks.every(pt => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y))) {
            this.handTracked = true;
            this.lastHandTimestamp = now;

            const lm = rawLandmarks;
            const wrist = lm[0];
            const thumbTip = lm[4];
            const indexTip = lm[8];

            // Mirrored X and standard Y normalized screen coordinates per spec:
            // targetX = (1 - (lm[8].x + lm[0].x) / 2) * window.innerWidth;
            // targetY = ((lm[8].y + lm[0].y) / 2) * window.innerHeight;
            const normX = 1 - (indexTip.x + wrist.x) / 2;
            const normY = (indexTip.y + wrist.y) / 2;

            // Reach sensitivity multiplier around center so users can comfortably reach all screen bounds
            const reachMultiplier = 1.3;
            const targetX = Math.max(15, Math.min(window.innerWidth - 15, ((normX - 0.5) * reachMultiplier + 0.5) * window.innerWidth));
            const targetY = Math.max(15, Math.min(window.innerHeight - 15, ((normY - 0.5) * reachMultiplier + 0.5) * window.innerHeight));

            this.cursor.targetX = targetX;
            this.cursor.targetY = targetY;

            // Check pinch grasp: distance between thumb tip and index tip < 0.08
            const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y, (thumbTip.z || 0) - (indexTip.z || 0));
            const isPinch = pinchDist < 0.08;

            // Check fist grasp: finger curls across all 4 fingers
            let curledCount = 0;
            for (const [tipIdx, pipIdx] of [[8, 6], [12, 10], [16, 14], [20, 18]]) {
                const tipDist = Math.hypot(lm[tipIdx].x - wrist.x, lm[tipIdx].y - wrist.y);
                const pipDist = Math.hypot(lm[pipIdx].x - wrist.x, lm[pipIdx].y - wrist.y);
                if (tipDist < pipDist * 1.15 || lm[tipIdx].y > lm[pipIdx].y) {
                    curledCount++;
                }
            }
            const isFist = curledCount >= 3;
            const isGrabbing = isPinch || isFist;

            const wasGrabbing = this.cursor.isGrabbing;
            this.cursor.fist = isGrabbing;
            this.cursor.isGrabbing = isGrabbing;
            this.isFist = isGrabbing;

            this.updateCanvasCursorFromScreen();

            if (isGrabbing) {
                if (this.screen === 'play' && !this.engine.paused) {
                    this.engine.grab(this.cursor.x, this.cursor.y);
                }
            } else if (wasGrabbing) {
                this.engine.cancelGrab();
            }
        } else {
            // When tracking is temporarily lost:
            // FREEZE the hand reticle at its last known (targetX, targetY) coordinates (do NOT snap to center or disappear).
            // Set isGrabbing = false so it doesn't trigger false catches while frozen.
            // Resume tracking smoothly as soon as the hand reappears.
            this.handTracked = false;
            this.cursor.fist = false;
            this.cursor.isGrabbing = false;
            this.isFist = false;
            this.engine.cancelGrab();
        }

        if (this.screen === 'play') {
            this.cursor.visible = true;
        }
    }

    // ========================================================================
    // MAIN GAME LOOP & TIMERS (Continuous gameplay without pausing)
    // ========================================================================
    loop(timestamp) {
        const dt = this.lastFrameTime ? Math.min(0.05, (timestamp - this.lastFrameTime) / 1000) : 0;
        this.lastFrameTime = timestamp;

        if (!document.hidden) {
            // Smoothly move reticle towards targetX and targetY every frame
            if (Number.isFinite(this.cursor.targetX) && Number.isFinite(this.cursor.targetY)) {
                const lerpAlpha = 0.35;
                this.cursor.screenX += (this.cursor.targetX - this.cursor.screenX) * lerpAlpha;
                this.cursor.screenY += (this.cursor.targetY - this.cursor.screenY) * lerpAlpha;
                this.updateCanvasCursorFromScreen();
            }

            // Results screen progression timer
            if (this.screen === 'over') {
                if (this.readyTimer.update(dt)) {
                    this.startLevel(this.engine.nextStage, true);
                }
            }

            // Specification 3: CONTINUOUS GAMEPLAY WITHOUT PAUSING
            // Under NO circumstances should the game freeze, pause, or kick the user out if hand tracking drops or flickers.
            // Timers, falling sticks, rounds, drop counts, and chances must continue running continuously.
            this.engine.update(dt);

            // Sound events on state transitions
            if (this.engine.phase !== this.prevPhase) {
                if (this.engine.phase === 'falling') sfx.play('drop');
                if (this.engine.phase === 'result') sfx.play(this.engine.lastResult?.caught ? 'catch' : 'miss');
                if (this.engine.phase === 'over') {
                    this.screen = 'over';
                    this.saveBestScore(this.engine.score);
                    this.readyTimer.request(this.engine.nextStage);
                }
                this.prevPhase = this.engine.phase;
                this.updateUI();
            }

            // Draw Game Canvas
            renderScene(this.dom.canvas, this.engine, this.cursor, timestamp, false);
            this.syncDynamicHUD();
        }

        requestAnimationFrame(this.loop);
    }

    // ========================================================================
    // UI SYNCHRONIZATION
    // ========================================================================
    syncDynamicHUD() {
        if (this.screen !== 'play' && this.screen !== 'over') return;

        // Top HUD Numbers
        this.dom.hudScore.textContent = this.engine.score.toLocaleString();
        this.dom.hudDrop.textContent = this.engine.drops;
        this.dom.hudStageLabel.textContent = `LEVEL ${this.engine.stage} · REFLEX CLUB`;

        const dots = this.dom.hudChances.querySelectorAll('.chance-dot');
        dots.forEach((dot, idx) => {
            dot.classList.toggle('sc-empty', idx >= this.engine.lives);
        });

        // In-Game Toast Banner (Countdown and Reaction Feedback)
        if (this.screen === 'play' && !this.engine.paused) {
            this.dom.roundToast.classList.remove('hidden');
            if (this.engine.phase === 'countdown') {
                this.dom.toastFeedback.textContent = 'GET READY';
                this.dom.toastFeedback.classList.remove('sc-hit');
                this.dom.toastCountdown.textContent = Math.max(1, Math.ceil(this.engine.remaining));
                this.dom.toastCountdown.classList.remove('hidden');
                this.dom.toastStats.classList.add('hidden');
            } else {
                this.dom.toastCountdown.classList.add('hidden');
                this.dom.toastFeedback.textContent = this.engine.feedback || 'Watch the rack…';
                const isHit = this.engine.phase === 'result' && this.engine.lastResult?.caught;
                this.dom.toastFeedback.classList.toggle('sc-hit', isHit);

                if (isHit && this.engine.lastResult) {
                    this.dom.toastStats.textContent = `${this.engine.lastResult.reaction} ms · ${this.engine.streak} in a row`;
                    this.dom.toastStats.classList.remove('hidden');
                } else {
                    this.dom.toastStats.classList.add('hidden');
                }
            }
        } else {
            this.dom.roundToast.classList.add('hidden');
        }

        // Contextual Console Instructions
        const diffLabel = DIFFICULTIES[this.selectedDifficulty].label;
        this.dom.dockLevelDetails.textContent = `${diffLabel} · 12 drops · 3 chances`;

        if (!this.handTracked) {
            this.dom.dockPromptTitle.textContent = this.inputMode === 'mouse' 
                ? 'Move cursor to aim · Click to catch' 
                : 'Show one hand to the camera (or use mouse)';
        } else if (this.isFist) {
            this.dom.dockPromptTitle.textContent = 'Open your hand for the next catch';
        } else {
            this.dom.dockPromptTitle.textContent = 'Move to aim · Close your fist to catch';
        }
        this.dom.dockPromptSub.textContent = 'Keep your whole hand visible. Reopen between grabs.';
    }

    updateUI() {
        const isMenu = this.screen === 'menu';
        const isPlay = this.screen === 'play';
        const isOver = this.screen === 'over';
        const isPaused = isPlay && this.engine.paused;

        // Overlay Visibilities
        this.dom.app.classList.toggle('sc-game--home', isMenu);
        this.dom.topHud.classList.toggle('hidden', isMenu);
        this.dom.bottomConsole.classList.toggle('hidden', isMenu);

        this.dom.screenMenu.classList.toggle('hidden', !isMenu);
        this.dom.screenReady.classList.add('hidden'); // Intermediate calibration screen completely removed
        this.dom.screenPause.classList.toggle('hidden', !isPaused);
        this.dom.screenResult.classList.toggle('hidden', !isOver);

        // Results Screen specifics
        if (isOver) {
            const won = this.engine.lives > 0;
            this.dom.resultEyebrow.textContent = won
                ? `LEVEL ${this.engine.stage} COMPLETE`
                : `LEVEL ${this.engine.stage} — TRY AGAIN!`;

            this.dom.resultTitle.textContent = this.engine.caught >= 10
                ? 'Lightning hands!'
                : (this.engine.caught >= 5 ? 'Nice reflexes!' : 'Keep catching!');

            this.dom.resultFinalScore.textContent = this.engine.score.toLocaleString();
            this.dom.resultCaughtStat.textContent = `${this.engine.caught}/${this.engine.drops}`;
            this.dom.resultReactionStat.textContent = this.engine.averageReaction !== null
                ? `${this.engine.averageReaction} ms`
                : '—';

            this.loadBestScores();
            this.dom.resultBestScoreStat.textContent = this.bestScore.toLocaleString();
            this.dom.resultBestLevelLabel.textContent = `Best · ${DIFFICULTIES[this.selectedDifficulty].label}`;
            this.dom.resultNextLabel.textContent = won ? `NEXT: LEVEL ${this.engine.stage + 1}` : `RETRYING LEVEL ${this.engine.stage}`;
            if (this.dom.resultContinueBtn) {
                this.dom.resultContinueBtn.textContent = won ? 'NEXT LEVEL' : 'RETRY LEVEL';
            }
        }

        this.syncDynamicHUD();
    }
}

// Bootstrap once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new MotionStickCatchApp();
});
