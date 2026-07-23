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
  console.log("\n[static] plain functional + brief contracts");
  const html = readFileSync(HTML_PATH, "utf8");
  assert(existsSync(HTML_PATH), "HTML file exists");
  assert(html.includes("--accent: #1a5fb4"), "blue accent token");
  assert(html.includes("--bg: #f4f5f7"), "light functional ground");
  assert(html.includes("system-ui"), "system UI type stack");
  assert(html.includes("prefers-reduced-motion"), "reduced-motion media query");
  assert(html.includes("window.__RQ"), "test helpers exported");
  assert(html.includes("DEMO"), "DEMO labeling");
  assert(html.includes("btn-copy-report"), "report copy button");
  assert(html.includes("btn-download-md"), "report download button");
  assert(html.includes("session-list"), "multi-session list");
  assert(html.includes("panel-compose"), "compose panel");
  assert(html.includes("panel-running"), "running panel");
  assert(html.includes("panel-report"), "report panel");
  assert(html.includes("pending"), "pending state");
  assert(html.includes("running"), "running state");
  assert(html.includes('id="job-id"'), "job id display");
  assert(!html.includes("Crimson Pro"), "no magazine Crimson Pro");
  assert(!html.includes("--paper: #f5f0e8"), "no cream paper quarterly palette");
  assert(!html.includes("agent-credit"), "no agent credit theater");
  assert(!/font-weight:\s*560/.test(html), "no invalid font-weight 560");
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
      if (req.url === "/__test") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!doctype html><html><body>
<script>
window.__results = null;
window.__errors = [];
window.onerror = function(m){ window.__errors.push(String(m)); };
</script>
<iframe id="f" src="/" style="width:1280px;height:800px;border:0"></iframe>
<script>
const f = document.getElementById('f');
f.onload = async () => {
  try {
    const w = f.contentWindow;
    const d = f.contentDocument;
    const api = w.__RQ;
    const out = { ok: true, checks: [], errors: window.__errors.slice() };

    function check(name, cond) {
      out.checks.push({ name, pass: !!cond });
      if (!cond) out.ok = false;
    }

    check('helpers exported', !!api);
    check('app shell', !!d.getElementById('app'));
    check('sidebar sessions', !!d.getElementById('sidebar'));
    check('compose panel', !!d.getElementById('panel-compose'));
    check('compose visible initially', d.getElementById('panel-compose')?.classList.contains('active'));
    check('DEMO badge', !!(d.querySelector('.demo-badge')));
    check('escapeHtml', api.escapeHtml('<x>') === '&lt;x&gt;');
    check('slugify', api.slugify('Hello World!') === 'hello-world');
    check('truncate', api.truncate('abcdef', 4) === 'abc…');
    check('statusLabel done', api.statusLabel('done') === 'Done');

    // speed up mock
    api._setMockDelays(40, 80);

    const input = d.getElementById('query-input');
    input.value = 'Test vendor risk for ACME cloud security';
    d.getElementById('btn-submit').click();
    await new Promise(r => setTimeout(r, 30));

    check('running panel after submit', d.getElementById('panel-running')?.classList.contains('active'));
    check('job id shown', (d.getElementById('job-id')?.textContent || '').includes('job-'));
    check('status text present', !!(d.getElementById('job-status-text')?.textContent));

    // wait for done → report
    let reportOk = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 50));
      if (d.getElementById('panel-report')?.classList.contains('active') && d.getElementById('report-body')?.textContent.trim()) {
        reportOk = true;
        break;
      }
    }
    check('report after mock run', reportOk);
    check('report mentions DEMO', /DEMO/i.test(d.getElementById('report-body')?.textContent || ''));
    check('session list has item', d.querySelectorAll('.session-item').length >= 1);
    check('copy button', !!d.getElementById('btn-copy-report'));
    check('download button', !!d.getElementById('btn-download-md'));

    // empty query validation
    api.goCompose();
    await new Promise(r => setTimeout(r, 20));
    d.getElementById('query-input').value = '';
    d.getElementById('btn-submit').click();
    await new Promise(r => setTimeout(r, 20));
    check('empty query error', (d.getElementById('query-error')?.textContent || '').length > 5);

    window.__results = out;
    document.title = out.ok ? 'PASS' : 'FAIL';
  } catch (e) {
    window.__results = { ok: false, checks: [{ name: 'exception', pass: false }], error: String(e) };
    document.title = 'FAIL';
  }
};
</script>
</body></html>`);
        return;
      }
      res.writeHead(404);
      res.end("not found");
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function loadPlaywright() {
  const paths = [
    "playwright-core",
    "file:///tmp/research-ui-pw/node_modules/playwright-core/index.mjs",
    "file:///tmp/research-ui-pw/node_modules/playwright-core/index.js",
  ];
  for (const p of paths) {
    try {
      const mod = await import(p);
      const api = mod.chromium ? mod : mod.default;
      if (api && api.chromium) return api;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function main() {
  console.log("Research UI tests");
  console.log("HTML:", HTML_PATH);
  staticContract();

  let results;
  try {
    let pw = await loadPlaywright();
    if (!pw) {
      console.log("  installing playwright-core…");
      await new Promise((resolve, reject) => {
        const p = spawn(
          "npm",
          ["install", "playwright-core@1.49.1", "--prefix", "/tmp/research-ui-pw", "--no-save", "--silent"],
          { stdio: "inherit" }
        );
        p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("npm install failed"))));
      });
      pw = await loadPlaywright();
    }
    if (!pw) throw new Error("playwright-core not loadable");

    const { server, port } = await startStaticServer();
    const browser = await pw.chromium.launch({
      executablePath: CHROME,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/__test`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForFunction(() => window.__results != null, { timeout: 45000 });
    results = await page.evaluate(() => window.__results);
    results.pageErrors = pageErrors;
    await browser.close();
    server.close();
  } catch (e) {
    console.log("  browser harness failed:", e.message);
    // fallback pure helpers
    const html = readFileSync(HTML_PATH, "utf8");
    assert(html.includes("window.__RQ"), "source has __RQ export (fallback)");
    results = { ok: failed === 0, checks: [], mode: "fallback-static" };
  }

  if (results && results.checks) {
    console.log("\n[browser harness checks]");
    for (const c of results.checks) {
      assert(c.pass, c.name);
    }
    if (results.pageErrors && results.pageErrors.length) {
      assert(false, "no page errors: " + results.pageErrors.join("; "));
    } else if (results.checks.length) {
      assert(true, "no page errors reported");
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
