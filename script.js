/**
 * Timer app page controller. All timing, clamping and audio logic lives in
 * src/, shared with the case study page.
 */
import { createTimer, formatTime, clampMinutes, LIMITS } from './src/timer-engine.js';
import { createAudio } from './src/ambient-audio.js';
import { applyProgress } from './src/ring.js';

const STORAGE_KEY = 'pomodoro-settings-v1';
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const timerDisplay   = document.getElementById('timerDisplay');
const startBtn       = document.getElementById('startBtn');
const resetBtn       = document.getElementById('resetBtn');
const modeBadge      = document.getElementById('modeBadge');
const progressRing   = document.getElementById('progressRing');
const soundToggle    = document.getElementById('soundToggle');
const volumeSlider   = document.getElementById('volumeSlider');
const volumeLabel    = document.getElementById('volumeLabel');
const sessionCountEl = document.getElementById('sessionCount');
const bgAnimation    = document.getElementById('bgAnimation');
const focusTimeInput = document.getElementById('focusTimeInput');
const breakTimeInput = document.getElementById('breakTimeInput');
const focusModeBtn   = document.getElementById('focusModeBtn');
const breakModeBtn   = document.getElementById('breakModeBtn');
const announcer      = document.getElementById('announcer');

const ICON_PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
const ICON_PAUSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
const ICON_SOUND_ON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
const ICON_SOUND_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';

const audio = createAudio({ rainSrc: 'assets/audio/rain.mp3', softSrc: 'assets/audio/soft.mp3' });
const timer = createTimer({ focusMinutes: 25, breakMinutes: 5 });

let savedSessionCount = 1;

/* ---------- Persistence ---------- */

function saveSettings() {
    const s = timer.state;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            focusTime: s.focusMinutes,
            breakTime: s.breakMinutes,
            volume: audio.volume,
            isSoundOn: audio.enabled,
            sessionCount: s.sessionCount
        }));
    } catch (e) {
        /* private mode or blocked storage */
    }
}

function loadSettings() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (e) {
        saved = null;
    }
    if (!saved) return;

    const f = clampMinutes(saved.focusTime, LIMITS.focus);
    const b = clampMinutes(saved.breakTime, LIMITS.break);
    timer.setDuration('focus', f);
    timer.setDuration('break', b);
    focusTimeInput.value = f;
    breakTimeInput.value = b;

    if (typeof saved.volume === 'number') audio.setVolume(saved.volume);
    if (typeof saved.isSoundOn === 'boolean') audio.setEnabled(saved.isSoundOn);
    if (Number.isFinite(saved.sessionCount)) savedSessionCount = Math.min(4, Math.max(1, saved.sessionCount));

    const pct = Math.round(audio.volume * 100);
    volumeSlider.value = pct;
    volumeLabel.textContent = `${pct}%`;
}

/* ---------- Background animation ---------- */

function clearBackground() {
    bgAnimation.replaceChildren();
}

function createRainDrops() {
    clearBackground();
    if (prefersReducedMotion) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 70; i++) {
        const drop = document.createElement('div');
        drop.className = 'rain-drop';
        drop.style.left = Math.random() * 100 + '%';
        drop.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
        drop.style.animationDelay = (Math.random() * -3) + 's';
        drop.style.opacity = (0.35 + Math.random() * 0.5).toFixed(2);
        drop.style.height = (14 + Math.random() * 16) + 'px';
        frag.appendChild(drop);
    }
    bgAnimation.appendChild(frag);
}

function createParticles() {
    clearBackground();
    if (prefersReducedMotion) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        const size = 5 + Math.random() * 15;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.animationDuration = (3 + Math.random() * 4) + 's';
        particle.style.animationDelay = (Math.random() * -4) + 's';
        frag.appendChild(particle);
    }
    bgAnimation.appendChild(frag);
}

/* ---------- Render ---------- */

function announce(message) {
    announcer.textContent = message;
}

