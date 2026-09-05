import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Every route must say what it returns.
 *
 * The spec used to document 444 routes and zero response shapes, which made it
 * useless as documentation for a frontend developer and impossible to generate
 * a client from. This test stops that regressing: a new route without a
 * response decorator fails here rather than being noticed months later.
 *
 * `UNDOCUMENTED` is the remaining debt. It only ever shrinks — the test fails
 * if a listed controller is missing (renamed or deleted without updating this)
 * or has become fully documented, so finishing one is not something you can
 * forget to record.
 */

const ROUTE = /^\s*@(Get|Post|Put|Patch|Delete)\s*\(/;
const DECORATOR = /^\s*@/;

/** Our decorators always carry a payload type, so their presence is enough. */
const ENVELOPE_RESPONSE =
  /@(ApiEnvelopeResponse|ApiPaginatedResponse|ApiEnvelopePrimitiveResponse|ApiEnvelopeNoDataResponse)\s*\(/;

/**
 * A plain `@ApiResponse` counts only when it actually says what comes back.
 *
 * 56 of the 58 uses in this repo were `{ status: 200, description: "Wallets
 * retrieved" }` — prose that reads like documentation and generates no schema,
 * which is exactly the gap this test exists to close.
 */
const TYPED_RESPONSE = /@(ApiOkResponse|ApiCreatedResponse|ApiResponse)\s*\([^)]*?(type:|schema:)/s;

/**
 * A controller kept out of the document has no responses to document.
 *
 * The only one today is the signed-file route, where the URL is minted by the
 * API and simply followed -- there is nothing for a client to construct, and
 * publishing the shape would only invite someone to try building a token.
 */
const EXCLUDED_FROM_DOCUMENT = /@ApiExcludeController\s*\(/;

/** Controllers still to backfill. Remove a line when its module is done. */
const UNDOCUMENTED = [
  "admin/controller/admin.auth.controller.ts",
  "admin-arbitrage/admin-arbitrage.controller.ts",
  "admin-discount/discount-admin.controller.ts",
  "admin-monitoring/admin-monitoring.controller.ts",
  "admin-pair/market.controller.ts",
  "admin-schedule/admin-schedule.controller.ts",
  "admin-telegram-monitoring/admin-telegram-monitoring.controller.ts",
  "baseinfo/baseinfo.controller.ts",
  "cbp-admin/cbp-admin.controller.ts",
  "credit/user/credit-user.controller.ts",
  "crm/controllers/user-ticket.controller.ts",
  "deposit/deposit.controller.ts",
  "file/file.controller.ts",
  "finance-log/finance-log.controller.ts",
  "financial/admin-financial.controller.ts",
  "kyc/controllers/kyc.controller.ts",
  "mail/example/example.controller.ts",
  "market-status/market-status.controller.ts",
  "minio/example.controller.ts",
  "notification/admin-notification.controller.ts",
  "notification/notification-preference.controller.ts",
  "notification/notification-template.controller.ts",
  "notification/notification.controller.ts",
  "ocr/ocr.controller.ts",
  "order/admin/admin-ordeer.controller.ts",
  "order/order.controller.ts",
  "p2p/p2p-admin.controller.ts",
  "p2p/p2p-user.controller.ts",
  "payment-callback/payment-callback.controller.ts",
  "provider-finance/provider-finance.controller.ts",
  "provider-pair-mapping/provider-pair-mapping.controller.ts",
  "quote-request/quote-request.controller.ts",
  "shahin/shahin-proxy.controller.ts",
  "telegram-notifier/telegram-webhook.controller.ts",
  "user/controller/profile.user.controller.ts",
  "user/controller/user.auth.controller.ts",
  "user/controller/user.kyc.controller.ts",
  "user-level/user-level-user.controller.ts",
  "user-level/user-level.controller.ts",
  "user-telegram/user-telegram.controller.ts",
  "user-wallet/user-wallet.controller.ts",
  "warehouse/admin/admin-warehouse.controller.ts",
  "warehouse/warehouse.controller.ts",
  "withdraw/withdraw.controller.ts",
];

function controllerFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) controllerFiles(full, out);
    else if (entry.endsWith(".controller.ts")) out.push(full);
  }
  return out;
}

/** Route decorators whose decorator block carries no response decorator. */
function undocumentedRoutes(source: string): string[] {
  const lines = source.split("\n");
  const missing: string[] = [];
  let block: string[] = [];
  let depth = 0;

  for (const line of lines) {
    const inDecorator = DECORATOR.test(line) || depth > 0;
    if (inDecorator) {
      block.push(line);
      // A decorator's arguments can span lines; only leave the block when its
      // parentheses balance, or @UseInterceptors(...) would split it in two.
      depth += (line.match(/\(/g)?.length ?? 0) - (line.match(/\)/g)?.length ?? 0);
      if (depth < 0) depth = 0;
      continue;
    }
    if (block.length) {
      const text = block.join("\n");
      const route = block.find((l) => ROUTE.test(l));
      const documented = ENVELOPE_RESPONSE.test(text) || TYPED_RESPONSE.test(text);
      if (route && !documented) missing.push(route.trim());
      block = [];
    }
  }
  return missing;
}

describe("OpenAPI response coverage", () => {
  const root = join(__dirname, "..", "..");
  const files = controllerFiles(root);
  const rel = (f: string) => f.slice(root.length + 1).split("\\").join("/");

  it("finds the controllers", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("documents a response for every route outside the backlog", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const path = rel(file);
      if (UNDOCUMENTED.includes(path)) continue;
      const source = readFileSync(file, "utf8");
      if (EXCLUDED_FROM_DOCUMENT.test(source)) continue;
      const missing = undocumentedRoutes(source);
      if (missing.length) offenders.push(`${path}\n    ${missing.join("\n    ")}`);
    }
    expect(offenders.join("\n  ")).toBe("");
  });

  /**
   * Nest answers POST with 201 unless `@HttpCode` says otherwise. Documenting
   * one as 200 is not a cosmetic slip: a generated client keys its result type
   * off the status, so it would treat every successful call as unhandled.
   */
  it("documents POST routes with the status the framework actually returns", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const lines = source.split("\n");
      let block: string[] = [];
      let depth = 0;
      for (const line of lines) {
        if (DECORATOR.test(line) || depth > 0) {
          block.push(line);
          depth += (line.match(/\(/g)?.length ?? 0) - (line.match(/\)/g)?.length ?? 0);
          if (depth < 0) depth = 0;
          continue;
        }
        if (block.length) {
          const text = block.join("\n");
          const route = block.find((l) => ROUTE.test(l));
          const isPost = route?.includes("@Post(");
          if (
            isPost &&
            ENVELOPE_RESPONSE.test(text) &&
            !text.includes("status: 201") &&
            !text.includes("@HttpCode")
          ) {
            offenders.push(`${rel(file)} ${route!.trim()}`);
          }
          block = [];
        }
      }
    }
    expect(offenders.join("\n  ")).toBe("");
  });

  it("keeps the backlog honest — no stale or finished entries", () => {
    const paths = new Set(files.map(rel));
    const stale = UNDOCUMENTED.filter((p) => !paths.has(p));
    expect(stale).toEqual([]);

    const finished = UNDOCUMENTED.filter((p) => {
      const file = files.find((f) => rel(f) === p);
      return file && undocumentedRoutes(readFileSync(file, "utf8")).length === 0;
    });
    // Done means done: take it off the list so the debt cannot silently regrow.
    expect(finished).toEqual([]);
  });
});
