/**
 * Case study page. Every timer behaviour on this page comes from the same
 * modules the app runs on, so the demo cannot drift away from the product.
 */
import { createTimer } from './src/timer-engine.js';
import { createAudio } from './src/ambient-audio.js';
import { applyProgress, makeScrubbable, RING_RADIUS } from './src/ring.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------
   Rings
   ------------------------------------------------------------------ */

/**
 * The <svg> is rotated -90deg in CSS so the dash offset starts at twelve
 * o'clock. The knob therefore uses un-offset angles: the element rotation
 * already supplies the quarter turn.
 */
function placeKnob(knob, progress) {
    const a = progress * Math.PI * 2;
    knob.setAttribute('cx', 140 + Math.cos(a) * RING_RADIUS);
    knob.setAttribute('cy', 140 + Math.sin(a) * RING_RADIUS);
}

function mountRing(shell, { withControls = false } = {}) {
    const svg = shell.querySelector('[data-ring]');
    const fill = shell.querySelector('[data-ring-fill]');
    const knob = shell.querySelector('[data-ring-knob]');
    const time = shell.querySelector('[data-ring-time]');
    const modeEl = shell.querySelector('[data-ring-mode]');

    const timer = createTimer({ focusMinutes: 25, breakMinutes: 5 });
    let wasRunning = false;
    let syncControls = () => {};
    let buffering = false;

    // Only the instrument makes sound. The hero ring is a scrub demo, and a
    // page that starts playing rain because you dragged something is hostile.
    const audio = withControls
        ? createAudio({
            rainSrc: 'assets/audio/rain.mp3',
            softSrc: 'assets/audio/soft.mp3',
            onBuffering: (b) => { buffering = b; syncControls(); }
        })
        : null;

    function paint() {
        const s = timer.state;
        applyProgress(fill, s.progress);
        placeKnob(knob, s.progress);
        time.textContent = s.label;
        if (modeEl) modeEl.textContent = s.isFocusMode ? 'Focus' : 'Break';
        svg.setAttribute('aria-valuenow', Math.round(s.progress * 100));
        svg.setAttribute('aria-valuetext', `${s.label} remaining`);
    }

    timer.on('tick', paint);

    makeScrubbable(svg, {
        getProgress: () => timer.state.progress,
        onScrubStart: () => {
            wasRunning = timer.state.isRunning;
            if (wasRunning) {
                timer.pause();
                if (audio) audio.pause();
            }
        },
        onScrub: (p) => timer.seekProgress(p),
        onScrubEnd: () => {
            if (wasRunning && timer.state.timeLeft > 0) {
                timer.start();
                if (audio) audio.play(timer.state.isFocusMode);
            }
            if (withControls) syncControls();
        }
    });

    if (withControls) {
        const panel = shell.closest('.instrument__panel');
        const toggleBtn = panel.querySelector('[data-act="toggle"]');
        const resetBtn = panel.querySelector('[data-act="reset"]');
        const focusBtn = panel.querySelector('[data-act="focus"]');
        const breakBtn = panel.querySelector('[data-act="break"]');
        const status = panel.querySelector('[data-ring-status]');
        const muteBtn = panel.querySelector('[data-act="mute"]');
        const volume = panel.querySelector('#csVolume');
        const volLabel = panel.querySelector('[data-vol-label]');

        const ICON_ON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
        const ICON_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';

        syncControls = () => {
            const s = timer.state;
            toggleBtn.textContent = s.isRunning ? 'Pause' : 'Start';
            focusBtn.setAttribute('aria-pressed', String(s.isFocusMode));
            breakBtn.setAttribute('aria-pressed', String(!s.isFocusMode));
            const minutes = s.isFocusMode ? s.focusMinutes : s.breakMinutes;
            const kind = s.isFocusMode ? 'focus' : 'break';
            if (buffering && s.isRunning) {
                status.textContent = `Running. Loading the ${s.isFocusMode ? 'rain' : 'music'}, the audio file is large.`;
            } else {
                status.textContent = s.isRunning
                    ? `Running. ${s.label} left of a ${minutes} minute ${kind} session.`
                    : `Paused at ${s.label} of a ${minutes} minute ${kind} session.`;
            }
        };

        toggleBtn.addEventListener('click', () => {
            timer.toggle();
            if (timer.state.isRunning) audio.play(timer.state.isFocusMode);
            else audio.pause();
            syncControls();
        });

        resetBtn.addEventListener('click', () => { timer.reset(); audio.stop(); syncControls(); });
        focusBtn.addEventListener('click', () => { timer.pause(); audio.stop(); timer.setMode(true); syncControls(); });
        breakBtn.addEventListener('click', () => { timer.pause(); audio.stop(); timer.setMode(false); syncControls(); });

        muteBtn.addEventListener('click', () => {
            audio.setEnabled(!audio.enabled);
            muteBtn.setAttribute('aria-pressed', String(audio.enabled));
            muteBtn.setAttribute('aria-label', audio.enabled ? 'Mute ambient sound' : 'Unmute ambient sound');
            muteBtn.classList.toggle('is-muted', !audio.enabled);
            muteBtn.innerHTML = audio.enabled ? ICON_ON : ICON_OFF;
            if (audio.enabled && timer.state.isRunning) audio.play(timer.state.isFocusMode);
            syncControls();
        });

        volume.addEventListener('input', (e) => {
            const pct = Number(e.target.value);
            audio.setVolume(pct / 100);
            volLabel.textContent = `${pct}%`;
        });

        timer.on('finish', () => {
            audio.stop();
            audio.chime();
            syncControls();
        });
        timer.on('tick', () => { if (timer.state.timeLeft <= 0) syncControls(); });
        syncControls();
    }

    // The hero ring opens part-way through a session so the arc reads as a
    // control with a value, not an empty circle.
    if (!withControls) timer.seekProgress(0.32);

    paint();
    return timer;
}

