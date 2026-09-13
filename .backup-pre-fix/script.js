// Audio files
const RAIN_AUDIO = new URL('./assets/audio/rain.mp3', import.meta.url).href;
const SOFT_AUDIO = new URL('./assets/audio/soft.mp3', import.meta.url).href;

// Audio elements
let rainAudio;
let softAudio;
let isSoundOn = true;
let volume = 0.5;

// Timer State
let timeLeft = 25 * 60; // 25 minutes in seconds
let totalTime = 25 * 60;
let focusTime = 25; // minutes
let breakTime = 5; // minutes
let isRunning = false;
let timerInterval = null;
let isFocusMode = true;
let sessionCount = 1;

// DOM Elements
const timerDisplay = document.getElementById('timerDisplay');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const modeBadge = document.getElementById('modeBadge');
const progressRing = document.getElementById('progressRing');
const soundToggle = document.getElementById('soundToggle');
const volumeSlider = document.getElementById('volumeSlider');
const volumeLabel = document.getElementById('volumeLabel');
const sessionCountEl = document.getElementById('sessionCount');
const bgAnimation = document.getElementById('bgAnimation');
const focusTimeInput = document.getElementById('focusTimeInput');
const breakTimeInput = document.getElementById('breakTimeInput');

// Circumference of progress ring
const circumference = 2 * Math.PI * 135;
progressRing.style.strokeDasharray = circumference;

// Initialize Audio
function initAudio() {
    if (rainAudio && softAudio) return;

    rainAudio = new Audio(RAIN_AUDIO);
    rainAudio.loop = true;
    rainAudio.volume = volume * 0.7;

    softAudio = new Audio(SOFT_AUDIO);
    softAudio.loop = true;
    softAudio.volume = volume * 0.5;
}

// Start rain sound
function startRainSound() {
    if (!isSoundOn) return;
    initAudio();

    // Stop music first
    if (softAudio) {
        softAudio.pause();
        softAudio.currentTime = 0;
    }

    // Play rain
    rainAudio.play().catch(e => console.log('Audio play failed:', e));
}

// Start soft music
function startSoftMusic() {
    if (!isSoundOn) return;
    initAudio();

    // Stop rain first
    if (rainAudio) {
        rainAudio.pause();
        rainAudio.currentTime = 0;
    }

    // Play soft music
    softAudio.play().catch(e => console.log('Audio play failed:', e));
}

// Stop all sounds
function stopAllSounds() {
    if (rainAudio) {
        rainAudio.pause();
        rainAudio.currentTime = 0;
    }
    if (softAudio) {
        softAudio.pause();
        softAudio.currentTime = 0;
    }
}

// Create rain drops animation
function createRainDrops() {
    bgAnimation.innerHTML = '';
    for (let i = 0; i < 100; i++) {
        const drop = document.createElement('div');
        drop.className = 'rain-drop';
        drop.style.left = Math.random() * 100 + '%';
        drop.style.animationDuration = (0.5 + Math.random() * 0.5) + 's';
        drop.style.animationDelay = Math.random() * 2 + 's';
        bgAnimation.appendChild(drop);
    }
}

// Create floating particles animation
function createParticles() {
    bgAnimation.innerHTML = '';
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        const size = 5 + Math.random() * 15;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.animationDuration = (3 + Math.random() * 4) + 's';
        particle.style.animationDelay = Math.random() * 2 + 's';
        bgAnimation.appendChild(particle);
    }
}

// Switch to Focus Mode
function switchToFocusMode() {
    isFocusMode = true;
    document.body.className = 'focus-mode';
    modeBadge.textContent = 'Focus Mode';
    focusTime = parseInt(focusTimeInput.value) || 25;
    timeLeft = focusTime * 60;
    totalTime = timeLeft;
    createRainDrops();
    if (isRunning && isSoundOn) {
        startRainSound();
    }
    updateDisplay();
}

// Switch to Break Mode
function switchToBreakMode() {
    isFocusMode = false;
    document.body.className = 'break-mode';
    modeBadge.textContent = 'Break Mode';
    breakTime = parseInt(breakTimeInput.value) || 5;
    timeLeft = breakTime * 60;
    totalTime = timeLeft;
    createParticles();
    if (isRunning && isSoundOn) {
        startSoftMusic();
    }
    updateDisplay();
}

