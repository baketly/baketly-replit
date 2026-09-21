// Runs the server's unit tests.
//
// The source is written for a bundler — folder imports, extensionless paths —
// so the tests are bundled the same way the server is and then handed to
// node's own test runner. That keeps the test files looking like every other
// file in src rather than carrying import paths nothing else uses.

import { spawn } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.resolve(root, "dist-tests");

/** Every *.test.ts under src. */
async function findTests(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await findTests(full)));
    else if (entry.name.endsWith(".test.ts")) found.push(full);
  }
  return found;
}

const tests = await findTests(path.resolve(root, "src"));
if (tests.length === 0) {
  console.log("No tests found.");
  process.exit(0);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: tests,
  platform: "node",
  format: "esm",
  bundle: true,
  outdir: outDir,
  outExtension: { ".js": ".mjs" },
  logLevel: "error",
  // node's test runner and anything that reaches the database stay external
  external: ["node:*", "pg", "drizzle-orm", "@workspace/db", "pino"],
});

// node's runner takes files; handed a bare directory it tries to import it
const built = (await readdir(outDir, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
  .map((entry) => path.join(entry.parentPath || outDir, entry.name));

const child = spawn(process.execPath, ["--test", ...built], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
