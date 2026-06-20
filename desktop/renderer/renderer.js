const BADGE = {
  SHARED_ANON: { label: "SHARED", cls: "badge--shared",  accent: "var(--shared)"  },
  LOCAL_ONLY:  { label: "LOCAL",  cls: "badge--local",   accent: "var(--local)"   },
  BLOCKED:     { label: "BLOCKED",cls: "badge--blocked", accent: "var(--blocked)" },
};

const dot        = document.getElementById("status-dot");
const syncCount  = document.getElementById("sync-count");
const sessionCount = document.getElementById("session-count");
const blockCount = document.getElementById("block-count");
const obsList    = document.getElementById("obs-list");
const toggle     = document.getElementById("toggle");
const signout    = document.getElementById("signout");
const currentEl  = document.getElementById("current");
const currentApp = document.getElementById("current-app");
const currentTopic = document.getElementById("current-topic");

let counts = { sync: 0, session: 0, blocked: 0 };
let observations = [];

function updateDot(decision) {
  const map = {
    SHARED_ANON: "var(--shared)",
    LOCAL_ONLY:  "var(--local)",
    BLOCKED:     "var(--blocked)",
  };
  const color = map[decision] ?? "var(--shared)";
  dot.style.background = color;
  dot.style.boxShadow = `0 0 7px ${color}`;
}

function renderObsList() {
  if (observations.length === 0) {
    obsList.innerHTML = '<li class="obs-empty">Watching your screen…</li>';
    return;
  }
  obsList.innerHTML = "";
  observations.slice(0, 3).forEach(({ decision, descriptor }) => {
    const b = BADGE[decision] ?? BADGE.SHARED_ANON;
    const li = document.createElement("li");
    li.className = "obs-card";
    li.style.setProperty("--card-accent", b.accent);
    li.innerHTML = `
      <div class="obs-card__top">
        <span class="obs-card__app">${esc(descriptor.app || "—")}</span>
        <span class="badge ${b.cls}">${b.label}</span>
      </div>
      <div class="obs-card__topic">${esc(descriptor.topic || descriptor.concept || "—")}</div>
    `;
    obsList.appendChild(li);
  });
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

window.continuum.onState(({ decision, descriptor }) => {
  counts.session++;
  if (decision === "SHARED_ANON") counts.sync++;
  if (decision === "BLOCKED") counts.blocked++;

  syncCount.textContent    = counts.sync;
  sessionCount.textContent = counts.session;
  blockCount.textContent   = counts.blocked;

  updateDot(decision);

  if (decision !== "BLOCKED") {
    observations.unshift({ decision, descriptor });
    if (observations.length > 3) observations.pop();
    renderObsList();
  }

  // Current activity banner
  if (descriptor.app || descriptor.topic) {
    currentEl.style.display = "block";
    currentApp.textContent   = descriptor.app || "";
    currentTopic.textContent = descriptor.concept || descriptor.topic || "";
  }
});

toggle.addEventListener("click", async () => {
  const { paused } = await window.continuum.toggle();
  toggle.textContent = paused ? "Resume" : "Pause";
  dot.style.opacity  = paused ? "0.3" : "1";
});

signout.addEventListener("click", () => window.continuum.signOut());
