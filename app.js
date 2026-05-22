const pads = Array.from(document.querySelectorAll(".pad"));
const roundEl = document.querySelector("#round");
const bestEl = document.querySelector("#best");
const subtitleEl = document.querySelector("#subtitle");
const connectButton = document.querySelector("#connect");
const learnButton = document.querySelector("#learn");
const startButton = document.querySelector("#start");
const hallOfFameChallengeButton = document.querySelector("#hall-of-fame-challenge");
const showHallOfFameButton = document.querySelector("#show-hall-of-fame");
const advancedHotspot = document.querySelector("#advanced-hotspot");
const resetButton = document.querySelector("#reset");
const boardEl = document.querySelector(".board");
const inputSelect = document.querySelector("#midi-input");
const sequenceGoalSelect = document.querySelector("#sequence-goal");
const sequenceTimingInput = document.querySelector("#sequence-timing");
const sequenceTimingValue = document.querySelector("#sequence-timing-value");
const startCountdownSelect = document.querySelector("#start-countdown");
const midiStateEl = document.querySelector("#midi-state");
const resultOverlay = document.querySelector("#result-overlay");
const resultTitleEl = document.querySelector("#result-title");
const resultStepsEl = document.querySelector("#result-steps");
const resultTimeEl = document.querySelector("#result-time");
const resultDetailEl = document.querySelector("#result-detail");
const fireworkColors = ["#f7d35a", "#f25f4c", "#4dd76a", "#55a8ff", "#f7f4ea"];
const resultActionsEl = document.querySelector(".result-dialog .result-actions");
const resultStartButton = document.querySelector("#result-start");
const resultCloseButton = document.querySelector("#result-close");
const resultAchievementsButton = document.querySelector("#result-achievements");
const sigilMessagePanel = document.querySelector("#sigil-message-panel");
const sigilMessageButtons = Array.from(document.querySelectorAll(".sigil-message-button"));
const advancedPage = document.querySelector("#advanced-page");
const advancedReturnButton = document.querySelector("#advanced-return");
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
};

const responseTimeoutMs = 6000;
const ritualGoalSteps = 8;

const advancedAccess = {
  taps: 0,
  requiredTaps: 4,
  resetTimer: null,
};

const storageKeys = {
  achievements: "sigil-sequence-achievements-v3",
  best: "bop-pad-simon-best",
  inputId: "bop-pad-simon-input-id",
  inputName: "bop-pad-simon-input-name",
  notes: "bop-pad-simon-notes",
  sequenceGoal: "sigil-sequence-goal",
  sequenceTiming: "sigil-sequence-timing",
  startCountdown: "sigil-sequence-start-countdown",
};

localStorage.removeItem("sigil-sequence-achievements");
localStorage.removeItem("sigil-sequence-achievements-v2");

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
  responseTimeoutTimer: null,
  startedAt: null,
  correctSteps: 0,
  best: Number(localStorage.getItem(storageKeys.best) || 0),
  padNotes: loadedPadNotes.notes,
  hasSavedMapping: loadedPadNotes.saved,
  sequenceGoal: loadSequenceGoal(),
  activeSequenceGoal: ritualGoalSteps,
  sequenceTiming: loadSequenceTiming(),
  startCountdown: loadStartCountdown(),
  recordHallOfFame: false,
  lastStartMode: "ritual",
  lastRunAchieved: false,
  activeSigilMessage: null,
};

if (bestEl) {
  bestEl.textContent = state.best;
}
renderMappings();
renderSequenceGoal();
renderSequenceTiming();
renderStartCountdown();
syncLearningDisplay();
autoConnectMidi();
requestMainKioskOnStartup();

