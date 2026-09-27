// Minimal patches on the vendored PDF.js viewer. vendor/pdfjs/ stays pristine:
// patches are applied to the copy that goes into the build output.
//
// A patch inserts text right after an anchor that must appear exactly once.
// That is sturdier than line-based diffs when PDF.js reformats its files.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface PdfjsPatch {
  name: string;
  description: string;
  /** Path relative to the `content/` directory. */
  file: string;
  anchor: string;
  insertAfter: string;
}

const patchesDir = resolve(import.meta.dirname, "..", "patches", "pdfjs");

export function loadPatches(): PdfjsPatch[] {
  return readdirSync(patchesDir)
    .filter(f => f.endsWith(".json"))
    .sort()
    .map(f => ({ name: f, ...(JSON.parse(readFileSync(join(patchesDir, f), "utf8")) as Omit<PdfjsPatch, "name">) }));
}

function count(haystack: string, needle: string): number {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** Applies one patch to a file's text. Throws unless the anchor is unique. */
export function applyPatch(text: string, patch: PdfjsPatch): string {
  const n = count(text, patch.anchor);
  if (n !== 1) throw new Error(`${patch.name}: anchor found ${n} times in ${patch.file}`);
  const at = text.indexOf(patch.anchor) + patch.anchor.length;
  return text.slice(0, at) + patch.insertAfter + text.slice(at);
}

/** Patched contents for every file touched by a patch, keyed by file. */
export function patchedFiles(contentDir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const patch of loadPatches()) {
    const current = out.get(patch.file) ?? readFileSync(join(contentDir, patch.file), "utf8");
    out.set(patch.file, applyPatch(current, patch));
  }
  return out;
}

/** Returns one message per patch that would not apply (empty when all apply). */
export function checkPatches(contentDir: string): string[] {
  const problems: string[] = [];
  for (const patch of loadPatches()) {
    try {
      applyPatch(readFileSync(join(contentDir, patch.file), "utf8"), patch);
    } catch (e) {
      problems.push((e as Error).message);
    }
  }
  return problems;
}
