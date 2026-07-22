# Async jobs

Long research can take tens of seconds. Blocking an HTTP request until it finishes is a bad client experience and can time out.

Async jobs pattern:
1. Client POSTs a research query.
2. Server creates a job id and returns immediately with status "pending".
3. Server runs research in the background.
4. Client polls GET /jobs/:id until status is "done" or "error".
5. When done, the response includes the full research result.

This project keeps jobs in memory (a Map). That is fine for learning and single-process demos. Production would use Redis or a real queue.
