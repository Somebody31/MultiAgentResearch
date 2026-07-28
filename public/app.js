// Live research console — talks to this same server.
//
// Flow:
//   1) POST /research  → { id, status }
//   2) poll GET /jobs/:id until done | error
//   3) show result.finalReport

const POLL_MS = 1000;

const queryEl = document.getElementById("query");
const startBtn = document.getElementById("start");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const reportEl = document.getElementById("report");
const jobMetaEl = document.getElementById("job-meta");
const detailsEl = document.getElementById("details");
const detailsBodyEl = document.getElementById("details-body");
const stageListEl = document.getElementById("stage-list");
const stageNoteEl = document.getElementById("stage-note");

/** @type {ReturnType<typeof setInterval> | null} */
let pollTimer = null;

function selectedOrchestration() {
  const checked = document.querySelector(
    'input[name="orchestration"]:checked',
  );
  return checked && checked.value === "dynamic" ? "dynamic" : "fixed";
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.classList.remove("is-running", "is-done", "is-error");
  if (kind === "running") statusEl.classList.add("is-running");
  if (kind === "done") statusEl.classList.add("is-done");
  if (kind === "error") statusEl.classList.add("is-error");
}

function setError(message) {
  if (!message) {
    errorEl.hidden = true;
    errorEl.textContent = "";
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = message;
}

/**
 * Honest stage strip: whole-run state only.
 * We do not advance stages one-by-one (API has no stage stream).
 */
function setStageState(state) {
  stageListEl.classList.remove("is-idle", "is-running", "is-done", "is-error");
  stageListEl.classList.add(`is-${state}`);

  if (state === "idle") {
    stageNoteEl.textContent =
      "Stages are the run path. The API does not stream per-stage progress.";
  } else if (state === "running") {
    stageNoteEl.textContent =
      "Job is running on the server. Stage strip stays coarse until done.";
  } else if (state === "done") {
    stageNoteEl.textContent = "Job finished. Report below uses the real final output.";
  } else if (state === "error") {
    stageNoteEl.textContent = "Job failed. See the error and run details.";
  }
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function setBusy(busy) {
  startBtn.disabled = busy;
  queryEl.disabled = busy;
  for (const input of document.querySelectorAll(
    'input[name="orchestration"]',
  )) {
    input.disabled = busy;
  }
}

function clearDetails() {
  detailsEl.hidden = true;
  detailsBodyEl.innerHTML = "";
  jobMetaEl.textContent = "";
}

/**
 * @param {object} job
 */
function showDetails(job) {
  const result = job.result || {};
  const rows = [
    ["job id", job.id || "—"],
    ["status", job.status || "—"],
    ["orchestration", job.orchestration || result.orchestration || "—"],
    ["verdict", result.verdict ?? "—"],
    ["retries", result.retries ?? "—"],
    ["sub-questions", Array.isArray(result.subQuestions) ? result.subQuestions.length : "—"],
    ["findings", Array.isArray(result.findings) ? result.findings.length : "—"],
  ];

  if (result.stopReason) {
    rows.push(["stop reason", result.stopReason]);
  }

  detailsBodyEl.innerHTML = "";
  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = String(value);
    detailsBodyEl.appendChild(dt);
    detailsBodyEl.appendChild(dd);
  }
  detailsEl.hidden = false;
}

/**
 * @param {object} job
 */
function applyJob(job) {
  jobMetaEl.textContent = job.id ? `id ${job.id}` : "";

  if (job.status === "pending" || job.status === "running") {
    setStatus(job.status === "pending" ? "Pending…" : "Running…", "running");
    setStageState("running");
    reportEl.textContent = "Research in progress…";
    return;
  }

  if (job.status === "error") {
    stopPolling();
    setBusy(false);
    setStatus("Error", "error");
    setStageState("error");
    setError(job.error || "Job failed");
    reportEl.textContent = "No report — the job ended in error.";
    showDetails(job);
    return;
  }

  if (job.status === "done") {
    stopPolling();
    setBusy(false);
    setStatus("Done", "done");
    setStageState("done");
    setError("");

    const report =
      job.result && typeof job.result.finalReport === "string"
        ? job.result.finalReport
        : "";
    reportEl.textContent = report.trim() !== "" ? report : "(empty report)";
    showDetails(job);
  }
}

async function pollJob(id) {
  try {
    const res = await fetch(`/jobs/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Poll failed (${res.status})`);
    }
    const job = await res.json();
    applyJob(job);
  } catch (err) {
    stopPolling();
    setBusy(false);
    setStatus("Error", "error");
    setStageState("error");
    setError(err instanceof Error ? err.message : String(err));
  }
}

async function startResearch() {
  const query = queryEl.value.trim();
  if (query === "") {
    setError("Enter a research question.");
    return;
  }

  stopPolling();
  setError("");
  clearDetails();
  setBusy(true);
  setStatus("Starting…", "running");
  setStageState("running");
  reportEl.textContent = "Starting job…";

  try {
    const res = await fetch("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        orchestration: selectedOrchestration(),
      }),
    });

    const body = await res.json().catch(() => ({}));

    if (res.status === 429) {
      setBusy(false);
      setStatus("Rate limited", "error");
      setStageState("error");
      setError(body.error || "Too many requests, slow down.");
      reportEl.textContent = "Rate limited — wait and try again.";
      return;
    }

    if (!res.ok) {
      setBusy(false);
      setStatus("Error", "error");
      setStageState("error");
      setError(body.error || `Start failed (${res.status})`);
      reportEl.textContent = "Could not start research.";
      return;
    }

    const id = body.id;
    if (typeof id !== "string" || id === "") {
      setBusy(false);
      setStatus("Error", "error");
      setStageState("error");
      setError("Server did not return a job id.");
      return;
    }

    applyJob(body);
    pollTimer = setInterval(() => {
      void pollJob(id);
    }, POLL_MS);
    // Immediate second look so short jobs do not wait a full tick
    void pollJob(id);
  } catch (err) {
    setBusy(false);
    setStatus("Error", "error");
    setStageState("error");
    setError(err instanceof Error ? err.message : String(err));
    reportEl.textContent = "Could not reach the API.";
  }
}

startBtn.addEventListener("click", () => {
  void startResearch();
});

// Initial strip state
setStageState("idle");
setStatus("Idle", null);
