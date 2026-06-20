// Overlay UI logic. Receives agent state from the main process and renders the
// active status, current observation, and a rolling log.
const decisionColors = {
  BLOCKED: "var(--blocked)",
  LOCAL_ONLY: "var(--local)",
  SHARED_ANON: "var(--shared)",
};

const dot = document.getElementById("status-dot");
const decisionEl = document.getElementById("decision");
const conceptEl = document.getElementById("concept");
const logList = document.getElementById("log-list");
const toggle = document.getElementById("toggle");

window.continuum.onState(({ decision, descriptor }) => {
  const color = decisionColors[decision] ?? "var(--shared)";
  dot.style.background = color;
  dot.style.boxShadow = `0 0 8px ${color}`;
  decisionEl.textContent = decision;
  conceptEl.textContent = descriptor.concept || descriptor.topic || "—";

  const li = document.createElement("li");
  li.textContent = `${descriptor.app}: ${descriptor.concept}`;
  logList.prepend(li);
  while (logList.children.length > 12) logList.removeChild(logList.lastChild);
});

toggle.addEventListener("click", async () => {
  const { paused } = await window.continuum.toggle();
  toggle.textContent = paused ? "Resume" : "Pause";
  dot.style.opacity = paused ? "0.3" : "1";
});