connectButton.addEventListener("click", connectMidi);
learnButton.addEventListener("click", startLearning);
startButton.addEventListener("click", () => startGame("ritual"));
hallOfFameChallengeButton.addEventListener("click", () => startGame("challenge"));
showHallOfFameButton.addEventListener("click", showAchievementsPage);
if (resetButton) {
  resetButton.addEventListener("click", resetGame);
}
inputSelect.addEventListener("change", selectMidiInput);
sequenceGoalSelect.addEventListener("change", updateSequenceGoal);
sequenceTimingInput.addEventListener("input", updateSequenceTiming);
startCountdownSelect.addEventListener("change", updateStartCountdownSetting);
resultStartButton.addEventListener("click", handleResultStart);
resultCloseButton.addEventListener("click", hideResult);
resultAchievementsButton.addEventListener("click", showAchievementsPage);
sigilMessageButtons.forEach((button) => {
  button.addEventListener("click", () => playSigilMessage(button.dataset.sigil));
});
advancedReturnButton.addEventListener("click", hideAdvancedPage);
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

async function startGame(mode = "ritual") {
  const isChallenge = mode === "challenge";
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
  state.recordHallOfFame = isChallenge;
  state.lastStartMode = mode;
  state.activeSequenceGoal = isChallenge ? "unlimited" : ritualGoalSteps;
  state.startedAt = Date.now();
  state.correctSteps = 0;
  updateStartButton();
  const runId = state.runId;
  await runStartCountdown(runId, mode);
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
  state.recordHallOfFame = false;
  state.activeSequenceGoal = ritualGoalSteps;
  state.startedAt = null;
  state.correctSteps = 0;
  pads.forEach((pad) => pad.classList.remove("learn-target", "learned"));
  learnButton.textContent = "Learn Pads";
  syncLearningDisplay();
  updateStartButton();
  updateRound();
}

function addRound() {
  cancelResponseTimeout();
  state.sequence.push(Math.floor(Math.random() * 4));
  state.playerIndex = 0;
  state.acceptingInput = false;
  updateRound();
  playSequence(state.runId);
}

async function playSequence(runId) {
  cancelResponseTimeout();
  state.playingBack = true;
  learnButton.disabled = true;

  await wait(playback.introDelay);
  for (const pad of state.sequence) {
    if (runId !== state.runId) {
      return;
    }

    const stepDurationMs = getSequenceStepDurationMs();
    flashPad(pad, 96, stepDurationMs);
    playMechanicalSound(pad, 96);
    await wait(stepDurationMs);
  }

  if (runId !== state.runId) {
    return;
  }

  state.playingBack = false;
  state.acceptingInput = true;
  learnButton.disabled = false;
  startResponseTimeout(runId);
}

async function runStartCountdown(runId, mode) {
  const countdownOverlay = createCountdownOverlay(mode);
  await wait(3000);
  if (runId !== state.runId) {
    countdownOverlay.remove();
    return;
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
    cancelResponseTimeout();
    endGame();
    return;
  }

  cancelResponseTimeout();
  state.correctSteps += 1;
  state.playerIndex += 1;
  if (state.playerIndex === state.sequence.length) {
    state.acceptingInput = false;
    if (isSequenceGoalReached()) {
      completeRitual();
      return;
    }

    state.nextRoundTimer = setTimeout(addRound, 680);
    return;
  }

  startResponseTimeout(state.runId);
}

function endGame(achieved = false) {
  cancelResponseTimeout();
  state.acceptingInput = false;
  state.gameActive = false;
  updateStartButton();
  const score = getAchievedSequenceLength(achieved);
  const elapsedMs = state.startedAt ? Date.now() - state.startedAt : 0;
  let hallOfFameResult = null;
  if (state.recordHallOfFame) {
    hallOfFameResult = saveAchievement(score, elapsedMs, achieved);
  }
  const isNewBest = score > state.best;
  if (isNewBest) {
    state.best = score;
    localStorage.setItem(storageKeys.best, String(score));
    if (bestEl) {
      bestEl.textContent = score;
    }
  }

  showResult(score, elapsedMs, achieved, hallOfFameResult);
}

