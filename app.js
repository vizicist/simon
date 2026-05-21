const pads = Array.from(document.querySelectorAll(".pad"));
const roundEl = document.querySelector("#round");
const bestEl = document.querySelector("#best");
const subtitleEl = document.querySelector("#subtitle");
const connectButton = document.querySelector("#connect");
const learnButton = document.querySelector("#learn");
const startButton = document.querySelector("#start");
const hallOfFameButton = document.querySelector("#hall-of-fame");
const advancedHotspot = document.querySelector("#advanced-hotspot");
const resetButton = document.querySelector("#reset");
const boardEl = document.querySelector(".board");
const inputSelect = document.querySelector("#midi-input");
const sequenceGoalSelect = document.querySelector("#sequence-goal");
const midiStateEl = document.querySelector("#midi-state");
const resultOverlay = document.querySelector("#result-overlay");
const resultTitleEl = document.querySelector("#result-title");
const resultStepsEl = document.querySelector("#result-steps");
const resultTimeEl = document.querySelector("#result-time");
const resultDetailEl = document.querySelector("#result-detail");
const resultActionsEl = document.querySelector(".result-dialog .result-actions");
const resultStartButton = document.querySelector("#result-start");
const resultCloseButton = document.querySelector("#result-close");
const resultAchievementsButton = document.querySelector("#result-achievements");
const sigilMessagePanel = document.querySelector("#sigil-message-panel");
const sigilMessageButtons = Array.from(document.querySelectorAll(".sigil-message-button"));
const advancedPage = document.querySelector("#advanced-page");
const advancedReturnButton = document.querySelector("#advanced-return");
const advancedAchievementsButton = document.querySelector("#advanced-achievements");
const achievementsPage = document.querySelector("#achievements-page");
const achievementList = document.querySelector("#achievement-list");
const achievementEmpty = document.querySelector("#achievement-empty");
const achievementsCloseButton = document.querySelector("#achievements-close");

const colors = ["green", "red", "yellow", "blue"];
const sigilMessages = {
  chaos: ["mp3s/chaos-2026-05-09-21.18.04-319920.mp3"],
  oracle: ["mp3s/oracle-2026-05-09-21.18.45-427404.mp3"],
  directive: [
    "mp3s/directive-2026-05-09-21.12.17-583320.mp3",
    "mp3s/directive-2026-05-09-21.24.07-902931.mp3",
    "mp3s/directive-2026-05-09-21.25.38-684815.mp3",
  ],
  sacred: [
    "mp3s/sacred-2026-05-09-21.13.27-639718.mp3",
    "mp3s/sacred-2026-05-09-21.20.30-170710.mp3",
    "mp3s/sacred-2026-05-09-21.22.35-674882.mp3",
  ],
};
const keyMap = new Map([
  ["q", 0],
  ["w", 1],
  ["a", 2],
  ["s", 3],
]);

const playback = {
  introDelay: 700,
  litMs: 1000,
};

const advancedAccess = {
  taps: 0,
  requiredTaps: 4,
  resetTimer: null,
};

const storageKeys = {
  achievements: "sigil-sequence-achievements",
  best: "bop-pad-simon-best",
  inputId: "bop-pad-simon-input-id",
  inputName: "bop-pad-simon-input-name",
  notes: "bop-pad-simon-notes",
  sequenceGoal: "sigil-sequence-goal",
};

const defaultPadNotes = [null, null, null, null];
const loadedPadNotes = loadPadNotes();

const state = {
  access: null,
  currentInput: null,
  sequence: [],
  playerIndex: 0,
  acceptingInput: false,
  gameActive: false,
  playingBack: false,
  learning: false,
  learnTarget: null,
  learnedPads: new Set(),
  runId: 0,
  nextRoundTimer: null,
  startedAt: null,
  correctSteps: 0,
  best: Number(localStorage.getItem(storageKeys.best) || 0),
  padNotes: loadedPadNotes.notes,
  hasSavedMapping: loadedPadNotes.saved,
  sequenceGoal: loadSequenceGoal(),
  activeSigilMessage: null,
};

if (bestEl) {
  bestEl.textContent = state.best;
}
renderMappings();
renderSequenceGoal();
syncLearningDisplay();
autoConnectMidi();

