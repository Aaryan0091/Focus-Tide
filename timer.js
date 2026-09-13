/**
 * Focus Timer.
 * Timing, audio and ring geometry come from src/, shared with the classic page,
 * so the two can never drift apart.
 */
import { createTimer, formatTime, SESSIONS_PER_CYCLE } from './src/timer-engine.js';
import { createAudio } from './src/ambient-audio.js';
import { applyProgress, makeScrubbable, RING_RADIUS } from './src/ring.js';

const STORAGE_KEY = 'pomodoro-settings-v1';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const el = {
    body: document.body,
    ringShell: document.getElementById('ringShell'),
    ring: document.getElementById('ring'),
    ringFill: document.getElementById('ringFill'),
    ringKnob: document.getElementById('ringKnob'),
    ringHint: document.getElementById('ringHint'),
    clock: document.getElementById('clock'),
    digits: [...document.querySelectorAll('.digit__stack')],
    srTime: document.getElementById('timerDisplay'),
    badge: document.getElementById('modeBadge'),
    start: document.getElementById('startBtn'),
    reset: document.getElementById('resetBtn'),
    focusBtn: document.getElementById('focusModeBtn'),
    breakBtn: document.getElementById('breakModeBtn'),
    focusInput: document.getElementById('focusTimeInput'),
    breakInput: document.getElementById('breakTimeInput'),
    sound: document.getElementById('soundToggle'),
    volume: document.getElementById('volumeSlider'),
    volFill: document.getElementById('volFill'),
    volLabel: document.getElementById('volumeLabel'),
    status: document.getElementById('status'),
    elapsed: document.getElementById('elapsed'),
    sessionLabel: document.getElementById('sessionLabel'),
    dots: [...document.querySelectorAll('[data-dot]')],
    bg: document.getElementById('bgAnimation'),
    announcer: document.getElementById('announcer'),
    // face
    features: document.getElementById('faceFeatures'),
    eyeL: document.getElementById('eyeL'),
    eyeR: document.getElementById('eyeR'),
    browL: document.getElementById('browL'),
    browR: document.getElementById('browR'),
    mouth: document.getElementById('mouth'),
    energy: document.getElementById('energy'),
    energyPct: document.getElementById('energyPct'),
    energyFill: document.getElementById('energyFill'),
    energyState: document.getElementById('energyState')
};

const ICON_PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
const ICON_PAUSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
const ICON_SOUND_ON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
const ICON_SOUND_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';

let buffering = false;
let hintDismissed = false;

const timer = createTimer({ focusMinutes: 25, breakMinutes: 5 });
const audio = createAudio({
    rainSrc: 'assets/audio/rain.mp3',
    softSrc: 'assets/audio/soft.mp3',
    onBuffering: (b) => { buffering = b; renderStatus(); }
});

/* ==================================================================
   Fatigue
   One value, 0 fresh to 1 spent. Focus drives it up from wherever the
   last session left it; break drains that same value back down. Because
   it is derived from session progress rather than counted separately,
   scrubbing the ring moves it too.
   ================================================================== */

let baseFatigue = 0;   // fatigue when the current session began
let fatigue = 0;

function currentFatigue() {
    const s = timer.state;
    return s.isFocusMode
        ? baseFatigue + (1 - baseFatigue) * s.progress
        : baseFatigue * (1 - s.progress);
}

/** Called before any mode change so the next session starts where this one ended. */
function anchorFatigue() {
    baseFatigue = Math.min(1, Math.max(0, currentFatigue()));
}

const STATES = [
    [0.12, 'Fresh'],
    [0.32, 'Steady'],
    [0.52, 'Working'],
    [0.72, 'Tiring'],
    [0.88, 'Running low'],
    [1.01, 'Spent']
];

function fatigueState(f) {
    for (const [limit, label] of STATES) if (f < limit) return label;
    return 'Spent';
}

const lerp = (a, b, t) => a + (b - a) * t;

