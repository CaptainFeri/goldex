const express = require("express");
const os = require("os");
const net = require("net");
const dns = require("dns");
const { execSync } = require("child_process");

const app = express();
const PORT = 8080;
const EXTERNAL_HOST = process.env.EXTERNAL_HOST || "http://localhost";

app.use(express.static("public"));

const services = [
  { name: "PostgreSQL",          host: "postgres",                    port: 5432, externalPort: 5434 },
  { name: "pgAdmin",             host: "pgadmin",                     port: 80,   externalPort: 5050 },
  { name: "Redis",               host: "redis",                       port: 6379, externalPort: 6381 },
  { name: "Redis Insight",       host: "redis-insight",               port: 5540, externalPort: 5540 },
  { name: "MinIO API",           host: "minio",                       port: 9000, externalPort: 9000 },
  { name: "MinIO Console",       host: "minio",                       port: 9001, externalPort: 9001 },
  { name: "RabbitMQ AMQP",       host: "rabbitmq",                    port: 5672, externalPort: 5672 },
  { name: "RabbitMQ Mgmt",       host: "rabbitmq",                    port: 15672, externalPort: 15672 },
  { name: "Goldex Backend",      host: "goldex-backend",              port: 3000, externalPort: 4040 },
  { name: "Pricing Engine",      host: "goldex-pricing-engine",       port: 3000, externalPort: 4000 },
  { name: "Pricing Mock",        host: "goldex-pricing-engine-mock",  port: 5000, externalPort: 5000 },
  { name: "Telegram Bot",        host: "goldex-telegram-bot",         port: 4000, externalPort: 3001 },
  { name: "Telegram Monitoring", host: "telegram-monitoring",         port: 3000, externalPort: 3002 },
  { name: "Admin Panel",         host: "admin-panel",                 port: 80,   externalPort: 5190 },
  { name: "User Panel",          host: "user-panel",                  port: 80,   externalPort: 5173 },
];

function checkTcp(host, port, timeout = 4000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

app.get("/api/services", async (_req, res) => {
  const results = await Promise.all(services.map(async (svc) => {
    const alive = await checkTcp(svc.host, svc.port);
    return {
      ...svc,
      alive,
      externalUrl: svc.externalPort ? `${EXTERNAL_HOST}:${svc.externalPort}` : null,
      internalEndpoint: `${svc.host}:${svc.port}`,
    };
  }));
  res.json(results);
});

function getCpuInfo() {
  const cpus = os.cpus();
  const cores = cpus.map((cpu, i) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    const idle = cpu.times.idle;
    return { core: i, load: parseFloat(((total - idle) / total * 100).toFixed(1)) };
  });
  const avgLoad = cores.reduce((s, c) => s + c.load, 0) / cores.length;
  return { cores, avgLoad: parseFloat(avgLoad.toFixed(1)) };
}

function getNetworkInfo() {
  const ifaces = os.networkInterfaces();
  const result = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    const ipv4 = addrs.find(a => a.family === "IPv4" && !a.internal);
    if (ipv4) result.push({ name, address: ipv4.address, netmask: ipv4.netmask });
  }
  return result;
}

function getDiskUsage() {
  try {
    const out = execSync("df -B1 / 2>/dev/null | tail -1", { timeout: 2000 }).toString().trim();
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
    memUsedPercent: parseFloat(((1 - os.freemem() / os.totalmem()) * 100).toFixed(1)),
    processMemory: {
      rss: procMem.rss,
      heapTotal: procMem.heapTotal,
      heapUsed: procMem.heapUsed,
      external: procMem.external,
    },
    network: getNetworkInfo(),
    disk: getDiskUsage(),
  });
});

app.get("/api/debug", (_req, res) => {
  const hosts = [...new Set(services.map(s => s.host))];
  Promise.all(hosts.map(h =>
    new Promise(r => dns.lookup(h, (err, addr) => r({ host: h, addr: addr ?? err?.message ?? "unknown" })))
  )).then(r => res.json(r));
});

app.listen(PORT, () => console.log(`Monitor running on http://0.0.0.0:${PORT}`));
