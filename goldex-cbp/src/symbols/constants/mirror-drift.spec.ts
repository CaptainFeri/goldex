import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { SYMBOL_TYPE_DEPOSIT_MAP, SYMBOL_TYPE_WITHDRAW_MAP } from "./symbol-type-type-map";
import { SymbolTypeEnum } from "../enum/symbol.type.enum";

/**
 * Keeps this mirror level with the backend map that owns these rules.
 *
 * The drift is not cosmetic. A `symbol.sync` carrying a type this copy rejects
 * is refused whole, so the symbol's gateway configuration never lands, and a
 * deposit against it fails with no gateway to call. That is exactly what
 * happened: the backend allowed p2p on rial, this copy did not, and rial
 * gateway deposits stopped working with the cause visible only in a cbp log.
 *
 * Read off disk rather than imported: the two are separate deployables in one
 * repository, and cbp must not depend on backend code at build time. Skipped
 * when the backend tree is not beside us, so a standalone checkout still runs.
 */
const BACKEND_MAP = join(
  __dirname,
  "../../../../goldex-backend/src/admin-symbol/constants/symbol-type-type-map.ts",
);
const BACKEND_ENUMS = join(__dirname, "../../../../goldex-backend/src/admin-symbol/enum");

/** `KEY = "value"` pairs of a TS string enum. */
function enumValues(file: string): Record<string, string> {
  const source = readFileSync(file, "utf8");
  const values: Record<string, string> = {};
  for (const [, key, value] of source.matchAll(/^\s*([A-Z_0-9]+)\s*=\s*"([^"]+)"/gm)) {
    values[key] = value;
  }
  return values;
}

/** One `[SymbolTypeEnum.X]: [...]` block of the named map, resolved to values. */
function backendMap(source: string, mapName: string, members: Record<string, string>) {
  const body = source.slice(source.indexOf(`export const ${mapName}`));
  const block = body.slice(0, body.indexOf("};"));
  const result: Record<string, string[]> = {};

  for (const [, type, list] of block.matchAll(/\[SymbolTypeEnum\.([A-Z_]+)\]:\s*\[([^\]]*)\]/g)) {
    result[type] = list
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const member = entry.split(".").pop()!;
        const value = members[member];
        if (!value) throw new Error(`Unknown enum member in ${mapName}: ${entry}`);
        return value;
      });
  }
  return result;
}

const available = existsSync(BACKEND_MAP);
const describeIfPresent = available ? describe : describe.skip;

describeIfPresent("mirror of the backend symbol-type map", () => {
  const source = readFileSync(BACKEND_MAP, "utf8");
  const deposits = enumValues(join(BACKEND_ENUMS, "deposit-type.enum.ts"));
  const withdraws = enumValues(join(BACKEND_ENUMS, "withdraw-type.enum.ts"));

  const compare = (
    mine: Record<SymbolTypeEnum, string[]>,
    theirs: Record<string, string[]>,
    label: string,
  ) => {
    for (const [type, allowed] of Object.entries(theirs)) {
      const key = SymbolTypeEnum[type as keyof typeof SymbolTypeEnum];
      expect({ [`${label}.${type}`]: [...(mine[key] ?? [])].sort() }).toEqual({
        [`${label}.${type}`]: [...allowed].sort(),
      });
    }
  };

  it("allows the same deposit types the backend does", () => {
    compare(SYMBOL_TYPE_DEPOSIT_MAP, backendMap(source, "SYMBOL_TYPE_DEPOSIT_MAP", deposits), "deposit");
  });

  it("allows the same withdraw types the backend does", () => {
    compare(SYMBOL_TYPE_WITHDRAW_MAP, backendMap(source, "SYMBOL_TYPE_WITHDRAW_MAP", withdraws), "withdraw");
  });

  it("covers every symbol type the backend knows about", () => {
    const theirs = Object.keys(backendMap(source, "SYMBOL_TYPE_DEPOSIT_MAP", deposits)).sort();
    const mine = Object.keys(SYMBOL_TYPE_DEPOSIT_MAP)
      .map((value) => Object.keys(SymbolTypeEnum).find((k) => (SymbolTypeEnum as any)[k] === value))
      .sort();
    expect(mine).toEqual(theirs);
  });
});
