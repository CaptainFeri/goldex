const express = require("express");
const os = require("os");
const net = require("net");
const dns = require("dns");
const http = require("http");
const { execSync } = require("child_process");

const app = express();
const PORT = 8080;
const EXTERNAL_HOST = process.env.EXTERNAL_HOST || "http://localhost";

const OCR_HOST = process.env.OCR_HOST || "ocr-worker";
const OCR_PORT = process.env.OCR_PORT || 8000;

app.use(express.static("public"));

const sysHistory = { cpu: [], mem: [], disk: [], timestamps: [] };
const MAX_HISTORY = 60;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    }).on("error", reject);
  });
}

const services = [
  // Infrastructure
  {
    name: "PostgreSQL",
    category: "Infrastructure",
    containerName: "goldex-postgres",
    host: "postgres",
    port: 5432,
    externalPort: 5434,
  },
  {
    name: "Redis",
    category: "Infrastructure",
    containerName: "goldex-redis",
    host: "redis",
    port: 6379,
    externalPort: 6381,
  },
  {
    name: "RabbitMQ AMQP",
    category: "Infrastructure",
    containerName: "goldex-rabbitmq",
    host: "rabbitmq",
    port: 5672,
    externalPort: 5672,
  },
  {
    name: "MinIO API",
    category: "Infrastructure",
    containerName: "goldex-minio",
    host: "minio",
    port: 9000,
    externalPort: 9000,
  },
  // Management UI
  {
    name: "pgAdmin",
    category: "Management UI",
    containerName: "goldex-pgadmin",
    host: "pgadmin",
    port: 80,
    externalPort: 5050,
  },
  {
    name: "Redis Insight",
    category: "Management UI",
    containerName: "goldex-redis-insight",
    host: "redis-insight",
    port: 5540,
    externalPort: 5540,
  },
  {
    name: "RabbitMQ Mgmt",
    category: "Management UI",
    containerName: "goldex-rabbitmq",
    host: "rabbitmq",
    port: 15672,
    externalPort: 15672,
  },
  {
    name: "MinIO Console",
    category: "Management UI",
    containerName: "goldex-minio",
    host: "minio",
    port: 9001,
    externalPort: 9001,
  },
  // Backend
  {
    name: "Goldex Backend",
    category: "Backend",
    containerName: "goldex-backend",
    host: "goldex-backend",
    port: 3000,
    externalPort: 4040,
  },
  {
    name: "Pricing Engine",
    category: "Backend",
    containerName: "goldex-pricing-engine",
    host: "goldex-pricing-engine",
    port: 3000,
    externalPort: 4000,
  },
  {
    name: "Pricing Mock",
    category: "Backend",
    containerName: "goldex-pricing-engine-mock",
    host: "goldex-pricing-engine-mock",
    port: 5000,
    externalPort: 5000,
  },
  {
    name: "Telegram Bot",
    category: "Backend",
    containerName: "goldex-telegram-bot",
    host: "goldex-telegram-bot",
    port: 4000,
    externalPort: 3001,
  },
  {
    name: "Telegram Monitoring",
    category: "Backend",
    containerName: "telegram-monitoring",
    host: "telegram-monitoring",
    port: 3000,
    externalPort: 3002,
  },
  {
    name: "CBP Payment",
    category: "Backend",
    containerName: "goldex-cbp",
    host: "goldex-cbp",
    port: 4100,
    externalPort: 4100,
  },
  // Frontend
  {
    name: "Admin Panel",
    category: "Frontend",
    containerName: "goldex-admin-panel",
    host: "admin-panel",
    port: 80,
    externalPort: 5190,
  },
  {
    name: "User Panel",
    category: "Frontend",
    containerName: "goldex-user-panel",
    host: "user-panel",
    port: 80,
    externalPort: 5173,
  },
  // OCR
  {
    name: "OCR Worker",
    category: "Backend",
    containerName: "ocr-worker",
    host: "ocr-worker",
    port: 8000,
    externalPort: 8000,
  },
];