function getAchievedSequenceLength(achieved) {
  if (achieved) {
    return state.sequence.length;
  }

  if (state.playerIndex === state.sequence.length && state.sequence.length > 0) {
    return state.sequence.length;
  }

  return Math.max(0, state.sequence.length - 1);
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

function showResult(steps, elapsedMs, achieved, hallOfFameResult = null) {
  stopSigilMessage();
  clearFireworks();
  state.lastRunAchieved = achieved;
  resultTitleEl.textContent = getResultTitle(achieved, hallOfFameResult);
  resultStepsEl.textContent = steps;
  resultTimeEl.textContent = formatElapsed(elapsedMs);
  resultDetailEl.textContent = getResultDetail(achieved, hallOfFameResult);
  resultStartButton.textContent = achieved ? "Start Again" : "Return";
  resultActionsEl.classList.toggle("is-single", !achieved && !hallOfFameResult);
  resultActionsEl.classList.toggle("is-pair", Boolean(hallOfFameResult));
  resultAchievementsButton.hidden = !achieved && !hallOfFameResult;
  resultCloseButton.hidden = !achieved || Boolean(hallOfFameResult);
  sigilMessagePanel.hidden = !achieved;
  resultOverlay.hidden = false;
  if (hallOfFameResult?.qualified) {
    showFireworks();
  }
}

function getResultTitle(achieved, hallOfFameResult) {
  if (hallOfFameResult?.qualified) {
    return `Hall of Fame! #${hallOfFameResult.rank}`;
  }

  if (hallOfFameResult) {
    return "Challenge Complete";
  }

  return achieved ? "Ritual Achieved" : "Ritual Incomplete";
}

function getResultDetail(achieved, hallOfFameResult) {
  if (hallOfFameResult?.qualified) {
    return "Excellent sequence. Your name enters the record.";
  }

  if (hallOfFameResult) {
    return "Not enough for the Hall of Fame.";
  }

  return achieved ? "The sigil sequence reached its chosen goal." : "";
}

function hideResult() {
  stopSigilMessage();
  clearFireworks();
  resultOverlay.hidden = true;
}

function showFireworks() {
  const layer = document.createElement("div");
  layer.className = "fireworks-layer";
  layer.setAttribute("aria-hidden", "true");

  const positions = [
    [14, 22],
    [36, 12],
    [61, 18],
    [84, 25],
    [24, 48],
    [76, 50],
    [48, 34],
  ];

  positions.forEach(([x, y], index) => {
    const burst = document.createElement("span");
    burst.className = "firework";
    burst.style.setProperty("--x", `${x}vw`);
    burst.style.setProperty("--y", `${y}vh`);
    burst.style.setProperty("--delay", `${index * 180}ms`);
    burst.style.setProperty("--spark", fireworkColors[index % fireworkColors.length]);
    layer.append(burst);
  });

  resultOverlay.prepend(layer);
}

function clearFireworks() {
  resultOverlay.querySelectorAll(".fireworks-layer").forEach((layer) => layer.remove());
}

function handleResultStart() {
  if (state.lastRunAchieved) {
    startGame(state.lastStartMode);
    return;
  }

  hideResult();
  enterKioskMode();
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
  const record = {
    achieved,
    elapsedMs,
    finishedAt: new Date().toISOString(),
    goal: state.activeSequenceGoal,
    steps,
  };
  achievements.push(record);

  const sorted = sortAchievements(achievements);
  const saved = sorted.slice(0, 10);
  const rankIndex = saved.indexOf(record);

  localStorage.setItem(
    storageKeys.achievements,
    JSON.stringify(saved),
  );

  return {
    qualified: rankIndex !== -1,
    rank: rankIndex === -1 ? null : rankIndex + 1,
  };
}

function isSequenceGoalReached() {
  return state.activeSequenceGoal !== "unlimited" && state.sequence.length >= state.activeSequenceGoal;
}

function updateSequenceGoal() {
  state.sequenceGoal = normalizeSequenceGoal(sequenceGoalSelect.value);
  localStorage.setItem(storageKeys.sequenceGoal, String(state.sequenceGoal));
}

function renderSequenceGoal() {
  sequenceGoalSelect.value = String(state.sequenceGoal);
}

function updateSequenceTiming() {
  state.sequenceTiming = normalizeSequenceTiming(sequenceTimingInput.value);
  localStorage.setItem(storageKeys.sequenceTiming, String(state.sequenceTiming));
  renderSequenceTiming();
}

function renderSequenceTiming() {
  sequenceTimingInput.value = String(state.sequenceTiming);
  sequenceTimingValue.textContent = `${state.sequenceTiming.toFixed(2)}s`;
}

function updateStartCountdownSetting() {
  state.startCountdown = normalizeStartCountdown(startCountdownSelect.value);
  localStorage.setItem(storageKeys.startCountdown, String(state.startCountdown));
  renderStartCountdown();
}

function renderStartCountdown() {
  startCountdownSelect.value = String(state.startCountdown);
}

function loadSequenceGoal() {
  return normalizeSequenceGoal(localStorage.getItem(storageKeys.sequenceGoal) || "unlimited");
}

function loadSequenceTiming() {
  return normalizeSequenceTiming(localStorage.getItem(storageKeys.sequenceTiming) || "1");
}

function loadStartCountdown() {
  return normalizeStartCountdown(localStorage.getItem(storageKeys.startCountdown) || "3");
}

function normalizeSequenceGoal(value) {
  if (value === "unlimited") {
    return "unlimited";
  }

  const numericValue = Number(value);
  if (Number.isInteger(numericValue) && numericValue >= 2 && numericValue <= 20) {
    return numericValue;
  }

  return "unlimited";
}

function normalizeSequenceTiming(value) {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return Math.min(1, Math.max(0.25, Math.round(numericValue * 100) / 100));
  }

  return 1;
}