connectButton.addEventListener("click", connectMidi);
learnButton.addEventListener("click", startLearning);
startButton.addEventListener("click", startGame);
hallOfFameButton.addEventListener("click", showAchievementsPage);
if (resetButton) {
  resetButton.addEventListener("click", resetGame);
}
inputSelect.addEventListener("change", selectMidiInput);
sequenceGoalSelect.addEventListener("change", updateSequenceGoal);
resultStartButton.addEventListener("click", startGame);
resultCloseButton.addEventListener("click", hideResult);
resultAchievementsButton.addEventListener("click", showAchievementsPage);
sigilMessageButtons.forEach((button) => {
  button.addEventListener("click", () => playSigilMessage(button.dataset.sigil));
});
advancedReturnButton.addEventListener("click", hideAdvancedPage);
advancedAchievementsButton.addEventListener("click", showAchievementsPage);
achievementsCloseButton.addEventListener("click", hideAchievementsPage);
advancedHotspot.addEventListener("click", handleAdvancedHotspot);
window.addEventListener("pointerdown", requestMainKioskOnce, { once: true });

pads.forEach((pad) => {
  pad.addEventListener("pointerdown", () => {
    const index = Number(pad.dataset.pad);
    if (state.learning) {
      selectLearnTarget(index);
      return;
    }

    handlePad(index);
  });
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) {
    return;
  }

  const pad = keyMap.get(event.key.toLowerCase());
  if (pad !== undefined) {
    if (state.learning) {
      selectLearnTarget(pad);
      return;
    }

    handlePad(pad);
  }
});

async function connectMidi() {
  if (!navigator.requestMIDIAccess) {
    midiStateEl.textContent = "Web MIDI is unavailable in this browser";
    return;
  }

  try {
    state.access = await navigator.requestMIDIAccess({ sysex: false });
    state.access.addEventListener("statechange", refreshInputs);
    refreshInputs();
  } catch (error) {
    midiStateEl.textContent = error.message;
  }
}

async function autoConnectMidi() {
  if (!navigator.requestMIDIAccess) {
    midiStateEl.textContent = "Web MIDI is unavailable in this browser";
    return;
  }

  try {
    if (!navigator.permissions) {
      midiStateEl.textContent = "Press Connect MIDI to allow access";
      return;
    }

    const permission = await navigator.permissions.query({ name: "midi", sysex: false });
    if (permission.state === "granted") {
      await connectMidi();
      return;
    }

    midiStateEl.textContent = "Press Connect MIDI to allow access";
  } catch {
    midiStateEl.textContent = "Press Connect MIDI to allow access";
  }
}

function refreshInputs() {
  const inputs = Array.from(state.access.inputs.values());
  inputSelect.replaceChildren();

  for (const input of inputs) {
    const option = document.createElement("option");
    option.value = input.id;
    option.textContent = input.name || `MIDI input ${input.id}`;
    inputSelect.append(option);
  }

  const savedInputId = localStorage.getItem(storageKeys.inputId);
  const savedInputName = localStorage.getItem(storageKeys.inputName);
  const preferred = inputs.find((input) => input.id === savedInputId)
    || inputs.find((input) => input.name && input.name === savedInputName)
    || inputs.find((input) => /bop\s*pad|boppad/i.test(input.name || ""))
    || inputs[0];
  if (preferred) {
    inputSelect.value = preferred.id;
    selectMidiInput();
  } else {
    midiStateEl.textContent = "No MIDI inputs found";
  }
}

function selectMidiInput() {
  if (state.currentInput) {
    state.currentInput.onmidimessage = null;
  }

  state.currentInput = state.access.inputs.get(inputSelect.value);
  if (state.currentInput) {
    state.currentInput.onmidimessage = onMidiMessage;
    localStorage.setItem(storageKeys.inputId, state.currentInput.id);
    localStorage.setItem(storageKeys.inputName, state.currentInput.name || "");
    midiStateEl.textContent = `Listening to ${state.currentInput.name || "selected input"}`;
  }
}