function checkTcp(host, port, timeout = 4000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

let containerStatsCache = null;
let containerStatsAt = 0;
const CONTAINER_STATS_TTL_MS = 3000;

function parseBytes(value, unit) {
  const units = {
    B: 1,
    KiB: 1024,
    MiB: 1024 ** 2,
    GiB: 1024 ** 3,
    TiB: 1024 ** 4,
    kB: 1000,
    MB: 1000 ** 2,
    GB: 1000 ** 3,
    TB: 1000 ** 4,
  };
  return Math.round(parseFloat(value) * (units[unit] || 1));
}

function getContainerStats() {
  const now = Date.now();
  if (containerStatsCache && now - containerStatsAt < CONTAINER_STATS_TTL_MS) {
    return containerStatsCache;
  }
  const result = {};
  try {
    const out = execSync(
      'docker stats --no-stream --format "{{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}\\t{{.MemPerc}}\\t{{.NetIO}}"',
      { timeout: 8000, maxBuffer: 10 * 1024 * 1024 },
    ).toString();
    for (const line of out.split("\n")) {
      const parts = line.split("\t");
      if (parts.length < 4 || !parts[0]) continue;
      const memMatch = parts[2].match(/^([\d.]+)([A-Za-z]+)\s*\/\s*([\d.]+)([A-Za-z]+)$/);
      result[parts[0]] = {
        cpuPercent: parseFloat(parts[1]) || 0,
        memUsageBytes: memMatch ? parseBytes(memMatch[1], memMatch[2]) : 0,
        memLimitBytes: memMatch ? parseBytes(memMatch[3], memMatch[4]) : 0,
        memPercent: parseFloat(parts[3]) || 0,
        netIO: parts[4] || "",
      };
    }
  } catch {}
  containerStatsCache = result;
  containerStatsAt = now;
  return result;
}

app.get("/api/containers/stats", (_req, res) => {
  res.json(getContainerStats());
});

app.get("/api/services", async (_req, res) => {
  const stats = getContainerStats();
  const results = await Promise.all(
    services.map(async (svc) => {
      const alive = await checkTcp(svc.host, svc.port);
      const s = stats[svc.containerName];
      return {
        ...svc,
        alive,
        externalUrl: svc.externalPort
          ? `${EXTERNAL_HOST}:${svc.externalPort}`
          : null,
        internalEndpoint: `${svc.host}:${svc.port}`,
        cpuPercent: s ? s.cpuPercent : null,
        memUsageBytes: s ? s.memUsageBytes : null,
        memLimitBytes: s ? s.memLimitBytes : null,
        memPercent: s ? s.memPercent : null,
        netIO: s ? s.netIO : null,
      };
    }),
  );
  res.json(results);
});

let prevCpuTimes = null;

function getCpuInfo() {
  const cpus = os.cpus();
  const current = cpus.map((cpu) => ({
    total: Object.values(cpu.times).reduce((a, b) => a + b, 0),
    idle: cpu.times.idle,
  }));

  let cores;
  if (!prevCpuTimes) {
    cores = current.map((cpu, i) => ({ core: i, load: 0 }));
  } else {
    cores = current.map((cpu, i) => {
      const prev = prevCpuTimes[i];
      const dTotal = Math.max(0, cpu.total - prev.total);
      const dIdle = Math.max(0, cpu.idle - prev.idle);
      const load = dTotal > 0 ? ((dTotal - dIdle) / dTotal) * 100 : 0;
      return { core: i, load: parseFloat(load.toFixed(1)) };
    });
  }
  prevCpuTimes = current;

  const avgLoad = cores.reduce((s, c) => s + c.load, 0) / cores.length;
  return { cores, avgLoad: parseFloat(avgLoad.toFixed(1)) };
}

function getNetworkInfo() {
  const ifaces = os.networkInterfaces();
  const result = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    const ipv4 = addrs.find((a) => a.family === "IPv4" && !a.internal);
    if (ipv4)
      result.push({ name, address: ipv4.address, netmask: ipv4.netmask });
  }
  return result;
}

