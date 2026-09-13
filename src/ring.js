/**
 * Progress ring: geometry plus an optional pointer-driven scrub control.
 *
 * The ring is drawn in a fixed 280-unit viewBox, so the circumference is a
 * constant regardless of how large the SVG renders. That is what lets the
 * same module drive a 280px ring on the timer and a 420px one on the case study.
 */

export const RING_RADIUS = 135;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function applyProgress(circleEl, progress) {
    const p = Math.min(1, Math.max(0, progress));
    circleEl.style.strokeDasharray = RING_CIRCUMFERENCE;
    circleEl.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - p);
}

/** Position on the ring for a given progress, in viewBox units. 0 = 12 o'clock, clockwise. */
export function pointAtProgress(progress, radius = RING_RADIUS, cx = 140, cy = 140) {
    const angle = progress * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

/**
 * Makes a ring scrubbable. The visitor drags around the arc and time follows
 * the angle. Pointer events cover mouse, touch and pen in one path, and
 * setPointerCapture keeps the drag alive when the cursor leaves the circle.
 */
export function makeScrubbable(svgEl, { onScrub, onScrubStart, onScrubEnd, getProgress }) {
    let dragging = false;
    let lastProgress = getProgress();

    function progressFromEvent(e) {
        const rect = svgEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        // atan2(dx, -dy) puts 0 at twelve o'clock and increases clockwise,
        // which matches how the ring is drawn.
        let angle = Math.atan2(e.clientX - cx, cy - e.clientY);
        if (angle < 0) angle += Math.PI * 2;
        let progress = angle / (Math.PI * 2);

        // Without this, dragging a few pixels past the top wraps 0.99 -> 0.01
        // and the timer appears to jump a whole session.
        if (Math.abs(progress - lastProgress) > 0.5) {
            progress = lastProgress > 0.5 ? 1 : 0;
        }
        lastProgress = progress;
        return progress;
    }

    function down(e) {
        // Ignore drags that start well inside the ring, so the play button and
        // the time readout in the middle stay clickable.
        const rect = svgEl.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy) / (rect.width / 2);
        if (dist < 0.55) return;

        dragging = true;
        lastProgress = getProgress();
        svgEl.setPointerCapture(e.pointerId);
        svgEl.classList.add('is-scrubbing');
        onScrubStart && onScrubStart();
        onScrub(progressFromEvent(e));
        e.preventDefault();
    }

    function move(e) {
        if (!dragging) return;
        onScrub(progressFromEvent(e));
    }

    function up(e) {
        if (!dragging) return;
        dragging = false;
        if (svgEl.hasPointerCapture(e.pointerId)) svgEl.releasePointerCapture(e.pointerId);
        svgEl.classList.remove('is-scrubbing');
        onScrubEnd && onScrubEnd();
    }

    function key(e) {
        const step = e.shiftKey ? 0.1 : 1 / 60;
        let next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = getProgress() + step;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = getProgress() - step;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = 1;
        if (next === null) return;
        e.preventDefault();
        lastProgress = Math.min(1, Math.max(0, next));
        onScrub(lastProgress);
    }

    svgEl.addEventListener('pointerdown', down);
    svgEl.addEventListener('pointermove', move);
    svgEl.addEventListener('pointerup', up);
    svgEl.addEventListener('pointercancel', up);
    svgEl.addEventListener('keydown', key);

    return function destroy() {
        svgEl.removeEventListener('pointerdown', down);
        svgEl.removeEventListener('pointermove', move);
        svgEl.removeEventListener('pointerup', up);
        svgEl.removeEventListener('pointercancel', up);
        svgEl.removeEventListener('keydown', key);
    };
}
