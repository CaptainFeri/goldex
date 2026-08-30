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
  const obj: Record<string, unknown> = { TYPE: type, ...fields };
  return safeStringify(obj);
}

export class StructuredLogger extends Logger {
  logStructured(type: string, fields: Record<string, unknown>): void {
    this.log(formatLog(type, fields));
  }
}
