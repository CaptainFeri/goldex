const express = require("express");
const os = require("os");
const net = require("net");

const app = express();
const PORT = 8080;

app.use(express.static("public"));

const services = [
  { name: "PostgreSQL", host: "postgres", port: 5432, type: "tcp", url: null },
  { name: "pgAdmin", host: "pgadmin", port: 80, type: "http", url: "http://pgadmin:80" },
  { name: "Redis", host: "redis", port: 6379, type: "tcp", url: null },
  { name: "Redis Insight", host: "redis-insight", port: 5540, type: "http", url: "http://redis-insight:5540" },
  { name: "MinIO API", host: "minio", port: 9000, type: "http", url: "http://minio:9000" },
  { name: "MinIO Console", host: "minio", port: 9001, type: "http", url: "http://minio:9001" },
  { name: "RabbitMQ AMQP", host: "rabbitmq", port: 5672, type: "tcp", url: null },
  { name: "RabbitMQ Mgmt", host: "rabbitmq", port: 15672, type: "http", url: "http://rabbitmq:15672" },
  { name: "Goldex Backend", host: "goldex-backend", port: 3000, type: "http", url: "http://goldex-backend:3000/api" },
  { name: "Pricing Engine", host: "goldex-pricing-engine", port: 3000, type: "http", url: "http://goldex-pricing-engine:3000" },
  { name: "Pricing Mock", host: "goldex-pricing-engine-mock", port: 5000, type: "http", url: "http://goldex-pricing-engine-mock:5000" },
  { name: "Telegram Bot", host: "goldex-telegram-bot", port: 4000, type: "http", url: "http://goldex-telegram-bot:4000" },
  { name: "Telegram Monitoring", host: "telegram-monitoring", port: 3000, type: "http", url: "http://telegram-monitoring:3000" },
  { name: "Admin Panel", host: "admin-panel", port: 80, type: "http", url: "http://admin-panel:80" },
  { name: "User Panel", host: "user-panel", port: 80, type: "http", url: "http://user-panel:80" },
];

function checkTcp(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

async function checkHttp(url, timeout = 3000) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res.ok || res.status < 500;
  } catch { return false; }
}

app.get("/api/services", async (_req, res) => {
  const results = await Promise.all(services.map(async (svc) => {
    let alive;
    if (svc.type === "http" && svc.url) alive = await checkHttp(svc.url);
    else alive = await checkTcp(svc.host, svc.port);
    return { ...svc, alive };
  }));
  res.json(results);
});

app.get("/api/system", (_req, res) => {
  const cpus = os.cpus();
  const cpuLoad = cpus.reduce((sum, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    const idle = cpu.times.idle;
    return sum + ((total - idle) / total) * 100;
  }, 0) / cpus.length;

  res.json({
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptime: os.uptime(),
    cpus: cpus.length,
    cpuLoad: cpuLoad.toFixed(1),
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    memUsedPercent: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(1),
    loadavg: os.loadavg(),
  });
});

app.listen(PORT, () => console.log(`Monitor running on http://0.0.0.0:${PORT}`));