function render() {
    const s = timer.state;
    timerDisplay.textContent = s.label;
    applyProgress(progressRing, s.progress);
    sessionCountEl.textContent = s.sessionCount;
    startBtn.innerHTML = s.isRunning ? `${ICON_PAUSE} Pause` : `${ICON_PLAY} Start`;
    focusTimeInput.disabled = s.isRunning;
    breakTimeInput.disabled = s.isRunning;
    focusModeBtn.setAttribute('aria-pressed', String(s.isFocusMode));
    breakModeBtn.setAttribute('aria-pressed', String(!s.isFocusMode));
    modeBadge.textContent = s.isFocusMode ? 'Focus Mode' : 'Break Mode';
    document.body.classList.toggle('focus-mode', s.isFocusMode);
    document.body.classList.toggle('break-mode', !s.isFocusMode);
    document.title = s.isRunning
        ? `${s.label} · ${s.isFocusMode ? 'Focus' : 'Break'}`
        : 'Pomodoro Timer with Ambient Sounds';
}

/* ---------- Engine wiring ---------- */

timer.on('tick', render);

timer.on('start', () => {
    audio.play(timer.state.isFocusMode);
    render();
});

timer.on('pause', () => {
    audio.pause();
    render();
});

timer.on('reset', () => {
    audio.stop();
    render();
    announce(`Timer reset to ${timer.state.label}.`);
});

timer.on('mode', () => {
    const s = timer.state;
    s.isFocusMode ? createRainDrops() : createParticles();
    render();
    announce(`${s.isFocusMode ? 'Focus' : 'Break'} mode. ${s.label} on the clock.`);
});

timer.on('finish', ({ finishedFocus }) => {
    audio.stop();
    audio.chime();
    const s = timer.state;
    s.isFocusMode ? createRainDrops() : createParticles();
    saveSettings();
    render();
    announce(finishedFocus
        ? `Focus session complete. Break mode ready, ${s.label}. Press start when you are.`
        : `Break over. Focus mode ready, ${s.label}. Press start when you are.`);
});

/* ---------- Controls ---------- */

startBtn.addEventListener('click', () => timer.toggle());
resetBtn.addEventListener('click', () => timer.reset());
focusModeBtn.addEventListener('click', () => { timer.pause(); audio.stop(); timer.setMode(true); });
breakModeBtn.addEventListener('click', () => { timer.pause(); audio.stop(); timer.setMode(false); });

soundToggle.addEventListener('click', () => {
    audio.setEnabled(!audio.enabled);
    soundToggle.classList.toggle('muted', !audio.enabled);
    soundToggle.setAttribute('aria-pressed', String(audio.enabled));
    soundToggle.setAttribute('aria-label', audio.enabled ? 'Mute ambient sound' : 'Unmute ambient sound');
    soundToggle.innerHTML = audio.enabled ? ICON_SOUND_ON : ICON_SOUND_OFF;
    if (audio.enabled && timer.state.isRunning) audio.play(timer.state.isFocusMode);
    saveSettings();
});

volumeSlider.addEventListener('input', (e) => {
    const pct = Number(e.target.value);
    audio.setVolume(pct / 100);
    volumeLabel.textContent = `${pct}%`;
    saveSettings();
});

function handleTimeChange(e) {
    if (timer.state.isRunning) return;
    const which = e.target === focusTimeInput ? 'focus' : 'break';
    e.target.value = timer.setDuration(which, e.target.value);
    saveSettings();
}

focusTimeInput.addEventListener('change', handleTimeChange);
breakTimeInput.addEventListener('change', handleTimeChange);

document.addEventListener('keydown', (e) => {
    const el = document.activeElement;
    const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.code === 'Space') {
        e.preventDefault();
        timer.toggle();
    } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        timer.reset();
    }
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && timer.state.isRunning) render();
});

/* ---------- Init ---------- */

loadSettings();
soundToggle.classList.toggle('muted', !audio.enabled);
soundToggle.setAttribute('aria-pressed', String(audio.enabled));
soundToggle.innerHTML = audio.enabled ? ICON_SOUND_ON : ICON_SOUND_OFF;
timer.setMode(true, { silent: true });
createRainDrops();
render();
sessionCountEl.textContent = savedSessionCount;
