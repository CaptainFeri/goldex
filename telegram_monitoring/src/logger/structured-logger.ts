import { Logger } from '@nestjs/common';

function safeStringify(value: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    return val;
  });
}

export function formatLog(
  type: string,
  fields: Record<string, unknown>,
): string {
  const lines = ['{'];
  lines.push(`      - TYPE: '${type}',`);
  for (const [key, value] of Object.entries(fields)) {
    const formatted =
      typeof value === 'string' ? `'${value}'` : safeStringify(value);
    lines.push(`      - ${key}: ${formatted},`);
  }
  lines.push('      }');
  return `\n${lines.join('\n')}`;
}

export class StructuredLogger extends Logger {
  logStructured(type: string, fields: Record<string, unknown>): void {
    this.log(formatLog(type, fields));
  }
}
