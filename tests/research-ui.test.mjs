/**
 * Unit + browser-smoke tests for multi-agent-research-tool.html
 * Run: node tests/research-ui.test.mjs
 * Uses system Chrome (or PLAYWRIGHT_CHROME path).
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HTML_PATH = join(ROOT, "multi-agent-research-tool.html");
const INDEX_PATH = join(ROOT, "index.html");
const CHROME =
  process.env.PLAYWRIGHT_CHROME ||
  process.env.CHROME_PATH ||
  (existsSync("/usr/bin/google-chrome-stable")
    ? "/usr/bin/google-chrome-stable"
    : existsSync("/opt/google/chrome/chrome")
      ? "/opt/google/chrome/chrome"
      : existsSync("/home/sathwik/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome")
        ? "/home/sathwik/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome"
        : "google-chrome-stable");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log("  ✓", msg);
  } else {
    failed += 1;
    console.error("  ✗", msg);
  }
}

function staticContract() {
  console.log("\n[static] desk contracts");
  const html = readFileSync(HTML_PATH, "utf8");
  assert(existsSync(HTML_PATH), "HTML file exists");
  assert(existsSync(INDEX_PATH), "index.html exists");
  assert(html.includes("--accent: #2563eb"), "accent token");
  assert(html.includes("--bg: #f4f5f7"), "light ground");
  assert(html.includes("system-ui") || html.includes("Inter"), "UI sans stack");
  assert(html.includes("prefers-reduced-motion"), "reduced-motion media query");
  assert(html.includes("window.__RQ"), "test helpers exported");
  assert(html.includes("DEMO"), "DEMO labeling");
  assert(html.includes("btn-copy-report"), "report copy button");
  assert(html.includes("btn-download-md"), "report download button");
  assert(html.includes("session-list"), "multi-session list");
  assert(html.includes("panel-compose"), "compose panel");
  assert(html.includes("panel-running"), "running/pipeline panel");
  assert(html.includes("panel-report"), "report panel");
  assert(html.includes("pending"), "pending state");
  assert(html.includes("running"), "running state");
  assert(html.includes('id="job-id"'), "job id display");
  assert(html.includes("stage-rail"), "stage rail");
  assert(html.includes("data-stage=\"plan\""), "plan stage");
  assert(html.includes("data-stage=\"research\""), "research stage");
  assert(html.includes("data-stage=\"verify\""), "verify stage");
  assert(html.includes("data-m=\"fanout\""), "fan-out metric");
  assert(html.includes("data-m=\"tokens\""), "tokens metric");
  assert(!html.includes("Crimson Pro"), "no magazine Crimson Pro");
  assert(!html.includes("--paper: #f5f0e8"), "no cream paper quarterly palette");
}

function startStaticServer() {
  const html = readFileSync(HTML_PATH);
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === "/" || req.url === "/multi-agent-research-tool.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function runChrome(url) {
  return new Promise((resolve) => {
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--dump-dom`,
      url,
    ];
    const child = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolve({ code, out, err }));
    setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: -1, out, err: err + "\ntimeout" });
    }, 20000);
  });
}

async function browserSmoke() {
  console.log("\n[browser] smoke");
  if (!existsSync(CHROME) && CHROME === "google-chrome-stable") {
    console.log("  ⚠ chrome not found — skip browser smoke");
    return;
  }
  const { server, port } = await startStaticServer();
  try {
    const { code, out, err } = await runChrome(`http://127.0.0.1:${port}/`);
    assert(code === 0 || out.includes("MultiAgentResearch"), "chrome dump-dom ok or contains title");
    assert(out.includes("Compose query") || out.includes("query-input"), "compose UI present in DOM");
    assert(out.includes("stage-rail") || out.includes("Plan"), "pipeline UI present");
    if (code !== 0 && !out.includes("MultiAgentResearch")) {
      console.error(err.slice(0, 400));
    }
  } finally {
    server.close();
  }
}

async function main() {
  console.log("research-ui tests");
  staticContract();
  await browserSmoke();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
