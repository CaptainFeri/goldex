const express = require("express");
const os = require("os");
const net = require("net");
const dns = require("dns");

const app = express();
const PORT = 8080;

app.use(express.static("public"));

const services = [
  { name: "PostgreSQL",          host: "postgres",                    port: 5432 },
  { name: "pgAdmin",             host: "pgadmin",                     port: 80 },
  { name: "Redis",               host: "redis",                       port: 6379 },
  { name: "Redis Insight",       host: "redis-insight",               port: 5540 },
  { name: "MinIO API",           host: "minio",                       port: 9000 },
  { name: "MinIO Console",       host: "minio",                       port: 9001 },
  { name: "RabbitMQ AMQP",       host: "rabbitmq",                    port: 5672 },
  { name: "RabbitMQ Mgmt",       host: "rabbitmq",                    port: 15672 },
  { name: "Goldex Backend",      host: "goldex-backend",              port: 3000 },
  { name: "Pricing Engine",      host: "goldex-pricing-engine",       port: 3000 },
  { name: "Pricing Mock",        host: "goldex-pricing-engine-mock",  port: 5000 },
  { name: "Telegram Bot",        host: "goldex-telegram-bot",         port: 4000 },
  { name: "Telegram Monitoring", host: "telegram-monitoring",         port: 3000 },
  { name: "Admin Panel",         host: "admin-panel",                 port: 80 },
  { name: "User Panel",          host: "user-panel",                  port: 80 },
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

app.get("/api/debug", (_req, res) => {
  const hosts = [...new Set(services.map(s => s.host))];
  Promise.all(hosts.map(h =>
    new Promise(r => dns.lookup(h, (err, addr) => r({ host: h, addr: addr ?? err?.message ?? "unknown" })))
  )).then(r => res.json(r));
});

app.listen(PORT, () => console.log(`Monitor running on http://0.0.0.0:${PORT}`));
