const pads = Array.from(document.querySelectorAll(".pad"));
const roundEl = document.querySelector("#round");
const bestEl = document.querySelector("#best");
const messageEl = document.querySelector("#message");
const subtitleEl = document.querySelector("#subtitle");
const connectButton = document.querySelector("#connect");
const learnButton = document.querySelector("#learn");
const startButton = document.querySelector("#start");
const resetButton = document.querySelector("#reset");
const boardEl = document.querySelector(".board");
const inputSelect = document.querySelector("#midi-input");
const midiStateEl = document.querySelector("#midi-state");
const resultOverlay = document.querySelector("#result-overlay");
const resultTitleEl = document.querySelector("#result-title");
const resultStepsEl = document.querySelector("#result-steps");
const resultTimeEl = document.querySelector("#result-time");
const resultDetailEl = document.querySelector("#result-detail");
const resultStartButton = document.querySelector("#result-start");
const resultCloseButton = document.querySelector("#result-close");
const advancedPage = document.querySelector("#advanced-page");
const advancedReturnButton = document.querySelector("#advanced-return");

const colors = ["green", "red", "yellow", "blue"];
const keyMap = new Map([
  ["q", 0],
  ["w", 1],
  ["a", 2],
  ["s", 3],
]);

const playback = {
  introDelay: 700,
  litMs: 420,
  gapMs: 260,
  minGapMs: 190,
  speedupPerRoundMs: 4,
};

const advancedGesture = {
  cornerSize: 92,
  minDistanceRatio: 0.72,
  startCorner: null,
};

const storageKeys = {
  best: "bop-pad-simon-best",
  inputId: "bop-pad-simon-input-id",
  inputName: "bop-pad-simon-input-name",
  notes: "bop-pad-simon-notes",
};

const defaultPadNotes = [null, null, null, null];
const loadedPadNotes = loadPadNotes();

const state = {
  access: null,
  currentInput: null,
  sequence: [],
  playerIndex: 0,
  acceptingInput: false,
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
};

if (bestEl) {
  bestEl.textContent = state.best;
}
renderMappings();
setStartupMessage();
syncLearningDisplay();
autoConnectMidi();

connectButton.addEventListener("click", connectMidi);
learnButton.addEventListener("click", startLearning);
startButton.addEventListener("click", startGame);
resetButton.addEventListener("click", resetGame);
inputSelect.addEventListener("change", selectMidiInput);
resultStartButton.addEventListener("click", startGame);
resultCloseButton.addEventListener("click", hideResult);
advancedReturnButton.addEventListener("click", hideAdvancedPage);
window.addEventListener("pointerdown", beginAdvancedGesture);
window.addEventListener("pointerup", finishAdvancedGesture);
window.addEventListener("pointercancel", cancelAdvancedGesture);

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

function setMessage(message, subtitle) {
  messageEl.textContent = message;
  if (subtitle) {
    subtitleEl.textContent = subtitle;
  }
}