function getDiskUsage() {
  try {
    const out = execSync("df -B1 / 2>/dev/null | tail -1", { timeout: 2000 })
      .toString()
      .trim();
    const parts = out.split(/\s+/);
    if (parts.length >= 4) {
      const total = parseInt(parts[1], 10);
      const used = parseInt(parts[2], 10);
      const free = parseInt(parts[3], 10);
      if (!isNaN(total) && total > 0) {
        return {
          totalBytes: total,
          usedBytes: used,
          freeBytes: free,
          usedPercent: parseFloat(((used / total) * 100).toFixed(1)),
        };
      }
    }
  } catch {}
  return null;
}

app.get("/api/system", (_req, res) => {
  const cpu = getCpuInfo();
  const procMem = process.memoryUsage();
  const disk = getDiskUsage();

  const now = Date.now();
  sysHistory.cpu.push({ time: now, value: cpu.avgLoad });
  sysHistory.mem.push({ time: now, value: parseFloat(((1 - os.freemem() / os.totalmem()) * 100).toFixed(1)) });
  if (disk) sysHistory.disk.push({ time: now, value: disk.usedPercent });
  sysHistory.timestamps.push(now);
  while (sysHistory.cpu.length > MAX_HISTORY) sysHistory.cpu.shift();
  while (sysHistory.mem.length > MAX_HISTORY) sysHistory.mem.shift();
  while (sysHistory.disk.length > MAX_HISTORY) sysHistory.disk.shift();
  while (sysHistory.timestamps.length > MAX_HISTORY) sysHistory.timestamps.shift();

  res.json({
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    uptime: os.uptime(),
    cpus: os.cpus().length,
    cpuCores: cpu.cores,
    cpuAvgLoad: cpu.avgLoad,
    loadavg: os.loadavg(),
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    memUsedPercent: parseFloat(
      ((1 - os.freemem() / os.totalmem()) * 100).toFixed(1),
    ),
    processMemory: {
      rss: procMem.rss,
      heapTotal: procMem.heapTotal,
      heapUsed: procMem.heapUsed,
      external: procMem.external,
    },
    network: getNetworkInfo(),
    disk: disk,
  });
});

app.get("/api/system/history", (_req, res) => {
  res.json({ cpu: sysHistory.cpu, mem: sysHistory.mem, disk: sysHistory.disk });
});

app.get("/api/ocr/health", async (_req, res) => {
  try {
    const data = await fetchJson(`http://${OCR_HOST}:${OCR_PORT}/health`);
    res.json(data || { status: "unreachable", model_loaded: false });
  } catch {
    res.json({ status: "unreachable", model_loaded: false });
  }
});

app.get("/api/ocr/train-status", async (_req, res) => {
  try {
    const data = await fetchJson(`http://${OCR_HOST}:${OCR_PORT}/train/status`);
    res.json(data || { state: "unreachable" });
  } catch {
    res.json({ state: "unreachable" });
  }
});

/**
 * Parse a Prometheus text exposition payload into { name: value } for
 * simple single-valued metrics. Multi-line (labels) samples are summed and
 * tracked per-label under `${name}{label=val}` keys.
 */
function parsePrometheus(text) {
  const out = {};
  const lastByFamily = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let name = line.split("{")[0].split(" ")[0];
    let rest = line.slice(name.length);
    let labels = {};
    let value = "0";
    const lb = rest.match(/^\{([^}]*)\}/);
    if (lb) {
      rest = rest.slice(lb[0].length);
      for (const pair of lb[1].split(",")) {
        const [k, v] = pair.split("=");
        if (k) labels[k.trim()] = (v || "").replace(/^"|"$/g, "");
      }
    }
    const vm = rest.trim().match(/^([\d.eE+-]+)/);
    if (vm) value = vm[1];
    const n = parseFloat(value) || 0;
    out[name] = (out[name] || 0) + n;
    lastByFamily[name] = lastByFamily[name] || {};
    const labelKey = Object.keys(labels)
      .map((k) => `${k}=${labels[k]}`)
      .join(",");
    if (labelKey) lastByFamily[name][labelKey] = n;
  }
  return { totals: out, byLabel: lastByFamily };
}

function metricSample(parsed, name, labelKey) {
  return labelKey ? parsed.byLabel[name]?.[labelKey] ?? 0 : parsed.totals[name] ?? 0;
}