function normalizeStartCountdown(value) {
  const numericValue = Number(value);
  if (Number.isInteger(numericValue) && numericValue >= 0 && numericValue <= 6) {
    return numericValue;
  }

  return 3;
}

function getSequenceStepDurationMs() {
  return Math.round(state.sequenceTiming * 1000);
}

function renderAchievements() {
  const achievements = sortAchievements(loadAchievements()).slice(0, 10);
  achievementList.replaceChildren();
  achievementEmpty.hidden = achievements.length > 0;

  achievements.forEach((achievement, index) => {
    const item = document.createElement("li");

    const rank = document.createElement("span");
    rank.className = "achievement-rank";
    rank.textContent = `#${index + 1}`;

    const result = document.createElement("strong");
    result.className = "achievement-result";
    result.textContent = `${formatStepCount(achievement.steps)} in ${formatElapsedSeconds(achievement.elapsedMs)}`;

    item.append(rank, result);
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
    return b.steps - a.steps || a.elapsedMs - b.elapsedMs;
  });
}

function syncLearningDisplay() {
  boardEl.classList.toggle("is-learning", state.learning);
}

function updateStartButton() {
  startButton.textContent = state.gameActive && state.lastStartMode === "ritual"
    ? "Restart Ritual"
    : "Start Ritual to Access Recorded Messages";
  hallOfFameChallengeButton.textContent = state.gameActive && state.lastStartMode === "challenge"
    ? "Restart Hall of Fame Challenge"
    : "Start Hall of Fame Challenge";
}

function requestMainKioskOnStartup() {
  const request = () => {
    if (advancedPage.hidden && resultOverlay.hidden && achievementsPage.hidden) {
      enterKioskMode();
    }
  };

  if (document.readyState === "complete") {
    setTimeout(request, 100);
    return;
  }

  window.addEventListener("load", () => setTimeout(request, 100), { once: true });
}