function onMidiMessage(event) {
  const [status, note, velocity] = event.data;
  const command = status & 0xf0;
  const isNoteOn = command === 0x90 && velocity > 0;

  if (!isNoteOn) {
    return;
  }

  if (state.learning) {
    learnNote(note, velocity);
    return;
  }

  const padIndex = state.padNotes.indexOf(note);
  if (padIndex !== -1) {
    handlePad(padIndex, velocity);
  }
}

function startLearning() {
  if (state.learning) {
    finishLearning();
    return;
  }

  hideResult();
  showAdvancedPage();
  cancelPendingRound();
  state.runId += 1;
  state.learning = true;
  state.learnTarget = null;
  state.learnedPads = new Set();
  state.acceptingInput = false;
  state.gameActive = false;
  state.playingBack = false;
  state.sequence = [];
  updateRound();
  updateStartButton();
  boardEl.classList.add("is-learning");
  pads.forEach((pad) => pad.classList.remove("learn-target"));
  learnButton.textContent = "Done";
  syncLearningDisplay();
}

function selectLearnTarget(index) {
  state.learnTarget = index;
  pads.forEach((pad) => pad.classList.toggle("learn-target", Number(pad.dataset.pad) === index));
  flashPad(index);
}

function learnNote(note, velocity = 96) {
  if (state.learnTarget === null) {
    return;
  }

  const duplicateIndex = state.padNotes.findIndex((mappedNote, index) => {
    return mappedNote === note && index !== state.learnTarget;
  });
  if (duplicateIndex !== -1) {
    state.padNotes[duplicateIndex] = null;
  }

  state.padNotes[state.learnTarget] = note;
  state.learnedPads.add(state.learnTarget);
  flashPad(state.learnTarget, velocity);
  pads[state.learnTarget].classList.remove("learn-target");
  pads[state.learnTarget].classList.add("learned");
  state.learnTarget = null;
  renderMappings();
  savePadNotes();

  if (!isValidPadNotes(state.padNotes)) {
    return;
  }

  if (state.learnedPads.size === 4) {
    finishLearning();
    return;
  }

}

function finishLearning() {
  state.learning = false;
  state.learnTarget = null;
  pads.forEach((pad) => pad.classList.remove("learn-target", "learned"));
  learnButton.textContent = "Learn Pads";
  syncLearningDisplay();
  if (isValidPadNotes(state.padNotes)) {
    savePadNotes();
  }
}

async function startGame() {
  hideResult();
  hideAchievementsPage();
  hideAdvancedPage();
  enterKioskMode();
  cancelPendingRound();
  state.runId += 1;
  state.learning = false;
  state.learnTarget = null;
  pads.forEach((pad) => pad.classList.remove("learn-target", "learned"));
  learnButton.textContent = "Learn Pads";
  syncLearningDisplay();
  state.sequence = [];
  state.playerIndex = 0;
  state.acceptingInput = false;
  state.gameActive = true;
  state.playingBack = false;
  state.startedAt = Date.now();
  state.correctSteps = 0;
  updateStartButton();
  const runId = state.runId;
  await runStartCountdown(runId);
  if (runId !== state.runId) {
    return;
  }

  addRound();
}

function resetGame() {
  stopSigilMessage();
  hideResult();
  hideAchievementsPage();
  hideAdvancedPage();
  enterKioskMode();
  cancelPendingRound();
  state.runId += 1;
  state.sequence = [];
  state.playerIndex = 0;
  state.acceptingInput = false;
  state.gameActive = false;
  state.playingBack = false;
  state.learning = false;
  state.learnTarget = null;
  state.startedAt = null;
  state.correctSteps = 0;
  pads.forEach((pad) => pad.classList.remove("learn-target", "learned"));
  learnButton.textContent = "Learn Pads";
  syncLearningDisplay();
  updateStartButton();
  updateRound();
}

function addRound() {
  state.sequence.push(Math.floor(Math.random() * 4));
  state.playerIndex = 0;
  state.acceptingInput = false;
  updateRound();
  playSequence(state.runId);
}