document.querySelectorAll('[data-ring-shell]').forEach((shell) => {
    mountRing(shell, { withControls: shell.classList.contains('ring-shell--lg') });
});

/* ------------------------------------------------------------------
   Scroll reveals. IntersectionObserver, never a scroll listener.
   ------------------------------------------------------------------ */

const revealTargets = document.querySelectorAll('.reveal');

if (reduceMotion) {
    revealTargets.forEach((el) => el.classList.add('is-visible'));
} else {
    const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
        }
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    // Anything already on screen reveals straight away. Observing it instead
    // left the hero buttons at opacity 0 on phones, where they sit just below
    // the observer's threshold and never scroll into it.
    const fold = window.innerHeight * 0.95;
    revealTargets.forEach((el) => {
        if (el.getBoundingClientRect().top < fold) el.classList.add('is-visible');
        else io.observe(el);
    });
}

/* ------------------------------------------------------------------
   Count-up on the audit figures. Motivated: the number is the finding,
   so counting to it draws the eye to the evidence rather than the card.
   ------------------------------------------------------------------ */

const counters = document.querySelectorAll('[data-count]');

function runCount(el) {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || '0', 10);

    if (reduceMotion || target === 0) {
        el.textContent = target.toFixed(decimals);
        return;
    }

    const duration = 1100;
    const start = performance.now();

    function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = (target * eased).toFixed(decimals);
        if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

if (reduceMotion) {
    // Settle every figure immediately rather than waiting for it to scroll in.
    counters.forEach(runCount);
} else if (counters.length) {
    const countIo = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            runCount(entry.target);
            countIo.unobserve(entry.target);
        }
    }, { threshold: 0.6 });
    counters.forEach((el) => countIo.observe(el));
}

/* ------------------------------------------------------------------
   Decision demos
   ------------------------------------------------------------------ */

const fadeDemo = document.querySelector('[data-fade-demo]');
const fadeToggle = document.querySelector('[data-fade-toggle]');

if (fadeDemo && fadeToggle) {
    fadeToggle.addEventListener('click', () => {
        fadeDemo.classList.toggle('is-break');
    });
}

const contrastDemo = document.querySelector('[data-contrast-demo]');
const contrastToggle = document.querySelector('[data-contrast-toggle]');

if (contrastDemo && contrastToggle) {
    contrastToggle.addEventListener('click', () => {
        const showingOriginal = contrastDemo.classList.toggle('is-original');
        contrastToggle.textContent = showingOriginal ? 'Show the fix' : 'Show the original';
    });
}

/* ------------------------------------------------------------------
   Scroll rail fallback for browsers without scroll-driven animations
   ------------------------------------------------------------------ */

if (!CSS.supports('animation-timeline: scroll()')) {
    const fill = document.querySelector('.scroll-rail__fill');
    const sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:100%;pointer-events:none;';
    document.body.appendChild(sentinel);

    // IntersectionObserver against a full-height sentinel gives scroll position
    // without binding a handler to every scroll frame.
    const railIo = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const r = entry.boundingClientRect;
            const scrolled = -r.top;
            const max = r.height - window.innerHeight;
            const p = max > 0 ? Math.min(1, Math.max(0, scrolled / max)) : 0;
            fill.style.transform = `scaleX(${p})`;
        }
    }, { threshold: Array.from({ length: 51 }, (_, i) => i / 50) });
    railIo.observe(sentinel);
}
