// One-command local development: provision .venv, start FastAPI, wait for health, then start Next.js.
// Ctrl+C (or either process exiting) stops both. No payment initiation exists anywhere in this project.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isWindows = process.platform === "win32";
const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(FRONTEND, "..");
const VENV = path.join(ROOT, ".venv");
const API_PORTS = [8000, 8001];
const HEALTH_TIMEOUT_MS = 60_000;

export const venvPython = (venv, windows = isWindows) =>
  windows ? path.join(venv, "Scripts", "python.exe") : path.join(venv, "bin", "python");

export const requirementsHash = (text) => createHash("sha256").update(text).digest("hex");

export async function firstFreePort(ports, isBusy) {
  for (const port of ports) if (!(await isBusy(port))) return port;
  return null;
}

// A port is busy when something already accepts connections on it.
export const portBusy = (port, host = "127.0.0.1") =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });

const log = (message) => console.log(`[trustpay] ${message}`);
// Stops any started child too, so a failed startup never leaves FastAPI listening.
const fail = (message) => { console.error(`\n[trustpay] ERROR: ${message}\n`); shutdown(1); };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: ROOT, ...options });
  return result.status === 0;
}

function findSystemPython() {
  const candidates = isWindows ? [["py", ["-3"]], ["python", []]] : [["python3", []], ["python", []]];
  for (const [command, prefix] of candidates) {
    const check = spawnSync(command, [...prefix, "-c", "import sys; print(sys.version_info >= (3, 11))"], { encoding: "utf8" });
    if (check.status === 0 && check.stdout.trim() === "True") return [command, prefix];
  }
  return null;
}

function provisionPython() {
  const python = venvPython(VENV);
  if (!existsSync(python)) {
    const system = findSystemPython();
    if (!system) fail("Python 3.11+ was not found. Install it (Windows: python.org installer with the py launcher), then rerun npm run dev.");
    log(`Creating ${path.relative(FRONTEND, VENV)} with ${system[0]} ...`);
    if (!run(system[0], [...system[1], "-m", "venv", VENV])) fail("Could not create the Python virtual environment in .venv.");
  }
  const requirements = path.join(ROOT, "requirements.txt");
  const stamp = path.join(VENV, ".trustpay-requirements.sha256");
  const wanted = requirementsHash(readFileSync(requirements, "utf8"));
  if (!existsSync(stamp) || readFileSync(stamp, "utf8").trim() !== wanted) {
    log("Installing Python packages from requirements.txt ...");
    if (!run(python, ["-m", "pip", "install", "--disable-pip-version-check", "-r", requirements]))
      fail("pip install failed. Read the pip output above, fix it, then rerun npm run dev.");
    writeFileSync(stamp, `${wanted}\n`);
  }
  return python;
}

const children = new Set();
let stopping = false;

function start(name, command, args, options) {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  child.label = name;
  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`\n[trustpay] ERROR: ${name} stopped unexpectedly (${signal ?? `exit code ${code}`}). See its output above.`);
      shutdown(1);
    } else if (children.size === 0) process.exit(process.exitCode ?? 0);
  });
  return child;
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  if (children.size === 0) process.exit(code);
  log("Stopping FastAPI and Next.js ...");
  for (const child of children) {
    // taskkill /T also stops the Next.js worker process that a plain kill would orphan on Windows.
    if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  setTimeout(() => { for (const child of children) child.kill("SIGKILL"); process.exit(code); }, 5000).unref();
}

async function waitForHealth(url, api) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (api.exitCode !== null || stopping) return null;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const body = await response.json().catch(() => ({}));
      if (response.ok) return body;
      fail(`FastAPI is running but ${url} returned ${response.status}: ${body.detail ?? "no detail"}. Check .env and the database settings.`);
      return null;
    } catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  fail(`FastAPI did not answer ${url} within ${HEALTH_TIMEOUT_MS / 1000}s. See its output above.`);
  return null;
}

async function main() {
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  const python = provisionPython();
  const port = await firstFreePort(API_PORTS, portBusy);
  if (port === null) return fail(`Ports ${API_PORTS.join(" and ")} are both in use. Stop the other API process and rerun npm run dev.`);
  if (port !== API_PORTS[0]) log(`Port ${API_PORTS[0]} is in use; using ${port} for FastAPI.`);
  const origin = `http://127.0.0.1:${port}`;

  log(`Starting FastAPI on ${origin} ...`);
  const api = start("FastAPI", python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)], { cwd: ROOT });
  const health = await waitForHealth(`${origin}/api/health`, api);
  if (!health) return; // the exit handler already reported the failure
  log(`FastAPI healthy: mode=${health.mode}, payment_initiation=${health.payment_initiation}`);

  const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
  loadEnvConfig(FRONTEND, true, { info: () => {}, error: console.error });
  if (health.mode === "supabase-postgres" && !process.env.NEXT_PUBLIC_SUPABASE_URL)
    log("WARNING: FastAPI is in Supabase mode but frontend/.env.local has no NEXT_PUBLIC_SUPABASE_URL; the UI cannot sign in.");

  const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
  start("Next.js", process.execPath, [nextBin, "dev", "-H", "127.0.0.1"], {
    cwd: FRONTEND,
    env: { ...process.env, TRUSTPAY_API_ORIGIN: origin },
  });
  log(`Open http://127.0.0.1:3000 (API ${origin}, docs ${origin}/docs). Press Ctrl+C to stop both.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
