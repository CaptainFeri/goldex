const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const PROJECTS = [
  { dir: "goldex-backend", src: "src" },
  { dir: "goldex-pricing-engine", src: "src" },
  { dir: "goldex-cbp", src: "src" },
  { dir: "goldex-telegram-bot", src: "src" },
];

function walk(dir, out = [], ext = ".entity.ts") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out, ext);
    else if (e.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function matchParen(src, openIdx) {
  let depth = 0;
  let i = openIdx;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  return { text: src.slice(openIdx, i + 1), end: i + 1 };
}

function extractDecorators(src) {
  const decs = [];
  const re = /@([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    let args = "";
    let end = m.index + m[0].length;
    if (src[end] === "(") {
      const p = matchParen(src, end);
      args = p.text.slice(1, -1);
      end = p.end;
    }
    decs.push({ name, args, start: m.index, end });
  }
  return decs;
}

function parseStr(args, key) {
  const re = new RegExp(key + "\\s*:\\s*(['\"])([^'\"]*)\\1");
  const m = re.exec(args);
  return m ? m[2] : undefined;
}

function parseBool(args, key) {
  return new RegExp(key + "\\s*:\\s*true\\b").test(args);
}

function parseNum(args, key) {
  const m = new RegExp(key + "\\s*:\\s*(-?\\d+)").exec(args);
  return m ? m[1] : undefined;
}

function parseDefault(args) {
  const qu = /default\s*:\s*(['"])([^'"]*)\1/.exec(args);
  if (qu) return qu[2];
  const nu = /default\s*:\s*(-?\d+(?:\.\d+)?)/.exec(args);
  if (nu) return nu[1];
  const bo = /default\s*:\s*(true|false)\b/.exec(args);
  if (bo) return bo[1];
  const id = /default\s*:\s*([A-Za-z_$][\w$.]*)/.exec(args);
  if (id) return id[1];
  const arr = /default\s*:\s*(\[\]|\{\})/.exec(args);
  if (arr) return arr[1];
  return undefined;
}

function sanitize(s) {
  if (s == null) return "";
  return String(s).replace(/['"]/g, "").replace(/[\r\n]+/g, " ").trim();
}

const TYPEORM_TO_DBML = {
  varchar: "varchar",
  "character varying": "varchar",
  char: "varchar",
  text: "text",
  int: "int",
  integer: "int",
  int4: "int",
  serial: "int",
  bigint: "int8",
  int8: "int8",
  bigserial: "int8",
  smallint: "smallint",
  int2: "smallint",
  decimal: "decimal",
  numeric: "decimal",
  real: "float",
  float: "float",
  "double precision": "float",
  boolean: "boolean",
  bool: "boolean",
  jsonb: "jsonb",
  json: "jsonb",
  "simple-json": "jsonb",
  timestamp: "timestamp",
  timestamptz: "timestamptz",
  datetime: "timestamp",
  date: "date",
  time: "time",
  uuid: "uuid",
  enum: "enum",
  interval: "interval",
};

function inferType(annotation, opts) {
  if (opts.type) return TYPEORM_TO_DBML[opts.type] || opts.type;
  const a = (annotation || "").replace(/\s+/g, "");
  if (a.includes("[]") || /^Record</.test(a)) return "jsonb";
  if (/^(?:Date|any)(?:\||$)/.test(a)) return opts.colType || "timestamp";
  if (/^(?:number|Number)(?:\||$)/.test(a)) return "int";
  if (/^(?:boolean)(?:\||$)/.test(a)) return "boolean";
  return "varchar";
}

function formatType(type, opts) {
  if (opts.type === "decimal" || opts.type === "numeric") {
    if (opts.precision && opts.scale) return `decimal(${opts.precision},${opts.scale})`;
    return "decimal";
  }
  if (type === "varchar" && opts.length) return `varchar(${opts.length})`;
  return type || "varchar";
}

function parseEnumBlocks(src) {
  const enums = {};
  const re = /export\s+enum\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const values = [];
    for (const line of m[2].split("\n")) {
      const vm = /^\s*([A-Za-z_$][\w$]*)\s*(?:=\s*([^,]+))?,?\s*$/.exec(line);
      if (vm) values.push({ key: vm[1], val: vm[2] ? vm[2].trim() : undefined });
    }
    enums[m[1]] = values;
  }
  return enums;
}

function resolveEnumDefault(def, en, enumMap) {
  const m = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(def);
  let enumName = m ? m[1] : en;
  let member = m ? m[2] : def;
  const vals = enumMap[enumName];
  if (!vals) return m ? member : def;
  const hit = vals.find((v) => v.key === member);
  if (!hit) return m ? member : def;
  if (hit.val === undefined) return hit.key;
  return hit.val.replace(/^['"]|['"]$/g, "");
}

function parseEntityFile(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const decs = extractDecorators(src);

  const entityDeco = decs.find((d) => d.name === "Entity");
  if (!entityDeco) return null;
  const tableMatch = entityDeco.args.trim().match(/^['"]([^'"]+)['"]/);

  const classDeco = /export\s+class\s+(\w+)(?:\s+extends\s+(\w+))?[^{]*\{/g.exec(src);
  if (!classDeco) return null;
  const className = classDeco[1];
  const extendsBase = classDeco[2] || "";
  const openBraceIdx = classDeco.index + classDeco[0].lastIndexOf("{");
  const classDecos = decs.filter((d) => d.end <= openBraceIdx);
  const propDecos = decs.filter((d) => d.start > openBraceIdx);
  const tableName = tableMatch ? tableMatch[1] : className;

  const indexes = [];
  for (const d of classDecos) {
    if (d.name === "Index") {
      const colsRe = /\[([^\]]*)\]/.exec(d.args);
      const cols = colsRe
        ? colsRe[1].split(",").map((s) => s.trim().replace(/^['"`]|['"`]$/g, "")).filter(Boolean)
        : [];
      if (cols.length) indexes.push({ cols, unique: parseBool(d.args, "unique") });
    }
  }

  let codeOnly = src;
  for (const d of decs) {
    codeOnly = codeOnly.slice(0, d.start) + " ".repeat(d.end - d.start) + codeOnly.slice(d.end);
  }

  const columns = [];
  const relations = [];
  const propIndexes = [];
  const propRe = /^[ \t]*(\w+\??!?)\s*:\s*([\s\S]*?);/gm;
  let pm;
  let cursor = 0;

  while ((pm = propRe.exec(codeOnly))) {
    const propStart = pm.index;
    const propEnd = pm.index + pm[0].length;
    if (propStart <= openBraceIdx) continue;
    const name = pm[1].replace(/[?!]$/, "");
    const annotation = pm[2].replace(/=.*$/, "").trim();
    const own = propDecos.filter((d) => d.start > cursor && d.start < propStart);
    cursor = propEnd;

    const pkDeco = own.find((d) => d.name === "PrimaryGeneratedColumn");
    if (pkDeco) {
      columns.push({ name: "id", type: /uuid/i.test(pkDeco.args) ? "uuid" : "int", pk: true });
      continue;
    }

    const relDeco = own.find((d) => ["ManyToOne", "OneToOne", "OneToMany", "ManyToMany"].includes(d.name));
    if (relDeco) {
      const targetMatch = /=>\s*([A-Za-z_$][\w$]*)/.exec(relDeco.args);
      const joinCol = own.find((d) => d.name === "JoinColumn");
      const jm = joinCol ? /name\s*:\s*['"]([^'"]+)['"]/.exec(joinCol.args) : null;
      relations.push({
        kind: relDeco.name,
        propName: name,
        target: targetMatch ? targetMatch[1] : undefined,
        joinCols: jm ? [jm[1]] : [],
      });
      continue;
    }

    if (own.some((d) => d.name === "Column" || d.name === "CreateDateColumn" || d.name === "UpdateDateColumn" || d.name === "DeleteDateColumn")) {
      const colDeco = own.find((d) => d.name === "Column");
      const tsDeco = own.find((d) => ["CreateDateColumn", "UpdateDateColumn", "DeleteDateColumn"].includes(d.name));
      const idxDeco = own.find((d) => d.name === "Index");
      const args = (colDeco || tsDeco).args;
      const bareTypeRe = /^\s*['"]?([A-Za-z0-9_\- ]+)['"]?\s*,\s*\{/.exec(args);
      const opts = {
        name: parseStr(args, "name"),
        type: parseStr(args, "type") || (bareTypeRe ? bareTypeRe[1].trim() : undefined),
        nullable: parseBool(args, "nullable"),
        unique: parseBool(args, "unique") || (idxDeco ? parseBool(idxDeco.args, "unique") : false),
        primary: parseBool(args, "primary"),
        length: parseNum(args, "length"),
        precision: parseNum(args, "precision"),
        scale: parseNum(args, "scale"),
        enum: /enum\s*:\s*([A-Za-z_$][\w$]*)/.exec(args)?.[1],
        default: parseDefault(args),
        colType: tsDeco ? "timestamptz" : undefined,
      };
      opts.type = opts.type || opts.colType;
      const colName = opts.name || name;
      const type = inferType(annotation, opts);
      const flags = [];
      if (opts.primary) flags.push("pk");
      if (opts.unique) flags.push("unique");
      if (tsDeco || opts.nullable) flags.push("null");
      else flags.push("not null");
      columns.push({ name: colName, type: formatType(type, opts), flags, def: opts.default, en: opts.enum });
      if (idxDeco && !opts.unique) propIndexes.push([colName]);
    }
  }

  if (extendsBase === "myBaseEntity") {
    columns.unshift({ name: "id", type: "uuid", pk: true });
    for (const t of ["created_at", "updated_at", "deleted_at"]) {
      columns.push({ name: t, type: "timestamptz", flags: ["null"] });
    }
  } else if (extendsBase === "MyLocalBaseEntity") {
    columns.unshift({ name: "id", type: "int", pk: true });
    for (const t of ["created_at", "updated_at", "deleted_at"]) {
      columns.push({ name: t, type: "timestamptz", flags: ["null"] });
    }
  }

  if (!columns.some((c) => c.pk)) {
    const idCol = columns.find((c) => c.name === "id");
    if (idCol) idCol.pk = true;
  }

  return {
    className,
    tableName,
    columns,
    relations,
    indexes,
    propIndexes,
    source: path.relative(ROOT, filePath),
  };
}

function main() {
  for (const proj of PROJECTS) {
    const projDir = path.join(ROOT, proj.dir);
    const srcDir = path.join(projDir, proj.src);
    const files = walk(srcDir);
    const classToTable = {};
    const defs = [];

    for (const f of files) {
      const def = parseEntityFile(f);
      if (def) {
        defs.push(def);
        classToTable[def.className] = def;
      }
    }

    defs.sort((a, b) => a.tableName.localeCompare(b.tableName));

    const enumMap = {};
    for (const f of walk(srcDir, [], ".ts")) {
      Object.assign(enumMap, parseEnumBlocks(fs.readFileSync(f, "utf8")));
    }
    for (const d of defs) {
      for (const c of d.columns) if (c.en && enumMap[c.en]) c.enVals = enumMap[c.en];
    }

    const refs = [];
    const refSeen = new Set();
    for (const d of defs) {
      for (const r of d.relations) {
        const target = classToTable[r.target];
        if (!target) continue;
        if (r.kind !== "ManyToOne" && r.kind !== "OneToOne") continue;
        if (r.kind === "OneToOne" && !r.joinCols.length) continue;
        const colName = r.joinCols[0] || `${r.propName}Id`;
        if (!d.columns.some((c) => c.name === colName)) {
          const targetPk = target.columns.find((c) => c.pk);
          d.columns.push({ name: colName, type: targetPk ? targetPk.type.replace(/^enum:.*/, "uuid") : "uuid", flags: ["null"] });
        }
        const key = `${d.tableName}.${colName} > ${target.tableName}.id`;
        if (!refSeen.has(key)) {
          refSeen.add(key);
          refs.push(key);
        }
      }
    }
    refs.sort();

    let out = "";
    out += `Project ${proj.dir} {\n`;
    out += `  database_type: 'PostgreSQL'\n`;
    out += `  Note: 'Auto-generated from TypeORM entities (tools/generate-erd-dbml.js). Import to dbdiagram.io'\n`;
    out += `}\n\n`;

    const emittedEnums = new Set();
    for (const d of defs) {
      for (const c of d.columns) {
        if (c.en && !emittedEnums.has(c.en)) {
          emittedEnums.add(c.en);
          out += `Enum ${c.en} {\n`;
          for (const v of enumMap[c.en] || []) {
            out += `  ${v.key}${v.val ? ` [note: '${sanitize(v.val)}']` : ""}\n`;
          }
          out += `}\n\n`;
        }
      }
    }

    for (const d of defs) {
      out += `Table ${d.tableName} {\n`;
      for (const c of d.columns) {
        const attr = [];
        for (const f of c.flags || []) if (!attr.includes(f) && f !== "not null" && f !== "null") attr.push(f);
        let def = c.def;
        if (def !== undefined && (c.en || /^(\w+)\.(\w+)$/.test(def))) {
          def = resolveEnumDefault(def, c.en, enumMap);
        }
        if (def !== undefined) attr.push(/^-?\d+(?:\.\d+)?$/.test(def) ? `default: ${def}` : `default: '${sanitize(def)}'`);
        const colType = c.en ? (enumMap[c.en] ? c.en : "varchar") : c.type;
        const suffix = attr.length ? ` [${attr.join(", ")}]` : "";
        out += `  ${c.name} ${colType}${suffix}\n`;
      }
      const allIdx = d.indexes.concat(d.propIndexes.map((c) => ({ cols: c, unique: false })));
      if (allIdx.length) {
        out += "  indexes {\n";
        const colNames = new Set(d.columns.map((c) => c.name));
        for (const i of allIdx) {
          const cl = i.cols
            .map((cn) => {
              if (colNames.has(cn)) return cn;
              const snake = cn.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
              if (colNames.has(snake)) return snake;
              return cn;
            })
            .join(", ");
          out += `    (${cl})${i.unique ? " [unique]" : ""}\n`;
        }
        out += "  }\n";
      }
      out += `}\n\n`;
    }

    for (const r of refs) out += `Ref: ${r}\n`;

    const docsDir = path.join(projDir, "docs", "erd");
    fs.mkdirSync(docsDir, { recursive: true });
    const outFile = path.join(docsDir, `${proj.dir}.dbml`);
    fs.writeFileSync(outFile, out, "utf8");
    console.log(`${proj.dir}: ${defs.length} entities, ${refs.length} refs -> ${outFile}`);
  }
}

main();