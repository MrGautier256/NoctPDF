import { parseSettings, type ParseResult } from "./migrations";
import type { Settings } from "./schema";

/** The subset of chrome.storage.StorageArea we rely on (easy to fake in tests). */
export interface KeyValueArea {
  get(keys: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/**
 * Settings live in storage.sync under our own prefix: the PDF.js viewer keeps
 * its preferences at the root of the same area. storage.sync caps each item
 * at 8192 bytes (key + JSON value), so the JSON is split into chunks.
 */
export const SETTINGS_PREFIX = "noctpdf.settings";
const META_KEY = `${SETTINGS_PREFIX}.meta`;
const chunkKey = (i: number) => `${SETTINGS_PREFIX}.${i}`;
export const SYNC_QUOTA_BYTES_PER_ITEM = 8192;

interface Meta {
  chunks: number;
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** Splits `json` so that every (key, JSON.stringify(chunk)) pair fits the quota. */
export function splitIntoChunks(json: string, quota = SYNC_QUOTA_BYTES_PER_ITEM): string[] {
  const chunks: string[] = [];
  let rest = json;
  while (rest.length) {
    const key = chunkKey(chunks.length);
    let size = Math.min(rest.length, quota);
    while (size > 1 && byteLength(key) + byteLength(JSON.stringify(rest.slice(0, size))) > quota) {
      size = Math.floor(size * 0.8);
    }
    // Do not cut a surrogate pair in two.
    const code = rest.charCodeAt(size - 1);
    if (code >= 0xd800 && code <= 0xdbff && size < rest.length) size--;
    chunks.push(rest.slice(0, size));
    rest = rest.slice(size);
  }
  return chunks.length ? chunks : [""];
}

export async function readSettings(area: KeyValueArea): Promise<ParseResult> {
  const meta = (await area.get([META_KEY]))[META_KEY] as Meta | undefined;
  if (!meta || !Number.isInteger(meta.chunks) || meta.chunks < 1) return parseSettings(undefined);
  const keys = Array.from({ length: meta.chunks }, (_, i) => chunkKey(i));
  const items = await area.get(keys);
  const parts = keys.map(k => items[k]);
  if (parts.some(p => typeof p !== "string")) return parseSettings(undefined);
  try {
    return parseSettings(JSON.parse(parts.join("")));
  } catch {
    return parseSettings(undefined);
  }
}

export async function writeSettings(area: KeyValueArea, settings: Settings): Promise<void> {
  const chunks = splitIntoChunks(JSON.stringify(settings));
  const oldMeta = (await area.get([META_KEY]))[META_KEY] as Meta | undefined;
  const items: Record<string, unknown> = { [META_KEY]: { chunks: chunks.length } satisfies Meta };
  chunks.forEach((c, i) => (items[chunkKey(i)] = c));
  // Chunks first, meta last is not atomic either; storage.set of one object is.
  await area.set(items);
  const stale = [];
  for (let i = chunks.length; i < (oldMeta?.chunks ?? 0); i++) stale.push(chunkKey(i));
  if (stale.length) await area.remove(stale);
}

/** True when a storage.onChanged event touched our settings. */
export const isSettingsChange = (changedKeys: string[]) => changedKeys.some(k => k.startsWith(SETTINGS_PREFIX));
