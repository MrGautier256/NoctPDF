import * as v from "valibot";
import { DEFAULT_SETTINGS } from "./defaults";
import { SETTINGS_VERSION, SettingsSchema, type Settings, type SettingsSection } from "./schema";

type Raw = Record<string, unknown>;

/**
 * MIGRATIONS[n] turns version n into version n + 1. Keep every step forever:
 * a user can come back after skipping many releases.
 */
export const MIGRATIONS: Readonly<Record<number, (s: Raw) => Raw>> = {
  // 1 -> 2 goes here when the shape first changes.
};

export class SettingsFromTheFutureError extends Error {}

export function migrate(raw: Raw, migrations = MIGRATIONS, target = SETTINGS_VERSION): Raw {
  let s = raw;
  let version = typeof s.version === "number" ? s.version : target;
  if (version > target) {
    // Written by a newer release (sync from another device): do not guess.
    throw new SettingsFromTheFutureError(`settings version ${version} > ${target}`);
  }
  while (version < target) {
    const step = migrations[version];
    if (!step) throw new Error(`no migration from settings version ${version}`);
    s = { ...step(s), version: version + 1 };
    version++;
  }
  return { ...s, version: target };
}

const isObject = (x: unknown): x is Raw => typeof x === "object" && x !== null && !Array.isArray(x);

export interface ParseResult {
  settings: Settings;
  /** Sections that were invalid and fell back to their defaults. */
  resetSections: SettingsSection[];
}

/**
 * Turns whatever is in storage into valid settings. Missing keys take their
 * default; a section that still fails validation is reset on its own, so one
 * bad value never wipes the whole configuration.
 */
export function parseSettings(stored: unknown): ParseResult {
  if (!isObject(stored)) return { settings: structuredClone(DEFAULT_SETTINGS), resetSections: [] };
  let raw: Raw;
  try {
    raw = migrate(stored);
  } catch (e) {
    if (e instanceof SettingsFromTheFutureError) {
      // Keep what we understand, ignore the rest.
      raw = { ...stored, version: SETTINGS_VERSION };
    } else {
      return { settings: structuredClone(DEFAULT_SETTINGS), resetSections: [] };
    }
  }

  const out: Raw = { version: SETTINGS_VERSION };
  const resetSections: SettingsSection[] = [];
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (key === "version") continue;
    const def = DEFAULT_SETTINGS[key];
    const val = raw[key];
    const candidate = isObject(def) && isObject(val) ? { ...def, ...val } : (val ?? def);
    const entry = SettingsSchema.entries[key];
    const res = v.safeParse(entry, candidate);
    if (res.success) {
      out[key] = res.output;
    } else {
      out[key] = structuredClone(def);
      resetSections.push(key);
    }
  }
  return { settings: v.parse(SettingsSchema, out), resetSections };
}