function requestMainKioskOnce() {
  if (advancedPage.hidden && resultOverlay.hidden && achievementsPage.hidden) {
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

function formatElapsedSeconds(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

function formatStepCount(steps) {
  return `${steps} ${steps === 1 ? "step" : "steps"}`;
}

function createCountdownOverlay(mode) {
  const overlay = document.createElement("div");
  overlay.className = "countdown-overlay";
  const boardRect = boardEl.getBoundingClientRect();
  overlay.style.setProperty("--cue-center-y", `${boardRect.top + boardRect.height / 2}px`);

  const message = document.createElement("span");
  message.className = "countdown-message";
  const title = document.createElement("span");
  title.textContent = "Match the Sequence";
  message.append(title);

  if (mode === "ritual") {
    const detail = document.createElement("span");
    detail.className = "countdown-detail";
    detail.textContent = `${ritualGoalSteps} Steps will Complete the Ritual`;
    message.append(detail);
  }

  overlay.append(message);
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
  if (context.state === "suspended") {
    context.resume();
  }

  const voices = [
    { notes: [261.63, 329.63, 392], pan: -0.42 },
    { notes: [329.63, 415.3, 493.88], pan: 0.42 },
    { notes: [293.66, 370, 440], pan: -0.18 },
    { notes: [392, 493.88, 587.33], pan: 0.18 },
  ];
  const voice = voices[index];
  const now = context.currentTime;
  const durationSeconds = 0.25;
  const releaseTime = now + durationSeconds;
  const level = 0.16 + (velocity / 127) * 0.24;
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const filter = context.createBiquadFilter();
  const panner = context.createStereoPanner ? context.createStereoPanner() : null;

  compressor.threshold.setValueAtTime(-12, now);
  compressor.knee.setValueAtTime(18, now);
  compressor.ratio.setValueAtTime(3, now);
  compressor.attack.setValueAtTime(0.002, now);
  compressor.release.setValueAtTime(0.08, now);
  filter.type = "highpass";
  filter.frequency.setValueAtTime(240, now);
  filter.Q.setValueAtTime(0.7, now);
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(level, now + 0.01);
  master.gain.exponentialRampToValueAtTime(level * 0.62, now + 0.08);
  master.gain.exponentialRampToValueAtTime(0.0001, releaseTime);

  const output = panner || context.destination;
  if (panner) {
    panner.pan.setValueAtTime(voice.pan, now);
    panner.connect(context.destination);
  }
  master.connect(filter).connect(compressor).connect(output);

  voice.notes.forEach((frequency, noteIndex) => {
    const oscillator = context.createOscillator();
    const noteGain = context.createGain();
    const startOffset = noteIndex * 0.028;
    const noteStart = now + startOffset;
    const noteEnd = Math.min(releaseTime + 0.02, noteStart + 0.22);
    oscillator.type = noteIndex === 0 ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.006, noteEnd);
    noteGain.gain.setValueAtTime(0.0001, noteStart);
    noteGain.gain.exponentialRampToValueAtTime(noteIndex === 0 ? 1 : 0.62, noteStart + 0.012);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(noteGain).connect(master);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
  });

  const sparkle = context.createOscillator();
  const sparkleGain = context.createGain();
  sparkle.type = "sine";
  sparkle.frequency.setValueAtTime(voice.notes[2] * 2, now + 0.04);
  sparkleGain.gain.setValueAtTime(0.0001, now + 0.04);
  sparkleGain.gain.exponentialRampToValueAtTime(level * 0.58, now + 0.06);
  sparkleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
  sparkle.connect(sparkleGain).connect(compressor);
  sparkle.start(now + 0.04);
  sparkle.stop(now + 0.21);

  for (let tick = 0; tick < 2; tick += 1) {
    const click = context.createOscillator();
    const clickGain = context.createGain();
    const clickTime = now + tick * 0.085;
    click.type = "triangle";
    click.frequency.setValueAtTime(voice.notes[1] * (1.5 + tick * 0.25), clickTime);
    clickGain.gain.setValueAtTime(level * 0.22, clickTime);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, clickTime + 0.025);
    click.connect(clickGain).connect(compressor);
    click.start(clickTime);
    click.stop(clickTime + 0.035);
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function cancelPendingRound() {
  if (state.nextRoundTimer) {
    clearTimeout(state.nextRoundTimer);
    state.nextRoundTimer = null;
  }

  cancelResponseTimeout();
  startButton.disabled = false;
  learnButton.disabled = false;
}

function startResponseTimeout(runId) {
  cancelResponseTimeout();
  state.responseTimeoutTimer = window.setTimeout(() => {
    state.responseTimeoutTimer = null;
    if (runId !== state.runId || !state.gameActive || !state.acceptingInput) {
      return;
    }

    state.acceptingInput = false;
    endGame();
  }, responseTimeoutMs);
}

function cancelResponseTimeout() {
  if (!state.responseTimeoutTimer) {
    return;
  }

  clearTimeout(state.responseTimeoutTimer);
  state.responseTimeoutTimer = null;
}
