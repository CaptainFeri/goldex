/**
 * Reading Zaryar's `ShopkeeperItemsList` answer.
 *
 * The call is the engine's only source of Zaryar metadata: the SignalR stream
 * carries prices keyed by item id and nothing else, so a shop whose item list
 * fails to parse ends up with live prices and no names for them. That failure
 * is silent by nature — the request succeeds, the body is well-formed JSON,
 * and only the field the parse expects is missing — so the parse says why it
 * found nothing rather than returning an empty list and leaving the log to
 * guess.
 */

import { MazaneItem } from '../types/zaryar.types';

export interface ZaryarRawItem {
  Id: number;
  Name?: string;
  FeeBuy?: number;
  FeeSell?: number;
  FeeBuyStr?: string;
  FeeSellStr?: string;
  BuyCanDeal?: boolean;
  SellCanDeal?: boolean;
  BuyRange?: number;
  SellRange?: number;
  MaxBuyCount?: number;
  MaxSellCount?: number;
  UpdatedTimeStr?: string;
  IBuy?: boolean;
  ISell?: boolean;
  IsShow?: boolean;
  [field: string]: unknown;
}

export interface ZaryarRawGroup {
  GroupName?: string;
  GroupId?: number;
  Items: ZaryarRawItem[];
}

export interface ZaryarItemsList {
  /** Groups found, each with at least one item. Empty when `failure` is set. */
  groups: ZaryarRawGroup[];
  /** What was wrong with the body, in words a log line can carry. */
  failure: string | null;
  /** The envelope declared the call itself unsuccessful. */
  rejected: boolean;
  /** The rejection was about the session, not about the request. */
  authRejected: boolean;
}

/** Envelope wording that means the session, not the request, was refused. */
const AUTH_WORDS =
  /unauthor|forbidden|not authenticated|invalid token|expired|لطفا وارد|احراز هویت|توکن|نشست|اعتبار ندارد/i;

const AUTH_STATUSES = new Set([401, 403]);

function keysOf(value: unknown): string {
  if (!value || typeof value !== 'object') return typeof value;
  const keys = Object.keys(value);
  return keys.length ? keys.slice(0, 8).join(', ') : 'no keys';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeGroup(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value['Items']);
}

function looksLikeItem(value: unknown): boolean {
  return (
    isRecord(value) && (typeof value['Id'] === 'number' || typeof value['ItemId'] === 'number')
  );
}

/** Items sent flat rather than grouped, folded back into their own groups. */
function groupFlatItems(items: Record<string, unknown>[]): ZaryarRawGroup[] {
  const byName = new Map<string, ZaryarRawGroup>();
  for (const raw of items) {
    const name = typeof raw['GroupName'] === 'string' ? raw['GroupName'] : '';
    const id = typeof raw['GroupId'] === 'number' ? raw['GroupId'] : undefined;
    const key = `${name}#${id ?? ''}`;
    const group = byName.get(key) ?? { GroupName: name, GroupId: id, Items: [] };
    const itemId = typeof raw['Id'] === 'number' ? raw['Id'] : (raw['ItemId'] as number);
    group.Items.push({ ...raw, Id: itemId });
    byName.set(key, group);
  }
  return [...byName.values()];
}

/**
 * Pull the group list out of whatever the API answered.
 *
 * Tolerant about where the list sits — grouped under `Data`, under
 * `Data.Groups`, or flat — because every one of those has been seen from a
 * .NET back end and none of them is worth a silent outage. Intolerant about
 * inventing content: anything else comes back as a stated failure.
 */
export function readZaryarItemsList(body: unknown): ZaryarItemsList {
  const empty = (failure: string, rejected = false, authRejected = false): ZaryarItemsList => ({
    groups: [],
    failure,
    rejected,
    authRejected,
  });

  if (!isRecord(body)) {
    return empty(`response body was ${Array.isArray(body) ? 'an array' : typeof body}`);
  }

  const success = body['IsSuccess'];
  const message = typeof body['Message'] === 'string' ? body['Message'] : '';
  const status = typeof body['StatusCode'] === 'number' ? body['StatusCode'] : null;

  if (success === false) {
    const auth = AUTH_WORDS.test(message) || (status !== null && AUTH_STATUSES.has(status));
    return empty(
      `provider answered IsSuccess=false${message ? `: ${message}` : ' with no message'}`,
      true,
      auth,
    );
  }

  const data = body['Data'];
  let candidate: unknown = data;
  if (isRecord(data)) {
    // A single group, or a wrapper around the list.
    if (Array.isArray(data['Groups'])) candidate = data['Groups'];
    else if (Array.isArray(data['Items'])) candidate = [data];
  }

  if (candidate === undefined || candidate === null) {
    return empty(`Data was ${candidate === null ? 'null' : 'absent'} (body keys: ${keysOf(body)})`);
  }
  if (!Array.isArray(candidate)) {
    return empty(`Data was ${typeof candidate} (keys: ${keysOf(candidate)})`);
  }
  if (candidate.length === 0) {
    return empty('Data was an empty list');
  }

  if (candidate.every(looksLikeItem) && !candidate.some(looksLikeGroup)) {
    return {
      groups: groupFlatItems(candidate as Record<string, unknown>[]),
      failure: null,
      rejected: false,
      authRejected: false,
    };
  }

  const groups = candidate.filter(looksLikeGroup).map((group) => {
    const record = group as Record<string, unknown>;
    return {
      GroupName: typeof record['GroupName'] === 'string' ? record['GroupName'] : '',
      GroupId: typeof record['GroupId'] === 'number' ? record['GroupId'] : undefined,
      Items: (record['Items'] as unknown[]).filter(looksLikeItem) as ZaryarRawItem[],
    };
  });

  const withItems = groups.filter((group) => group.Items.length > 0);
  if (withItems.length === 0) {
    return empty(
      `Data had ${candidate.length} entries but no items in them (first entry keys: ${keysOf(candidate[0])})`,
    );
  }

  return { groups: withItems, failure: null, rejected: false, authRejected: false };
}

/**
 * A catalogue row read as though it had arrived on the live stream.
 *
 * The REST list and the `update_mazane` push carry the same numbers under
 * slightly different names — `Id` against `ItemId` — so one mapping serves
 * both and a missing field falls back rather than reaching arithmetic as
 * `undefined`.
 */
export function toMazaneItem(raw: ZaryarRawItem): MazaneItem {
  return {
    ItemId: raw.Id,
    FeeBuy: raw.FeeBuy ?? 0,
    FeeSell: raw.FeeSell ?? 0,
    FeeBuyStr: raw.FeeBuyStr ?? '',
    FeeSellStr: raw.FeeSellStr ?? '',
    BuyCanDeal: raw.BuyCanDeal ?? false,
    SellCanDeal: raw.SellCanDeal ?? false,
    BuyRange: raw.BuyRange ?? 0,
    SellRange: raw.SellRange ?? 0,
    MaxBuyCount: raw.MaxBuyCount ?? 0,
    MaxSellCount: raw.MaxSellCount ?? 0,
    UpdatedTimeStr: raw.UpdatedTimeStr ?? '',
    IBuy: raw.IBuy,
    ISell: raw.ISell,
    IsShow: raw.IsShow,
  };
}