// Format time as MM:SS
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Update the timer display
function updateDisplay() {
    timerDisplay.textContent = formatTime(timeLeft);
    const progress = (totalTime - timeLeft) / totalTime;
    progressRing.style.strokeDashoffset = circumference * (1 - progress);
}

// Start/Pause timer
function toggleTimer() {
    initAudio();

    if (isRunning) {
        // Pause
        clearInterval(timerInterval);
        isRunning = false;
        startBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Start
        `;
        stopAllSounds();
        updateInputState();
    } else {
        // Start
        isRunning = true;
        startBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
            Pause
        `;

        if (isFocusMode) {
            startRainSound();
        } else {
            startSoftMusic();
        }

        timerInterval = setInterval(() => {
            timeLeft--;
            updateDisplay();

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                isRunning = false;
                stopAllSounds();

                // Play notification sound
                playNotification();

                if (isFocusMode) {
                    sessionCount++;
                    sessionCountEl.textContent = sessionCount > 4 ? 1 : sessionCount;
                    switchToBreakMode();
                } else {
                    switchToFocusMode();
                }

                startBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    Start
                `;
                updateInputState();
            }
        }, 1000);
        updateInputState();
    }
}

// Play notification sound
function playNotification() {
    if (!isSoundOn) return;

    // Use Web Audio API for just the notification beep
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.3;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.stop(ctx.currentTime + 0.5);
}

// Reset timer
function resetTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    stopAllSounds();

    startBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Start
    `;

    if (isFocusMode) {
        focusTime = parseInt(focusTimeInput.value) || 25;
        timeLeft = focusTime * 60;
    } else {
        breakTime = parseInt(breakTimeInput.value) || 5;
        timeLeft = breakTime * 60;
    }
    totalTime = timeLeft;
    updateDisplay();
    updateInputState();
}

// Toggle sound
function toggleSound() {
    isSoundOn = !isSoundOn;
    soundToggle.classList.toggle('muted', !isSoundOn);

    if (isSoundOn) {
        soundToggle.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
        `;
        if (isRunning) {
            if (isFocusMode) {
                startRainSound();
            } else {
                startSoftMusic();
            }
        }
    } else {
        soundToggle.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
            </svg>
        `;
        stopAllSounds();
    }
}

// Volume control
function handleVolumeChange(e) {
    volume = e.target.value / 100;
    volumeLabel.textContent = e.target.value + '%';

    if (rainAudio) {
        rainAudio.volume = volume * 0.7;
    }
    if (softAudio) {
        softAudio.volume = volume * 0.5;
    }
}

// Handle time input changes
function handleTimeChange() {
    if (isRunning) return; // Don't allow changes while timer is running

    if (isFocusMode) {
        focusTime = parseInt(focusTimeInput.value) || 25;
        timeLeft = focusTime * 60;
    } else {
        breakTime = parseInt(breakTimeInput.value) || 5;
        timeLeft = breakTime * 60;
    }
    totalTime = timeLeft;
    updateDisplay();
}

// Enable/disable time inputs based on timer state
function updateInputState() {
    if (isRunning) {
        focusTimeInput.disabled = true;
        breakTimeInput.disabled = true;
    } else {
        focusTimeInput.disabled = false;
        breakTimeInput.disabled = false;
    }
}

// Event Listeners
startBtn.addEventListener('click', toggleTimer);
resetBtn.addEventListener('click', resetTimer);
soundToggle.addEventListener('click', toggleSound);
volumeSlider.addEventListener('input', handleVolumeChange);
focusTimeInput.addEventListener('change', handleTimeChange);
breakTimeInput.addEventListener('change', handleTimeChange);

// Manual mode switch
document.getElementById('focusModeBtn').addEventListener('click', () => {
    clearInterval(timerInterval);
    isRunning = false;
    stopAllSounds();
    startBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Start
    `;
    switchToFocusMode();
    updateInputState();
});

document.getElementById('breakModeBtn').addEventListener('click', () => {
    clearInterval(timerInterval);
    isRunning = false;
    stopAllSounds();
    startBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Start
    `;
    switchToBreakMode();
    updateInputState();
});

// Initialize
createRainDrops();
updateDisplay();
updateInputState();