async function playSequence(runId) {
  state.playingBack = true;
  learnButton.disabled = true;

  await wait(playback.introDelay);
  for (const pad of state.sequence) {
    if (runId !== state.runId) {
      return;
    }

    flashPad(pad, 96, playback.litMs);
    playMechanicalSound(pad);
    await wait(playback.litMs);
  }

  if (runId !== state.runId) {
    return;
  }

  state.playingBack = false;
  state.acceptingInput = true;
  learnButton.disabled = false;
}

async function runStartCountdown(runId) {
  const beats = ["3", "2", "1", "GO"];
  const countdownOverlay = createCountdownOverlay();

  for (const beat of beats) {
    if (runId !== state.runId) {
      countdownOverlay.remove();
      return;
    }

    countdownOverlay.querySelector(".countdown-beat").textContent = beat;
    await wait(beat === "GO" ? 650 : 850);
  }

  countdownOverlay.remove();
}

function handlePad(padIndex, velocity = 96) {
  if (state.playingBack) {
    return;
  }

  flashPad(padIndex, velocity);
  playMechanicalSound(padIndex, velocity);

  if (!state.acceptingInput) {
    return;
  }

  const expected = state.sequence[state.playerIndex];
  if (padIndex !== expected) {
    missPad(padIndex);
    endGame();
    return;
  }

  state.correctSteps += 1;
  state.playerIndex += 1;
  if (state.playerIndex === state.sequence.length) {
    state.acceptingInput = false;
    if (isSequenceGoalReached()) {
      completeRitual();
      return;
    }

    state.nextRoundTimer = setTimeout(addRound, 680);
  }
}

function endGame(achieved = false) {
  state.acceptingInput = false;
  state.gameActive = false;
  updateStartButton();
  const score = Math.max(0, state.sequence.length - 1);
  const elapsedMs = state.startedAt ? Date.now() - state.startedAt : 0;
  saveAchievement(state.correctSteps, elapsedMs, achieved);
  const isNewBest = score > state.best;
  if (isNewBest) {
    state.best = score;
    localStorage.setItem(storageKeys.best, String(score));
    if (bestEl) {
      bestEl.textContent = score;
    }
  }

  showResult(state.correctSteps, elapsedMs, achieved);
}

function completeRitual() {
  cancelPendingRound();
  endGame(true);
}

function updateRound() {
  if (roundEl) {
    roundEl.textContent = state.sequence.length;
  }
}

function renderMappings() {
  state.padNotes.forEach((note, index) => {
    document.querySelector(`#note-${index}`).textContent = Number.isInteger(note) ? `MIDI ${note}` : "unmapped";
  });
}

function showResult(steps, elapsedMs, achieved) {
  stopSigilMessage();
  resultTitleEl.textContent = achieved ? "Ritual Achieved" : "Ritual Incomplete";
  resultStepsEl.textContent = steps;
  resultTimeEl.textContent = formatElapsed(elapsedMs);
  resultDetailEl.textContent = achieved
    ? "The sigil sequence reached its chosen goal."
    : "";
  resultStartButton.textContent = achieved ? "Start Again" : "Try Again";
  resultActionsEl.classList.toggle("is-single", !achieved);
  resultAchievementsButton.hidden = !achieved;
  resultCloseButton.hidden = !achieved;
  sigilMessagePanel.hidden = !achieved;
  resultOverlay.hidden = false;
}

function hideResult() {
  stopSigilMessage();
  resultOverlay.hidden = true;
}

function playSigilMessage(sigil) {
  const sources = sigilMessages[sigil];
  if (!sources) {
    return;
  }

  stopSigilMessage();
  const src = sources[Math.floor(Math.random() * sources.length)];
  const audio = new Audio(src);
  state.activeSigilMessage = audio;
  audio.addEventListener("ended", () => {
    if (state.activeSigilMessage === audio) {
      state.activeSigilMessage = null;
    }
  });
  audio.play().catch(() => {
    if (state.activeSigilMessage === audio) {
      state.activeSigilMessage = null;
    }
  });
}

function stopSigilMessage() {
  if (!state.activeSigilMessage) {
    return;
  }

  state.activeSigilMessage.pause();
  state.activeSigilMessage.currentTime = 0;
  state.activeSigilMessage = null;
}

function showAchievementsPage() {
  renderAchievements();
  achievementsPage.hidden = false;
  exitKioskMode();
}

