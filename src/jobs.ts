// In-memory jobs so HTTP can return right away.
//
// Flow:
//   1) POST creates a job and returns { id, status: "pending" }
//   2) research runs in the background
//   3) client polls GET /jobs/:id until "done" or "error"
//
// Jobs live in a Map (lost when the process restarts).

import { runResearch, type OrchestrationMode } from "./pipeline.ts";

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

/** Start research in the background; return the job immediately. */
export function startResearchJob(
  query: string,
  orchestration: OrchestrationMode = "fixed",
): Job {
  const job: Job = {
    id: crypto.randomUUID(),
    query,
    status: "pending",
    orchestration,
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);

  // Do not await — HTTP already returned the job id.
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

/** JSON the API returns (no internal Map details). */
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
