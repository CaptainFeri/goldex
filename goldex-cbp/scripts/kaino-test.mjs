#!/usr/bin/env node
/**
 * Quick smoke-test for the Kaino wallet APIs.
 *
 *   node scripts/kaino-test.mjs            # login + chargeWallet (defaults)
 *   node scripts/kaino-test.mjs login      # login only, print token
 *   node scripts/kaino-test.mjs deposit 2500 1000000   # chargeWallet w/ args
 *        args: amount [identifier]
 *
 * Reads KAINO_* from process.env, falling back to the repo's goldex-cbp/.env.
 * Replicates the exact chargeWallet sign order used in
 * KainoWalletService.chargeWallet:
 *   tenant, identifier, amount, callBackUrl, currency, payerMobileNumber, autoVerify
 */
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "..", ".env");

function loadEnv() {
  const out = {};
  try {
    for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].replace(/^["']|["']$/g, "").trim();
      if (val.startsWith("#")) continue;
      out[key] = val;
    }
  } catch {
    /* no .env */
  }
  return out;
}

const envFile = loadEnv();
const env = (key, fallback = "") => process.env[key] ?? envFile[key] ?? fallback;

const config = {
  baseUrl: env("KAINO_BASE_URL", "https://inopay.done.ir"),
  loginPath: env("KAINO_LOGIN_PATH", "/rest/accountChannel/wallet/v1/login"),
  username: env("KAINO_USERNAME"),
  password: env("KAINO_PASSWORD"),
  tenant: env("KAINO_TENANT"),
  secret: env("KAINO_SECRET"),
  payerMobile: env("KAINO_PAYER_MOBILE"),
  walletPathPrefix: env(
    "KAINO_WALLET_PATH_PREFIX",
    "/rest/accountChannel/wallet/v1",
  ),
  proxy: {
    host: env("CBP_PROXY_HOST", ""),
    port: parseInt(env("CBP_PROXY_PORT", "29180"), 10),
    username: env("CBP_PROXY_USERNAME", ""),
    password: env("CBP_PROXY_PASSWORD", ""),
  },
};

function buildSignText(params, keys) {
  return `#${keys
    .filter((k) => params[k] !== null && params[k] !== undefined && params[k] !== "")
    .map((k) => params[k])
    .join("#")}#`;
}

function sign(params, keys, secret) {
  return createHmac("sha256", secret).update(buildSignText(params, keys)).digest("hex");
}

async function post(url, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

async function login() {
  if (!config.username || !config.password || !config.secret) {
    throw new Error("KAINO_USERNAME/KAINO_PASSWORD/KAINO_SECRET must be set in .env");
  }
  const keys = ["username", "password"];
  const body = { username: config.username, password: config.password };
  const loginBody = { ...body, sign: sign(body, keys, config.secret) };
  const url = `${config.baseUrl}${config.loginPath}`;
  console.log(`LOGIN → ${url}`);
  console.log(`  body: ${JSON.stringify({ ...loginBody, password: "***" })}`);
  const { status, json } = await post(url, loginBody);
  console.log(`  status: ${status}`);
  console.log(`  response: ${JSON.stringify(json)}`);
  const token =
    json?.token ?? json?.accessToken ?? json?.data?.token ?? json?.value?.token;
  if (!token) throw new Error(`Login failed (${status}): no token`);
  console.log(`  TOKEN: ${token}`);
  return token;
}

async function deposit(token, amount, identifier) {
  const keys = [
    "tenant",
    "identifier",
    "amount",
    "callBackUrl",
    "currency",
    "payerMobileNumber",
    "autoVerify",
  ];
  const params = {
    tenant: config.tenant,
    identifier,
    amount,
    callBackUrl: "http://91.228.186.110:4040/api/v1/payments/callbacks/kaino",
    currency: "IRR",
    payerMobileNumber: config.payerMobile || "09106299465",
    autoVerify: true,
  };
  const signText = buildSignText(params, keys);
  const sig = createHmac("sha256", config.secret).update(signText).digest("hex");
  const body = { ...params, payerMobileNumber: params.payerMobileNumber ?? "", sign: sig };
  const url = `${config.baseUrl}${config.walletPathPrefix}/chargeWallet`;
  console.log(`DEPOSIT → ${url}`);
  console.log(`  signText: ${signText}`);
  console.log(`  sign: ${sig}`);
  console.log(`  body: ${JSON.stringify(body, null, 2)}`);
  const { status, json } = await post(url, body, token);
  console.log(`  status: ${status}`);
  console.log(`  response: ${JSON.stringify(json, null, 2)}`);
  return json;
}

async function main() {
  const [cmd, amountArg, identifierArg] = process.argv.slice(2);
  const mode = cmd === "login" || cmd === "deposit" ? cmd : "deposit";
  const amount = amountArg ?? "1000";
  const identifier = identifierArg ?? `TEST-${Date.now()}`;

  if (mode === "login") {
    await login();
    return;
  }
  const token = await login();
  await deposit(token, amount, identifier);
}

main().catch((err) => {
  console.error("ERROR:", err?.message ?? err);
  process.exit(1);
});