function hideAchievementsPage() {
  achievementsPage.hidden = true;
}

function showAdvancedPage() {
  advancedPage.hidden = false;
  exitKioskMode();
}

function hideAdvancedPage() {
  advancedPage.hidden = true;
  enterKioskMode();
}

function saveAchievement(steps, elapsedMs, achieved) {
  const achievements = loadAchievements();
  achievements.push({
    achieved,
    elapsedMs,
    finishedAt: new Date().toISOString(),
    goal: state.sequenceGoal,
    steps,
  });

  localStorage.setItem(
    storageKeys.achievements,
    JSON.stringify(sortAchievements(achievements).slice(0, 5)),
  );
}

function isSequenceGoalReached() {
  return state.sequenceGoal !== "unlimited" && state.sequence.length >= state.sequenceGoal;
}

function updateSequenceGoal() {
  state.sequenceGoal = normalizeSequenceGoal(sequenceGoalSelect.value);
  localStorage.setItem(storageKeys.sequenceGoal, String(state.sequenceGoal));
}

function renderSequenceGoal() {
  sequenceGoalSelect.value = String(state.sequenceGoal);
}

function loadSequenceGoal() {
  return normalizeSequenceGoal(localStorage.getItem(storageKeys.sequenceGoal) || "unlimited");
}

function normalizeSequenceGoal(value) {
  if (value === "unlimited") {
    return "unlimited";
  }

  const numericValue = Number(value);
  if (Number.isInteger(numericValue) && numericValue >= 5 && numericValue <= 20) {
    return numericValue;
  }

  return "unlimited";
}

function renderAchievements() {
  const achievements = sortAchievements(loadAchievements()).slice(0, 5);
  achievementList.replaceChildren();
  achievementEmpty.hidden = achievements.length > 0;

  achievements.forEach((achievement, index) => {
    const item = document.createElement("li");

    const rank = document.createElement("span");
    rank.className = "achievement-rank";
    rank.textContent = `#${index + 1}`;

    const time = document.createElement("strong");
    time.className = "achievement-time";
    time.textContent = formatElapsed(achievement.elapsedMs);

    const steps = document.createElement("span");
    steps.className = "achievement-steps";
    steps.textContent = `${achievement.steps} steps`;

    item.append(rank, time, steps);
    achievementList.append(item);
  });
}

function loadAchievements() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKeys.achievements) || "[]");
    if (Array.isArray(parsed)) {
      return parsed.filter((achievement) => {
        return Number.isFinite(achievement.elapsedMs)
          && Number.isInteger(achievement.steps);
      });
    }
  } catch {
    localStorage.removeItem(storageKeys.achievements);
  }

  return [];
}

function sortAchievements(achievements) {
  return [...achievements].sort((a, b) => {
    return b.elapsedMs - a.elapsedMs || b.steps - a.steps;
  });
}

function syncLearningDisplay() {
  boardEl.classList.toggle("is-learning", state.learning);
}

function updateStartButton() {
  startButton.textContent = state.gameActive ? "Restart" : "Start";
}

function requestMainKioskOnce() {
  if (advancedPage.hidden && resultOverlay.hidden) {
    enterKioskMode();
  }
}

async function enterKioskMode() {
  const requestFullscreen = document.documentElement.requestFullscreen
    || document.documentElement.webkitRequestFullscreen
    || document.documentElement.msRequestFullscreen;

  if (getFullscreenElement() || !requestFullscreen) {
    return;
  }

  try {
    await requestFullscreen.call(document.documentElement);
  } catch {
    // Fullscreen is browser-gated and may require a direct user gesture.
  }
}

async function exitKioskMode() {
  const exitFullscreen = document.exitFullscreen
    || document.webkitExitFullscreen
    || document.msExitFullscreen;

  if (!getFullscreenElement() || !exitFullscreen) {
    return;
  }

  try {
    await exitFullscreen.call(document);
  } catch {
    // Ignore transient fullscreen state changes.
  }
}

function getFullscreenElement() {
  return document.fullscreenElement
    || document.webkitFullscreenElement
    || document.msFullscreenElement;
}