function mixColour(hiVar, loVar, t) {
    // Read the two endpoints from CSS so break mode can restate them.
    const cs = getComputedStyle(document.body);   // break mode restates these on <body>
    const parse = (v) => {
        const s = cs.getPropertyValue(v).trim();
        return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    };
    const hi = parse(hiVar);
    const lo = parse(loVar);
    const c = hi.map((h, i) => Math.round(lerp(h, lo[i], t)));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function paintFace(f) {
    // Eyes narrow and sit a touch lower.
    const ry = lerp(5, 1.5, f);
    const cy = lerp(45, 46.6, f);
    for (const eye of [el.eyeL, el.eyeR]) {
        if (!blinking) eye.setAttribute('ry', ry.toFixed(2));
        eye.setAttribute('cy', cy.toFixed(2));
    }

    // Brows fade in and let their outer ends fall.
    const drop = lerp(0, 4.5, f);
    const lift = lerp(0, 1.2, f);
    el.browL.setAttribute('d', `M32 ${(36 + drop).toFixed(2)} L44 ${(36 - lift).toFixed(2)}`);
    el.browR.setAttribute('d', `M68 ${(36 + drop).toFixed(2)} L56 ${(36 - lift).toFixed(2)}`);
    el.browL.style.opacity = el.browR.style.opacity = (f * 0.9).toFixed(2);

    // Mouth swings from a slight smile to a slight frown.
    const ends = lerp(62, 64, f);
    const ctrl = lerp(70, 54, f);
    el.mouth.setAttribute('d', `M38 ${ends.toFixed(2)} Q50 ${ctrl.toFixed(2)} 62 ${ends.toFixed(2)}`);

    // The whole face slumps a little.
    el.features.style.transform = `translateY(${lerp(0, 2.5, f).toFixed(2)}px)`;
}

function renderEnergy() {
    fatigue = Math.min(1, Math.max(0, currentFatigue()));
    const energy = 1 - fatigue;

    el.body.style.setProperty('--fatigue', fatigue.toFixed(3));
    el.energy.style.setProperty('--energy-colour', mixColour('--energy-hi', '--energy-lo', fatigue));

    el.energyPct.textContent = Math.round(energy * 100);
    el.energyFill.style.transform = `scaleX(${energy.toFixed(3)})`;
    el.energyState.textContent = fatigueState(fatigue);
    el.energy.setAttribute('aria-label', `Energy ${Math.round(energy * 100)} percent, ${fatigueState(fatigue)}`);

    paintFace(fatigue);
}

/* Blinking. Slightly more often and for longer as fatigue rises, which is
   what actually reads as tired. */
let blinking = false;
let blinkTimer = null;

function scheduleBlink() {
    if (reduceMotion) return;
    clearTimeout(blinkTimer);
    const gap = lerp(4600, 2400, fatigue) + Math.random() * 1200;
    blinkTimer = setTimeout(() => {
        blinking = true;
        const open = lerp(5, 1.5, fatigue);
        for (const eye of [el.eyeL, el.eyeR]) eye.setAttribute('ry', '0.5');
        setTimeout(() => {
            blinking = false;
            for (const eye of [el.eyeL, el.eyeR]) eye.setAttribute('ry', open.toFixed(2));
            scheduleBlink();
        }, lerp(130, 280, fatigue));
    }, gap);
}

/* ==================================================================
   Persistence
   ================================================================== */

function save() {
    const s = timer.state;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            focusTime: s.focusMinutes, breakTime: s.breakMinutes,
            volume: audio.volume, isSoundOn: audio.enabled,
            sessionCount: s.sessionCount, baseFatigue
        }));
    } catch (e) { /* blocked storage */ }
}

function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { saved = null; }
    if (!saved) return;

    if (saved.focusTime) el.focusInput.value = timer.setDuration('focus', saved.focusTime);
    if (saved.breakTime) el.breakInput.value = timer.setDuration('break', saved.breakTime);
    if (typeof saved.volume === 'number') audio.setVolume(saved.volume);
    if (typeof saved.isSoundOn === 'boolean') audio.setEnabled(saved.isSoundOn);
    if (typeof saved.baseFatigue === 'number') baseFatigue = Math.min(1, Math.max(0, saved.baseFatigue));

    const pct = Math.round(audio.volume * 100);
    el.volume.value = pct;
    el.volLabel.textContent = `${pct}%`;
    el.volFill.style.transform = `scaleX(${(pct / 100).toFixed(3)})`;
}

/* ==================================================================
   Background
   ================================================================== */

const BANDS = [
    { cls: 'rain-drop--far', count: 30, dur: [3.0, 4.4], len: [10, 16] },
    { cls: 'rain-drop--mid', count: 28, dur: [2.1, 3.0], len: [16, 24] },
    { cls: 'rain-drop--near', count: 16, dur: [1.4, 2.1], len: [24, 34] }
];

