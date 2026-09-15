import { TalaabPricingVendor } from '../types/talaab.types';

/**
 * What a Pusher frame actually says.
 *
 * Talaab's prices arrive only as pushes on a subscribed channel, and the
 * engine used to log "Subscribed" the moment it *sent* the subscribe frame —
 * so a channel the server refused looked exactly like a channel with nothing
 * to say, and a shop sat open with an empty price list for hours. Every frame
 * is classified here, including the refusals and the ones the provider does
 * not act on, so the log can tell those two apart.
 */
export type PusherFrame =
  | { kind: 'connection_established'; socketId: string }
  | { kind: 'subscription_succeeded'; channel: string }
  | { kind: 'subscription_error'; channel: string; status: number | null; authRejected: boolean }
  | { kind: 'error'; code: number | null; message: string; authRejected: boolean }
  | { kind: 'pricing'; pricing: TalaabPricingVendor[] }
  | { kind: 'home_data'; fields: string[] }
  | { kind: 'pong' }
  | { kind: 'other'; event: string }
  | { kind: 'unreadable'; reason: string };

/**
 * Pusher close/error codes that mean the credential was refused.
 *
 * 4001 and 4003 are an app that is unknown or disabled, 4009 a connection the
 * server would not authorise. The rest of the 4000 range is about protocol
 * and quota, which a fresh login would not fix.
 */
const AUTH_CODES = new Set([4001, 4003, 4009]);
const AUTH_STATUSES = new Set([401, 403]);

function parse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function readPusherFrame(raw: string): PusherFrame {
  let envelope: Record<string, unknown>;
  try {
    envelope = asRecord(JSON.parse(raw));
  } catch {
    return { kind: 'unreadable', reason: 'frame was not JSON' };
  }

  const event = typeof envelope['event'] === 'string' ? envelope['event'] : '';
  const channel = typeof envelope['channel'] === 'string' ? envelope['channel'] : '';
  const data = asRecord(parse(envelope['data']));

  switch (event) {
    case 'pusher:connection_established': {
      const socketId = typeof data['socket_id'] === 'string' ? data['socket_id'] : '';
      return { kind: 'connection_established', socketId };
    }
    case 'pusher_internal:subscription_succeeded':
      return { kind: 'subscription_succeeded', channel };
    case 'pusher_internal:subscription_error':
    case 'pusher:subscription_error': {
      const status = typeof data['status'] === 'number' ? data['status'] : null;
      return {
        kind: 'subscription_error',
        channel,
        status,
        authRejected: status !== null && AUTH_STATUSES.has(status),
      };
    }
    case 'pusher:error': {
      const code = typeof data['code'] === 'number' ? data['code'] : null;
      const message = typeof data['message'] === 'string' ? data['message'] : 'no message';
      return { kind: 'error', code, message, authRejected: code !== null && AUTH_CODES.has(code) };
    }
    case 'pusher:pong':
      return { kind: 'pong' };
    default:
      break;
  }

  const message = asRecord(data['message']);
  const type = typeof message['type'] === 'string' ? message['type'] : '';

  if (type === 'all_systems_pricing_updated') {
    const payload = asRecord(message['data']);
    const pricing = Array.isArray(payload['pricing'])
      ? (payload['pricing'] as TalaabPricingVendor[])
      : [];
    return { kind: 'pricing', pricing };
  }
  if (type === 'home_data') {
    return { kind: 'home_data', fields: Object.keys(asRecord(message['data'])).slice(0, 12) };
  }

  return { kind: 'other', event: event || 'unnamed' };
}