function handleAdvancedHotspot() {
  if (!advancedPage.hidden || !resultOverlay.hidden || !achievementsPage.hidden) {
    return;
  }

  advancedAccess.taps += 1;
  clearTimeout(advancedAccess.resetTimer);

  if (advancedAccess.taps >= advancedAccess.requiredTaps) {
    advancedAccess.taps = 0;
    showAdvancedPage();
    return;
  }

  advancedAccess.resetTimer = setTimeout(() => {
    advancedAccess.taps = 0;
  }, 1600);
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function createCountdownOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "countdown-overlay";

  const message = document.createElement("span");
  message.className = "countdown-message";
  message.textContent = "Match the Sigil Sequence";

  const beat = document.createElement("strong");
  beat.className = "countdown-beat";

  overlay.append(message, beat);
  document.body.append(overlay);
  return overlay;
}

function loadPadNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKeys.notes) || "null");
    if (isValidPadNotes(parsed)) {
      return { notes: parsed, saved: true };
    }
  } catch {
    localStorage.removeItem(storageKeys.notes);
  }

  return { notes: [...defaultPadNotes], saved: false };
}

function savePadNotes() {
  if (isValidPadNotes(state.padNotes)) {
    localStorage.setItem(storageKeys.notes, JSON.stringify(state.padNotes));
    state.hasSavedMapping = true;
  }
}

function isValidPadNotes(notes) {
  return Array.isArray(notes)
    && notes.length === 4
    && notes.every((note) => Number.isInteger(note) && note >= 0 && note <= 127)
    && new Set(notes).size === 4;
}

function flashPad(index, velocity = 96, duration = 1000) {
  const pad = pads[index];
  pad.style.setProperty("--hit", velocity / 127);
  pad.classList.add("active");
  window.setTimeout(() => pad.classList.remove("active"), duration);
}

function missPad(index) {
  pads[index].classList.add("miss");
  window.setTimeout(() => pads[index].classList.remove("miss"), 280);
}

function playMechanicalSound(index, velocity = 96) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    return;
  }

  const context = playMechanicalSound.context || new AudioContext();
  playMechanicalSound.context = context;

  const voices = [
    { base: 196, overtones: [2.01, 3.98], pan: -0.42 },
    { base: 247, overtones: [2.51, 5.02], pan: 0.42 },
    { base: 165, overtones: [2.75, 4.49], pan: -0.18 },
    { base: 294, overtones: [1.5, 3.01], pan: 0.18 },
  ];
  const voice = voices[index];
  const now = context.currentTime;
  const level = 0.03 + (velocity / 127) * 0.12;
  const master = context.createGain();
  const filter = context.createBiquadFilter();
  const panner = context.createStereoPanner ? context.createStereoPanner() : null;

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(voice.base * 4, now);
  filter.Q.setValueAtTime(9, now);
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(level, now + 0.014);
  master.gain.exponentialRampToValueAtTime(level * 0.42, now + 0.16);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1);

  const output = panner || context.destination;
  if (panner) {
    panner.pan.setValueAtTime(voice.pan, now);
    panner.connect(context.destination);
  }
  master.connect(filter).connect(output);

  [1, ...voice.overtones].forEach((ratio, overtoneIndex) => {
    const oscillator = context.createOscillator();
    const overtoneGain = context.createGain();
    oscillator.type = overtoneIndex === 0 ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(voice.base * ratio, now);
    oscillator.frequency.exponentialRampToValueAtTime(voice.base * ratio * 0.985, now + 1);
    overtoneGain.gain.setValueAtTime(overtoneIndex === 0 ? 1 : 0.34 / overtoneIndex, now);
    oscillator.connect(overtoneGain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + 1.04);
  });

  const bufferSize = Math.floor(context.sampleRate * 0.04);
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noise = context.createBufferSource();
  const noiseGain = context.createGain();
  noise.buffer = buffer;
  noiseGain.gain.setValueAtTime(level * 0.38, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
  noise.connect(noiseGain).connect(master);
  noise.start(now);
  noise.stop(now + 0.06);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function cancelPendingRound() {
  if (state.nextRoundTimer) {
    clearTimeout(state.nextRoundTimer);
    state.nextRoundTimer = null;
  }

  startButton.disabled = false;
  learnButton.disabled = false;
}