async function connectMidi() {
  if (!navigator.requestMIDIAccess) {
    setMessage("No Web MIDI", "Use Chrome or Edge with the Bop Pad connected over USB MIDI.");
    midiStateEl.textContent = "Web MIDI is unavailable in this browser";
    return;
  }

  try {
    state.access = await navigator.requestMIDIAccess({ sysex: false });
    state.access.addEventListener("statechange", refreshInputs);
    refreshInputs();
    setMessage(
      "MIDI ready",
      state.hasSavedMapping
        ? "Saved Bop Pad mapping loaded. Press Start."
        : "Choose the Bop Pad input, learn pads if needed, then start.",
    );
  } catch (error) {
    setMessage("MIDI blocked", "Allow MIDI permission in the browser and try again.");
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
  state.playingBack = false;
  state.sequence = [];
  updateRound();
  boardEl.classList.add("is-learning");
  pads.forEach((pad) => pad.classList.remove("learn-target"));
  learnButton.textContent = "Done";
  syncLearningDisplay();
  setMessage("Pick a pad", "Tap an on-screen color, then strike the matching Bop Pad pad.");
}

function selectLearnTarget(index) {
  state.learnTarget = index;
  pads.forEach((pad) => pad.classList.toggle("learn-target", Number(pad.dataset.pad) === index));
  flashPad(index);
  setMessage(`Map ${colors[index]}`, "Now strike the matching physical Bop Pad pad.");
}

function learnNote(note, velocity = 96) {
  if (state.learnTarget === null) {
    setMessage("Pick a pad", "Tap an on-screen color first, then strike the matching Bop Pad pad.");
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
    const remaining = 4 - state.padNotes.filter(Number.isInteger).length;
    setMessage("Pad saved", `${remaining} more to map. Pick another on-screen pad.`);
    return;
  }

  if (state.learnedPads.size === 4) {
    finishLearning();
    return;
  }

  setMessage("Pad saved", "Pick another on-screen pad, or press Done.");
}

function finishLearning() {
  state.learning = false;
  state.learnTarget = null;
  pads.forEach((pad) => pad.classList.remove("learn-target", "learned"));
  learnButton.textContent = "Learn Pads";
  syncLearningDisplay();
  if (isValidPadNotes(state.padNotes)) {
    savePadNotes();
    setMessage("Pads saved", "This mapping will load automatically after future reloads.");
  } else {
    setMessage("Mapping incomplete", "Pick Learn Pads to finish mapping all four pads.");
  }
}

function startGame() {
  hideResult();
  hideAdvancedPage();
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
  state.playingBack = false;
  state.startedAt = Date.now();
  state.correctSteps = 0;
  addRound();
}

function resetGame() {
  hideResult();
  hideAdvancedPage();
  cancelPendingRound();
  state.runId += 1;
  state.sequence = [];
  state.playerIndex = 0;
  state.acceptingInput = false;
  state.playingBack = false;
  state.learning = false;
  state.learnTarget = null;
  state.startedAt = null;
  state.correctSteps = 0;
  pads.forEach((pad) => pad.classList.remove("learn-target", "learned"));
  learnButton.textContent = "Learn Pads";
  syncLearningDisplay();
  updateRound();
  setStartupMessage();
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
  setMessage("Watch");
  startButton.disabled = true;
  learnButton.disabled = true;

  await wait(playback.introDelay);
  for (const pad of state.sequence) {
    if (runId !== state.runId) {
      return;
    }

    flashPad(pad, 96, playback.litMs);
    playTone(pad);
    const gap = Math.max(
      playback.minGapMs,
      playback.gapMs - state.sequence.length * playback.speedupPerRoundMs,
    );
    await wait(playback.litMs + gap);
  }

  if (runId !== state.runId) {
    return;
  }

  state.playingBack = false;
  state.acceptingInput = true;
  startButton.disabled = false;
  learnButton.disabled = false;
  setMessage("Your turn");
}

function handlePad(padIndex, velocity = 96) {
  if (state.playingBack) {
    return;
  }

  flashPad(padIndex, velocity);
  playTone(padIndex, velocity);

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
    setMessage("Nice");
    state.nextRoundTimer = setTimeout(addRound, 680);
  }
}

