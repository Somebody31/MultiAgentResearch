// In-memory async jobs.
//
// Why: research can take a long time. Instead of making the HTTP client wait
// for the full run, we:
//   1) create a job → return { jobId } immediately
//   2) run research in the background
//   3) client polls GET /jobs/:id until status is done or error
//
// Stored in a Map (lost on restart). Fine for local demos; use Redis later.

import {
  runResearch,
  type OrchestrationMode,
  type RunResearchOptions,
} from "./pipeline.ts";

export type JobStatus = "pending" | "running" | "done" | "error";

export type Job = {
  id: string;
  query: string;
  status: JobStatus;
  orchestration: OrchestrationMode;
  result?: Awaited<ReturnType<typeof runResearch>>;
  error?: string;
  createdAt: number;
};

const jobs = new Map<string, Job>();

function newId(): string {
  return crypto.randomUUID();
}

// Create a job and start research without awaiting it here.
export function startResearchJob(
  query: string,
  options?: Pick<RunResearchOptions, "orchestration">,
): Job {
  const orchestration = options?.orchestration ?? "fixed";
  const job: Job = {
    id: newId(),
    query,
    status: "pending",
    orchestration,
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);

  // Fire-and-forget background work.
  void (async () => {
    job.status = "running";
    try {
      job.result = await runResearch(query, { orchestration });
      job.status = "done";
    } catch (err) {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
    }
  })();

  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

// Small public view (don't leak internal Map).
export function jobToJson(job: Job) {
  return {
    id: job.id,
    query: job.query,
    status: job.status,
    orchestration: job.orchestration,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
  };
}