app.get("/api/ocr/usage", async (_req, res) => {
  try {
    const text = await new Promise((resolve, reject) => {
      http
        .get(`http://${OCR_HOST}:${OCR_PORT}/metrics`, (r) => {
          let d = "";
          r.on("data", (c) => (d += c));
          r.on("end", () => resolve(d));
        })
        .on("error", reject);
    });
    const parsed = parsePrometheus(text);
    const total = metricSample(parsed, "ocr_inference_total");
    const success = metricSample(parsed, "ocr_inference_total", "status=success");
    const failure = metricSample(parsed, "ocr_inference_total", "status=failure");
    const durationMs = metricSample(parsed, "ocr_inference_duration_ms_sum");
    const durationCount = metricSample(parsed, "ocr_inference_duration_ms_count");
    res.json({
      total,
      success,
      failure,
      feedback: metricSample(parsed, "ocr_feedback_total"),
      trainingState: metricSample(parsed, "ocr_training_state"),
      trainingSamples: metricSample(parsed, "ocr_training_samples"),
      avgLatencyMs: durationCount ? durationMs / durationCount : 0,
      inferenceCount: durationCount,
    });
  } catch {
    res.json({ reachable: false });
  }
});

app.get("/api/logs/:container", (req, res) => {
  const { container } = req.params;
  if (!/^[a-zA-Z0-9_.-]+$/.test(container)) {
    return res.status(400).json({ error: "Invalid container name" });
  }
  const lines = parseInt(req.query.lines) || 80;
  try {
    const log = execSync(
      `docker logs --tail ${lines} ${container} 2>&1`,
      { timeout: 5000, maxBuffer: 10 * 1024 * 1024 },
    ).toString();
    res.json({ container, lines, log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug", (_req, res) => {
  const hosts = [...new Set(services.map((s) => s.host))];
  Promise.all(
    hosts.map(
      (h) =>
        new Promise((r) =>
          dns.lookup(h, (err, addr) =>
            r({ host: h, addr: addr ?? err?.message ?? "unknown" }),
          ),
        ),
    ),
  ).then((r) => res.json(r));
});

// ── Test runner ─────────────────────────────────────────────────────────

const REPO_DIR = process.env.REPO_DIR || "/repo";
const TEST_COMPOSE_FILE =
  process.env.TEST_COMPOSE_FILE || `${REPO_DIR}/docker-compose.test.yml`;

const TEST_PROJECTS = [
  { name: "goldex-cbp", dir: `${REPO_DIR}/goldex-cbp`, testCmd: "npx jest --passWithNoTests --json --outputFile=/tmp/cbp-test.json --coverage --coverageReporters=json-summary --coverageDirectory=/tmp/cbp-cov" },
  { name: "goldex-backend", dir: `${REPO_DIR}/goldex-backend`, testCmd: "npx jest --passWithNoTests --json --outputFile=/tmp/backend-test.json --coverage --coverageReporters=json-summary --coverageDirectory=/tmp/backend-cov" },
  { name: "goldex-pricing-engine", dir: `${REPO_DIR}/goldex-pricing-engine`, testCmd: "npx jest --passWithNoTests --json --outputFile=/tmp/pricing-test.json --coverage --coverageReporters=json-summary --coverageDirectory=/tmp/pricing-cov" },
];

let testRun = { running: false, startedAt: null, finishedAt: null, compose: [], projects: [], lastError: null };

function runCmd(cmd, opts = {}) {
  return new Promise((resolve) => {
    const { exec } = require("child_process");
    exec(cmd, { timeout: 300000, maxBuffer: 32 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code ?? 1 : 0, stdout: stdout || "", stderr: stderr || "", error: err?.message || null });
    });
  });
}

/**
 * Detect which Compose binary is available. Prefers the v2 plugin
 * (`docker compose`, supports --wait); falls back to the legacy
 * `docker-compose` (v1). Returns null when neither exists.
 */
async function detectCompose() {
  const v2 = await runCmd("docker compose version");
  if (v2.code === 0) return { cmd: "docker compose", wait: true };
  const v1 = await runCmd("docker-compose --version");
  if (v1.code === 0) return { cmd: "docker-compose", wait: false };
  return null;
}

function parseJestJson(jsonFile, covDir) {
  try {
    const fs = require("fs");
    if (!fs.existsSync(jsonFile)) return null;
    const data = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
    let summary = null;
    try {
      summary = JSON.parse(
        fs.readFileSync(`${covDir}/coverage-summary.json`, "utf8"),
      ).total;
    } catch {}
    const states = {
      passed: 0, failed: 0, skipped: 0, pending: 0, total: 0,
      bySuite: (data.testResults || []).map((suite) => {
        const passed = (suite.assertionResults || []).filter((t) => t.status === "passed").length;
        const failed = (suite.assertionResults || []).filter((t) => t.status === "failed").length;
        const skipped = (suite.assertionResults || []).filter((t) => t.status === "skipped" || t.status === "pending").length;
        states.passed += passed; states.failed += failed; states.skipped += skipped;
        states.total += suite.assertionResults?.length || 0;
        return { name: suite.name, passed, failed, skipped, tests: suite.assertionResults?.length || 0 };
      }),
    };
    states.total = states.passed + states.failed + states.skipped;
    const cov = summary
      ? {
          lines: summary.lines?.pct ?? 0,
          statements: summary.statements?.pct ?? 0,
          functions: summary.functions?.pct ?? 0,
          branches: summary.branches?.pct ?? 0,
        }
      : null;
    return { success: states.failed === 0, numPassed: data.numPassedTests, numFailed: data.numFailedTests, states, coverage: cov, testResults: data.testResults };
  } catch {
    return null;
  }
}

app.get("/api/tests/state", (_req, res) => {
  res.json(testRun);
});

app.post("/api/tests/run", async (_req, res) => {
  if (testRun.running) {
    return res.status(409).json({ error: "A test run is already in progress", state: testRun });
  }

  testRun = { running: true, startedAt: new Date().toISOString(), finishedAt: null, compose: [], projects: [], lastError: null };
  res.json({ started: true, state: testRun });

  // 1. Bring up the shared test infrastructure.
  let composeOut = "docker compose unavailable";
  const compose = await detectCompose();
  if (!compose) {
    composeOut = [
      "Neither 'docker compose' (v2) nor 'docker-compose' (v1) is available in the monitor container.",
      "Install the compose plugin (apk add docker-cli-compose) or rebuild the monitor image.",
      `Compose file: ${TEST_COMPOSE_FILE}`,
    ].join("\n");
  } else {
    const up = await runCmd(`${compose.cmd} -f "${TEST_COMPOSE_FILE}" up -d${compose.wait ? " --wait" : ""}`);
    if (up.code === 0) {
      composeOut = up.stdout + up.stderr;
    } else {
      // Retry with the other compose flavour as a last resort.
      const alt = compose.cmd === "docker compose" ? "docker-compose" : "docker compose";
      const altUp = await runCmd(`${alt} -f "${TEST_COMPOSE_FILE}" up -d`);
      if (altUp.code === 0) {
        composeOut = up.stdout + up.stderr + `\n(used fallback: ${alt})`;
      } else {
        composeOut = up.stdout + up.stderr + "\n" + altUp.stderr;
      }
    }
  }
  testRun.compose = [{ command: `${compose?.cmd ?? "docker compose"} up -d`, output: composeOut }];

  // 2. Run each project's unit tests with coverage.
  for (const proj of TEST_PROJECTS) {
    const entry = { name: proj.name, state: "running", code: null, output: "", result: null };
    testRun.projects.push(entry);
    const out = await runCmd(proj.testCmd, { cwd: proj.dir });
    entry.state = "done";
    entry.code = out.code;
    entry.output = (out.stdout + "\n" + out.stderr).trim();
    entry.result = parseJestJson(`/tmp/${proj.name.replace("goldex-", "")}-test.json`, `/tmp/${proj.name.replace("goldex-", "")}-cov`);
    if (!entry.result) entry.result = { success: false, error: "Could not parse jest JSON output" };
  }

  testRun.running = false;
  testRun.finishedAt = new Date().toISOString();
});

app.listen(PORT, () =>
  console.log(`Monitor running on http://0.0.0.0:${PORT}`),
);
