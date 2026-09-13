/**
 * Shared Pomodoro engine. No DOM, no styling, no assumptions about the page
 * it runs on. Both the timer app and the case study import this, so the
 * interactive demo in the case study is the real product, not a mock of it.
 */

export const LIMITS = {
    focus: { min: 1, max: 120, fallback: 25 },
    break: { min: 1, max: 60, fallback: 5 }
};

export const SESSIONS_PER_CYCLE = 4;

/** Attributes min/max only gate the spinner, so typed values need real clamping. */
export function clampMinutes(rawValue, limits) {
    const parsed = parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) return limits.fallback;
    return Math.min(limits.max, Math.max(limits.min, parsed));
}

export function formatTime(seconds) {
    const safe = Math.max(0, Math.round(seconds));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function createTimer({ focusMinutes = 25, breakMinutes = 5, tickMs = 250 } = {}) {
    const listeners = new Map();

    const state = {
        focusMinutes,
        breakMinutes,
        isFocusMode: true,
        isRunning: false,
        timeLeft: focusMinutes * 60,
        totalTime: focusMinutes * 60,
        sessionCount: 1
    };

    let deadline = 0;
    let interval = null;

    function on(event, fn) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(fn);
        return () => listeners.get(event).delete(fn);
    }

    function emit(event, payload) {
        const set = listeners.get(event);
        if (!set) return;
        for (const fn of set) fn(payload, snapshot());
    }

    function snapshot() {
        return {
            ...state,
            progress: state.totalTime > 0 ? (state.totalTime - state.timeLeft) / state.totalTime : 0,
            label: formatTime(state.timeLeft)
        };
    }

    /**
     * Counting down by decrementing once per interval drifts, and inactive tabs
     * are throttled to roughly one tick a minute. Deriving from a wall-clock
     * deadline means throttling costs display smoothness, never accuracy.
     */
    function tick() {
        const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
        if (remaining !== state.timeLeft) {
            state.timeLeft = remaining;
            emit('tick');
        }
        if (remaining <= 0) finish();
    }

    function start() {
        if (state.isRunning || state.timeLeft <= 0) return;
        state.isRunning = true;
        deadline = Date.now() + state.timeLeft * 1000;
        clearInterval(interval);
        interval = setInterval(tick, tickMs);
        emit('start');
        emit('tick');
    }

    function pause() {
        if (!state.isRunning) return;
        clearInterval(interval);
        interval = null;
        state.timeLeft = Math.max(0, Math.round((deadline - Date.now()) / 1000));
        state.isRunning = false;
        emit('pause');
        emit('tick');
    }

    function toggle() {
        state.isRunning ? pause() : start();
    }

    function finish() {
        clearInterval(interval);
        interval = null;
        state.isRunning = false;
        state.timeLeft = 0;

        const finishedFocus = state.isFocusMode;
        if (finishedFocus) {
            // Clamping only the displayed value is what left the original stuck
            // on "1" from the fifth session onward. Clamp the state itself.
            state.sessionCount = state.sessionCount >= SESSIONS_PER_CYCLE ? 1 : state.sessionCount + 1;
        }

        setMode(!finishedFocus, { silent: true });
        emit('finish', { finishedFocus });
    }

    function setMode(focus, { silent = false } = {}) {
        state.isFocusMode = focus;
        state.timeLeft = (focus ? state.focusMinutes : state.breakMinutes) * 60;
        state.totalTime = state.timeLeft;
        if (!silent) emit('mode');
        emit('tick');
    }

    function reset() {
        clearInterval(interval);
        interval = null;
        state.isRunning = false;
        state.timeLeft = (state.isFocusMode ? state.focusMinutes : state.breakMinutes) * 60;
        state.totalTime = state.timeLeft;
        emit('reset');
        emit('tick');
    }

    function setDuration(which, minutes) {
        const limits = which === 'focus' ? LIMITS.focus : LIMITS.break;
        const value = clampMinutes(minutes, limits);
        if (which === 'focus') state.focusMinutes = value;
        else state.breakMinutes = value;

        const affectsCurrent = (which === 'focus') === state.isFocusMode;
        if (affectsCurrent && !state.isRunning) {
            state.timeLeft = value * 60;
            state.totalTime = state.timeLeft;
            emit('tick');
        }
        return value;
    }

    /** Used by the scrub ring: jump to a point in the session, 0 = start, 1 = done. */
    function seekProgress(progress) {
        const p = Math.min(1, Math.max(0, progress));
        state.timeLeft = Math.round(state.totalTime * (1 - p));
        if (state.isRunning) deadline = Date.now() + state.timeLeft * 1000;
        emit('seek');
        emit('tick');
    }

    function destroy() {
        clearInterval(interval);
        interval = null;
        listeners.clear();
    }

    return {
        on, start, pause, toggle, reset, setMode, setDuration, seekProgress, destroy,
        get state() { return snapshot(); }
    };
}
