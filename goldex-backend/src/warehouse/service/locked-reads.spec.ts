import { readFileSync } from "fs";
import { join } from "path";

/**
 * No locked read may ask for a relation.
 *
 * `relations` makes TypeORM emit a LEFT JOIN, and Postgres refuses `FOR UPDATE`
 * on the nullable side of one:
 *
 *   FOR UPDATE cannot be applied to the nullable side of an outer join
 *
 * It is a runtime failure with nothing to warn about it beforehand — it type
 * checks, and a unit test that mocks the entity manager never reaches the SQL.
 * The warehouse takes row locks on almost every write path, so this reads the
 * source instead and fails the build rather than the admin's request.
 *
 * The fix when this trips is always the same: drop `relations` from the locked
 * read and load what you need in a separate query, which wants no lock anyway.
 */
const FILES = [
  "warehouse-request.service.ts",
  "packet.service.ts",
  "warehouse.service.ts",
  "allocation.service.ts",
];

/** Option blocks of a `find`/`findOne` call, as written in the source. */
function findOptionBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /\.(?:find|findOne)\(\s*/g;

  for (let match = re.exec(source); match; match = re.exec(source)) {
    // Walk from the call's opening paren to its match, so nested braces and
    // parentheses inside the options do not end the block early.
    let depth = 0;
    let i = source.indexOf("(", match.index);
    const start = i;

    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    blocks.push(source.slice(start, i + 1));
  }
  return blocks;
}

describe("locked reads", () => {
  it.each(FILES)("%s takes no row lock through a join", (file) => {
    const source = readFileSync(join(__dirname, file), "utf8");

    const offenders = findOptionBlocks(source).filter(
      (block) => block.includes("lock:") && block.includes("relations:"),
    );

    expect(offenders).toEqual([]);
  });

  it("recognises the shape it is meant to catch", () => {
    // Guards the matcher itself: a test that cannot fail protects nothing.
    const bad = `
      await manager.findOne(PacketEntity, {
        where: { id },
        lock: { mode: "pessimistic_write" },
        relations: { warehouse: true },
      });
    `;
    const blocks = findOptionBlocks(bad);
    expect(blocks.filter((b) => b.includes("lock:") && b.includes("relations:"))).toHaveLength(1);
  });

  it("does not flag an unlocked read that loads relations", () => {
    const fine = `
      await repo.find({ where: { id }, relations: { warehouse: true } });
    `;
    const blocks = findOptionBlocks(fine);
    expect(blocks.filter((b) => b.includes("lock:") && b.includes("relations:"))).toHaveLength(0);
  });
});
