// Rebuilds vendor/pdfjs/ from a mozilla/pdf.js tag with `gulp chromium`, keeps
// only the viewer (`content/`), checks that our patches still apply, then runs
// the unit tests.
//
//   node scripts/update-pdfjs.ts            # latest stable release
//   node scripts/update-pdfjs.ts v6.3.289   # a given tag
//   node scripts/update-pdfjs.ts --keep     # keep the temporary checkout
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkPatches } from "./pdfjs-patches.ts";

const root = resolve(import.meta.dirname, "..");
const vendorDir = join(root, "vendor", "pdfjs");
const args = process.argv.slice(2);
const keep = args.includes("--keep");

// npm and npx are run through node directly: no shell, no argument quoting issues.
const npmBin = (name: "npm" | "npx") => join(dirname(process.execPath), "node_modules", "npm", "bin", `${name}-cli.js`);

function run(cmd: string, cmdArgs: string[], cwd: string, env: NodeJS.ProcessEnv = {}): string {
  const [file, fileArgs] =
    cmd === "npm" || cmd === "npx" ? [process.execPath, [npmBin(cmd), ...cmdArgs]] : [cmd, cmdArgs];
  console.log(`$ ${cmd} ${cmdArgs.join(" ")}`);
  const res = spawnSync(file, fileArgs, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
  });
  if (res.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(" ")} failed (${res.status ?? res.error})`);
  return res.stdout;
}

async function latestTag(): Promise<string> {
  const res = await fetch("https://api.github.com/repos/mozilla/pdf.js/releases/latest", {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
  return ((await res.json()) as { tag_name: string }).tag_name;
}

const tag = args.find(a => a.startsWith("v")) ?? (await latestTag());
const work = mkdtempSync(join(tmpdir(), `noctpdf-pdfjs-${tag}-`));
try {
  const src = join(work, "pdf.js");
  // PDF.js derives its build number from the commit count since a base
  // commit: a --depth 1 clone yields "6.3.0" instead of "6.3.289". A treeless
  // partial clone keeps every commit but downloads trees only when needed.
  run(
    "git",
    [
      "clone",
      "--quiet",
      "--filter=tree:0",
      "--single-branch",
      "--branch",
      tag,
      "https://github.com/mozilla/pdf.js.git",
      src,
    ],
    work,
  );
  run("git", ["-c", "advice.detachedHead=false", "checkout", "--quiet", tag], src);
  const commit = run("git", ["rev-parse", "HEAD"], src).trim();
  run("npm", ["ci", "--no-audit", "--no-fund", "--loglevel=error"], src, { PUPPETEER_SKIP_DOWNLOAD: "1" });
  run("npx", ["gulp", "chromium"], src);

  const built = join(src, "build", "chromium", "content");
  if (!existsSync(join(built, "web", "viewer.html"))) throw new Error("gulp chromium produced no viewer");
  const version = /^const version = "([^"]+)";$/m.exec(readFileSync(join(built, "build", "pdf.mjs"), "utf8"))?.[1];
  if (version !== tag.replace(/^v/, "")) throw new Error(`built version ${version} does not match tag ${tag}`);

  // Refuse to replace the vendored copy if our patches no longer apply.
  const problems = checkPatches(built);
  if (problems.length) throw new Error(`Patches do not apply to ${tag}:\n${problems.join("\n")}`);

  rmSync(join(vendorDir, "content"), { recursive: true, force: true });
  cpSync(built, join(vendorDir, "content"), { recursive: true });
  cpSync(join(src, "LICENSE"), join(vendorDir, "LICENSE"));
  writeFileSync(
    join(vendorDir, "VERSION.json"),
    JSON.stringify({ tag, version, commit, build: "gulp chromium", kept: "build/chromium/content" }, null, 2) + "\n",
  );
  console.log(`vendor/pdfjs updated to ${tag} (${commit.slice(0, 10)})`);
} finally {
  if (keep) console.log(`checkout kept in ${work}`);
  else rmSync(work, { recursive: true, force: true });
}

run("npm", ["test"], root);