function paintBackground(isFocus) {
    el.bg.replaceChildren();
    if (reduceMotion) return;

    const frag = document.createDocumentFragment();

    if (isFocus) {
        for (const band of BANDS) {
            for (let i = 0; i < band.count; i++) {
                const d = document.createElement('div');
                d.className = `rain-drop ${band.cls}`;
                d.style.left = Math.random() * 100 + '%';
                d.style.height = (band.len[0] + Math.random() * (band.len[1] - band.len[0])) + 'px';
                d.style.animationDuration = (band.dur[0] + Math.random() * (band.dur[1] - band.dur[0])) + 's';
                d.style.animationDelay = (Math.random() * -4) + 's';
                frag.appendChild(d);
            }
        }
    } else {
        for (let i = 0; i < 34; i++) {
            const p = document.createElement('div');
            const soft = Math.random() > 0.55;
            p.className = 'particle' + (soft ? ' particle--soft' : '');
            p.style.left = Math.random() * 100 + '%';
            p.style.top = Math.random() * 100 + '%';
            const size = (soft ? 10 : 4) + Math.random() * (soft ? 18 : 9);
            p.style.width = size + 'px';
            p.style.height = size + 'px';
            p.style.animationDuration = (4 + Math.random() * 5) + 's';
            p.style.animationDelay = (Math.random() * -5) + 's';
            frag.appendChild(p);
        }
    }

    el.bg.appendChild(frag);
}

/* ==================================================================
   Render
   ================================================================== */

function announce(msg) { el.announcer.textContent = msg; }

/**
 * The <svg> is rotated -90deg in CSS so the dash offset starts at twelve
 * o'clock. The knob uses un-offset angles because that rotation already
 * supplies the quarter turn.
 */
function placeKnob(progress) {
    const a = progress * Math.PI * 2;
    el.ringKnob.setAttribute('cx', 140 + Math.cos(a) * RING_RADIUS);
    el.ringKnob.setAttribute('cy', 140 + Math.sin(a) * RING_RADIUS);
}

function setClock(label) {
    const chars = label.replace(':', '');
    el.digits.forEach((stack, i) => {
        const n = Number(chars[i]);
        if (Number.isFinite(n)) stack.style.setProperty('--n', n);
    });
}

function renderStatus() {
    const s = timer.state;
    const minutes = s.isFocusMode ? s.focusMinutes : s.breakMinutes;
    const kind = s.isFocusMode ? 'focus' : 'break';
    if (buffering && s.isRunning) {
        el.status.textContent = `Running. Loading the ${s.isFocusMode ? 'rain' : 'music'}, the audio file is large.`;
    } else {
        el.status.textContent = s.isRunning
            ? `Running. ${s.label} left of a ${minutes} minute ${kind} session.`
            : `Paused at ${s.label} of a ${minutes} minute ${kind} session.`;
    }
}

function render() {
    const s = timer.state;

    setClock(s.label);
    el.srTime.textContent = s.label;
    applyProgress(el.ringFill, s.progress);
    placeKnob(s.progress);
    el.ring.setAttribute('aria-valuenow', Math.round(s.progress * 100));
    el.ring.setAttribute('aria-valuetext', `${s.label} remaining`);

    el.start.innerHTML = s.isRunning ? `${ICON_PAUSE} Pause` : `${ICON_PLAY} Start`;
    el.focusInput.disabled = s.isRunning;
    el.breakInput.disabled = s.isRunning;
    el.focusBtn.setAttribute('aria-pressed', String(s.isFocusMode));
    el.breakBtn.setAttribute('aria-pressed', String(!s.isFocusMode));
    el.badge.lastChild.textContent = s.isFocusMode ? 'Focus' : 'Break';

    el.body.classList.toggle('focus-mode', s.isFocusMode);
    el.body.classList.toggle('break-mode', !s.isFocusMode);
    el.body.classList.toggle('is-running', s.isRunning);

    el.dots.forEach((dot, i) => dot.classList.toggle('is-on', i < s.sessionCount));
    el.sessionLabel.textContent = `Session ${s.sessionCount} of ${SESSIONS_PER_CYCLE}`;

    const spent = s.totalTime - s.timeLeft;
    el.elapsed.textContent = `${formatTime(spent)} elapsed of ${formatTime(s.totalTime)}`;

    document.title = s.isRunning
        ? `${s.label} ${s.isFocusMode ? 'Focus' : 'Break'}`
        : 'Focus Timer';

    renderEnergy();
    renderStatus();
}

/* ==================================================================
   Engine wiring
   ================================================================== */

