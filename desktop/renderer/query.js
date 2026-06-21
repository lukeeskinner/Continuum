const input = document.getElementById("q");
const micBtn = document.getElementById("mic");
const ttsBtn = document.getElementById("tts");
const hint = document.getElementById("hint");
const answer = document.getElementById("answer");
const citeLabel = document.getElementById("cite-label");
const citations = document.getElementById("citations");

let ttsEnabled = true;
let currentAudio = null;
let mediaRecorder = null;
let chunks = [];
let recording = false;

function clearResult() {
  hint.textContent = "";
  answer.replaceChildren();
  citeLabel.textContent = "";
  citations.replaceChildren();
}

// Render the synthesized answer, highlighting inline [Name@HH:MM] citations.
// Built with text nodes / <mark> so model output is never injected as HTML.
function renderAnswer(text) {
  answer.replaceChildren();
  for (const part of String(text || "").split(/(\[[^\]]+\])/g)) {
    if (!part) continue;
    if (/^\[[^\]]+\]$/.test(part)) {
      const mark = document.createElement("mark");
      mark.className = "cite";
      mark.textContent = part;
      answer.appendChild(mark);
    } else {
      answer.appendChild(document.createTextNode(part));
    }
  }
}

function render({ response, citations: cites }) {
  hint.textContent = "";
  renderAnswer(response);
  citations.replaceChildren();

  const list = Array.isArray(cites) ? cites : [];
  citeLabel.textContent = list.length ? "Sources" : "";
  for (const c of list) {
    const li = document.createElement("li");
    li.className = "cite";

    const app = document.createElement("span");
    app.className = "cite__app";
    app.textContent = c.app || "—";

    const topic = document.createElement("span");
    topic.className = "cite__topic";
    topic.textContent = c.topic || "";

    li.append(app, topic);

    if (c.teammate) {
      const who = document.createElement("span");
      who.className = "cite__who";
      who.textContent = c.teammate;
      li.appendChild(who);
    }
    citations.appendChild(li);
  }

  if (response) speakAnswer(response);
}

// ── Text query ───────────────────────────────────────────────────────────────
function ask(text) {
  const q = (text ?? input.value).trim();
  if (!q) return;
  stopAudio();
  clearResult();
  hint.textContent = "Asking the mesh…";
  window.continuum.query(q);
}

// ── Voice in (push-to-talk → Deepgram STT → ask) ─────────────────────────────
async function startRecording() {
  const mic = await window.continuum.ensureMic();
  if (mic && mic.ok === false) {
    hint.textContent = "Microphone permission needed.";
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    hint.textContent = "Microphone unavailable.";
    return;
  }

  chunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    const mime = mediaRecorder.mimeType || "audio/webm";
    const blob = new Blob(chunks, { type: mime });
    hint.textContent = "Transcribing…";
    const buf = await blob.arrayBuffer();
    const res = await window.continuum.transcribe(buf, mime);
    if (!res || !res.ok || !res.transcript) {
      hint.textContent = res && res.error ? "Couldn't transcribe — try again." : "Didn't catch that.";
      return;
    }
    input.value = res.transcript;
    ask(res.transcript);
  };

  mediaRecorder.start();
  recording = true;
  micBtn.classList.add("recording");
  hint.textContent = "Listening… click mic to stop";
}

function stopRecording() {
  if (mediaRecorder && recording) mediaRecorder.stop();
  recording = false;
  micBtn.classList.remove("recording");
}

function toggleRecording() {
  if (recording) stopRecording();
  else startRecording();
}

// ── Voice out (Deepgram aura TTS) ────────────────────────────────────────────
function stopAudio() {
  if (!currentAudio) return;
  try {
    currentAudio.pause();
  } catch {
    // ignore
  }
  currentAudio = null;
}

async function speakAnswer(text) {
  if (!ttsEnabled || !text) return;
  try {
    const res = await window.continuum.speak(text);
    if (!res || !res.ok || !res.audio) return;
    stopAudio();
    currentAudio = new Audio(`data:${res.mime || "audio/mpeg"};base64,${res.audio}`);
    currentAudio.play().catch(() => {});
  } catch {
    // best-effort; the answer is already on screen
  }
}

// ── Wiring ───────────────────────────────────────────────────────────────────
micBtn.addEventListener("click", toggleRecording);

ttsBtn.addEventListener("click", () => {
  ttsEnabled = !ttsEnabled;
  ttsBtn.setAttribute("aria-pressed", String(ttsEnabled));
  ttsBtn.textContent = ttsEnabled ? "🔊" : "🔇";
  if (!ttsEnabled) stopAudio();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    stopRecording();
    stopAudio();
    window.continuum.hideQuery();
  } else if (e.key === "Enter") {
    ask();
  }
});

window.continuum.onQueryResponse(render);

// Refocus + reset whenever the bar is summoned.
window.continuum.onQueryShow(() => {
  stopAudio();
  input.focus();
  input.select();
});

window.addEventListener("DOMContentLoaded", () => input.focus());