function endGame() {
  state.acceptingInput = false;
  const score = Math.max(0, state.sequence.length - 1);
  const elapsedMs = state.startedAt ? Date.now() - state.startedAt : 0;
  const isNewBest = score > state.best;
  if (isNewBest) {
    state.best = score;
    localStorage.setItem(storageKeys.best, String(score));
    if (bestEl) {
      bestEl.textContent = score;
    }
    setMessage("New best", "Press Start to play again.");
  } else {
    setMessage("Missed", "Press Start to try again.");
  }

  showResult(state.correctSteps, elapsedMs, isNewBest);
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

function showResult(steps, elapsedMs, isNewBest) {
  resultTitleEl.textContent = isNewBest ? "New Best" : "Missed";
  resultStepsEl.textContent = steps;
  resultTimeEl.textContent = formatElapsed(elapsedMs);
  resultDetailEl.textContent = `Reset stops the current run only. Saved pad mappings and best score stay put.`;
  resultOverlay.hidden = false;
}

function hideResult() {
  resultOverlay.hidden = true;
}

function showAdvancedPage() {
  advancedPage.hidden = false;
}

function hideAdvancedPage() {
  advancedPage.hidden = true;
}

function syncLearningDisplay() {
  boardEl.classList.toggle("is-learning", state.learning);
}

function beginAdvancedGesture(event) {
  if (!advancedPage.hidden || !resultOverlay.hidden) {
    return;
  }

  advancedGesture.startCorner = getCorner(event.clientX, event.clientY);
}

function finishAdvancedGesture(event) {
  if (!advancedGesture.startCorner) {
    return;
  }

  const startCorner = advancedGesture.startCorner;
  advancedGesture.startCorner = null;
  const endCorner = getCorner(event.clientX, event.clientY);
  const diagonalDistance = Math.hypot(window.innerWidth, window.innerHeight);
  const traveled = Math.hypot(event.clientX - startCorner.x, event.clientY - startCorner.y);

  if (endCorner && isOppositeCorner(startCorner, endCorner) && traveled >= diagonalDistance * advancedGesture.minDistanceRatio) {
    showAdvancedPage();
  }
}

function cancelAdvancedGesture() {
  advancedGesture.startCorner = null;
}

function getCorner(x, y) {
  const nearLeft = x <= advancedGesture.cornerSize;
  const nearRight = x >= window.innerWidth - advancedGesture.cornerSize;
  const nearTop = y <= advancedGesture.cornerSize;
  const nearBottom = y >= window.innerHeight - advancedGesture.cornerSize;

  if (nearLeft && nearTop) {
    return { name: "top-left", x: 0, y: 0 };
  }

  if (nearRight && nearTop) {
    return { name: "top-right", x: window.innerWidth, y: 0 };
  }

  if (nearLeft && nearBottom) {
    return { name: "bottom-left", x: 0, y: window.innerHeight };
  }

  if (nearRight && nearBottom) {
    return { name: "bottom-right", x: window.innerWidth, y: window.innerHeight };
  }

  return null;
}

function isOppositeCorner(startCorner, endCorner) {
  return (startCorner.name === "top-left" && endCorner.name === "bottom-right")
    || (startCorner.name === "bottom-right" && endCorner.name === "top-left")
    || (startCorner.name === "top-right" && endCorner.name === "bottom-left")
    || (startCorner.name === "bottom-left" && endCorner.name === "top-right");
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function setStartupMessage() {
  setMessage(
    state.hasSavedMapping ? "Map loaded" : "Ready",
    state.hasSavedMapping
      ? "Saved Bop Pad mapping loaded. Connect MIDI and press Start."
      : "Connect MIDI, learn pads if needed, then start.",
  );
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

function flashPad(index, velocity = 96, duration = 220) {
  const pad = pads[index];
  pad.style.setProperty("--hit", velocity / 127);
  pad.classList.add("active");
  window.setTimeout(() => pad.classList.remove("active"), duration);
}

function missPad(index) {
  pads[index].classList.add("miss");
  window.setTimeout(() => pads[index].classList.remove("miss"), 280);
}

function playTone(index, velocity = 96) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    return;
  }

  const context = playTone.context || new AudioContext();
  playTone.context = context;

  const frequencies = [329.63, 392, 261.63, 523.25];
  const gain = context.createGain();
  const oscillator = context.createOscillator();
  const now = context.currentTime;
  const level = 0.035 + (velocity / 127) * 0.11;

  oscillator.type = "triangle";
  oscillator.frequency.value = frequencies[index];
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(level, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.19);
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