timer.on('tick', render);
timer.on('start', () => { audio.play(timer.state.isFocusMode); render(); });
timer.on('pause', () => { audio.pause(); render(); });

timer.on('reset', () => {
    audio.stop();
    render();
    announce(`Timer reset to ${timer.state.label}.`);
});

timer.on('mode', () => {
    const s = timer.state;
    paintBackground(s.isFocusMode);
    render();
    announce(`${s.isFocusMode ? 'Focus' : 'Break'} mode. ${s.label} on the clock.`);
});

timer.on('finish', ({ finishedFocus }) => {
    audio.stop();
    audio.chime();

    if (!reduceMotion) {
        el.ringShell.classList.remove('is-complete');
        void el.ringShell.offsetWidth;   // restart the animation
        el.ringShell.classList.add('is-complete');
    }

    const s = timer.state;
    paintBackground(s.isFocusMode);
    save();
    render();

    const pct = Math.round((1 - fatigue) * 100);
    announce(finishedFocus
        ? `Focus session complete. Energy down to ${pct} percent. Break mode ready, ${s.label}.`
        : `Break over. Energy back to ${pct} percent. Focus mode ready, ${s.label}.`);
});

/* ==================================================================
   Ring scrubbing
   ================================================================== */

let wasRunning = false;

makeScrubbable(el.ring, {
    getProgress: () => timer.state.progress,
    onScrubStart: () => {
        wasRunning = timer.state.isRunning;
        if (wasRunning) { timer.pause(); audio.pause(); }
        dismissHint();
    },
    onScrub: (p) => timer.seekProgress(p),
    onScrubEnd: () => {
        if (wasRunning && timer.state.timeLeft > 0) timer.start();
        render();
    }
});

function dismissHint() {
    if (hintDismissed) return;
    hintDismissed = true;
    el.ringHint.classList.add('is-hidden');
}

el.ring.addEventListener('keydown', dismissHint);

/* ==================================================================
   Controls
   ================================================================== */

el.start.addEventListener('click', () => timer.toggle());
el.reset.addEventListener('click', () => timer.reset());

function switchMode(toFocus) {
    anchorFatigue();          // carry the tiredness across the boundary
    timer.pause();
    audio.stop();
    timer.setMode(toFocus);
    save();
}

el.focusBtn.addEventListener('click', () => switchMode(true));
el.breakBtn.addEventListener('click', () => switchMode(false));

el.sound.addEventListener('click', () => {
    audio.setEnabled(!audio.enabled);
    el.sound.setAttribute('aria-pressed', String(audio.enabled));
    el.sound.setAttribute('aria-label', audio.enabled ? 'Mute ambient sound' : 'Unmute ambient sound');
    el.sound.classList.toggle('is-muted', !audio.enabled);
    el.sound.innerHTML = audio.enabled ? ICON_SOUND_ON : ICON_SOUND_OFF;
    if (audio.enabled && timer.state.isRunning) audio.play(timer.state.isFocusMode);
    save();
});

el.volume.addEventListener('input', (e) => {
    const pct = Number(e.target.value);
    audio.setVolume(pct / 100);
    el.volLabel.textContent = `${pct}%`;
    el.volFill.style.transform = `scaleX(${(pct / 100).toFixed(3)})`;
    save();
});

function onDuration(e) {
    if (timer.state.isRunning) return;
    const which = e.target === el.focusInput ? 'focus' : 'break';
    e.target.value = timer.setDuration(which, e.target.value);
    save();
    render();
}

el.focusInput.addEventListener('change', onDuration);
el.breakInput.addEventListener('change', onDuration);

document.addEventListener('keydown', (e) => {
    const a = document.activeElement;
    const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.code === 'Space') { e.preventDefault(); timer.toggle(); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); timer.reset(); }
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && timer.state.isRunning) render();
});

/* ==================================================================
   Init
   ================================================================== */

load();
el.sound.classList.toggle('is-muted', !audio.enabled);
el.sound.setAttribute('aria-pressed', String(audio.enabled));
el.sound.innerHTML = audio.enabled ? ICON_SOUND_ON : ICON_SOUND_OFF;

// Ten stacked glyphs per digit column, translated by --n.
for (const stack of el.digits) {
    stack.replaceChildren(...Array.from({ length: 10 }, (_, i) => {
        const s = document.createElement('span');
        s.textContent = i;
        return s;
    }));
}

timer.setMode(true, { silent: true });
paintBackground(true);
render();
scheduleBlink();
