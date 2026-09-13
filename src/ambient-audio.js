/**
 * Ambient sound plus the session-complete tone. Shared so the case study demo
 * behaves exactly like the product, including the mute state.
 */

export function createAudio({ rainSrc, softSrc, onBuffering } = {}) {
    let rain = null;
    let soft = null;
    let beepContext = null;
    let volume = 0.5;
    let enabled = true;

    function init() {
        if (rain && soft) return;
        rain = new Audio(rainSrc);
        rain.loop = true;
        rain.preload = 'none';
        soft = new Audio(softSrc);
        soft.loop = true;
        soft.preload = 'none';

        // The source files are large, so the gap between pressing start and
        // hearing anything is real. Surface it rather than hide it.
        for (const el of [rain, soft]) {
            el.addEventListener('waiting', () => onBuffering && onBuffering(true));
            el.addEventListener('playing', () => onBuffering && onBuffering(false));
            el.addEventListener('canplaythrough', () => onBuffering && onBuffering(false));
            el.addEventListener('error', () => onBuffering && onBuffering(false));
        }

        applyVolume();
    }

    function applyVolume() {
        if (rain) rain.volume = volume * 0.7;
        if (soft) soft.volume = volume * 0.5;
    }

    function play(isFocus) {
        if (!enabled || !rainSrc) return;
        init();
        const wanted = isFocus ? rain : soft;
        const other = isFocus ? soft : rain;
        other.pause();
        other.currentTime = 0;
        wanted.play().catch(() => {
            /* autoplay policy or a missing file. Silence is acceptable here. */
        });
    }

    /** Pause keeps the playhead, so resuming does not restart the rain. */
    function pause() {
        if (rain) rain.pause();
        if (soft) soft.pause();
        if (onBuffering) onBuffering(false);
    }

    function stop() {
        if (rain) { rain.pause(); rain.currentTime = 0; }
        if (soft) { soft.pause(); soft.currentTime = 0; }
    }

    /** One reused context. A new one per beep leaks until the browser cap silences it. */
    function chime() {
        if (!enabled) return;
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            if (!beepContext) beepContext = new Ctx();
            if (beepContext.state === 'suspended') beepContext.resume();

            const now = beepContext.currentTime;
            const osc = beepContext.createOscillator();
            const gain = beepContext.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
            osc.connect(gain);
            gain.connect(beepContext.destination);
            osc.start(now);
            osc.stop(now + 0.5);
        } catch (e) {
            /* no audio output available */
        }
    }

    return {
        play, pause, stop, chime,
        setVolume(v) { volume = Math.min(1, Math.max(0, v)); applyVolume(); },
        setEnabled(v) { enabled = v; if (!v) pause(); },
        get enabled() { return enabled; },
        get volume() { return volume; }
    };
}
