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

app.get("/api/services", async (_req, res) => {
  const results = await Promise.all(
    services.map(async (svc) => {
      const alive = await checkTcp(svc.host, svc.port);
      return {
        ...svc,
        alive,
        externalUrl: svc.externalPort
          ? `${EXTERNAL_HOST}:${svc.externalPort}`
          : null,
        internalEndpoint: `${svc.host}:${svc.port}`,
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

app.listen(PORT, () =>
  console.log(`Monitor running on http://0.0.0.0:${PORT}`),
);
