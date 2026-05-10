/**
 * scripts/run-all-probes.ts — Phase 72e probe registry runner.
 *
 * Lists and optionally runs every probe in scripts/probes/. Usage:
 *
 *   # List all probes (read-only):
 *   npx tsx scripts/run-all-probes.ts --list
 *
 *   # Run all probes sequentially; report pass/fail:
 *   npx tsx scripts/run-all-probes.ts --run
 *
 *   # Run a specific probe by name:
 *   npx tsx scripts/run-all-probes.ts --run phase70_diagnostic_compare
 *
 * Probes are independent scripts. This runner just spawns them in
 * sequence and aggregates exit codes. A probe is considered "passing"
 * if its exit code is 0.
 */

import { readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROBES_DIR = resolve(__dirname, "probes");

interface ProbeEntry {
  name: string;
  path: string;
}

function listProbes(): ProbeEntry[] {
  const files = readdirSync(PROBES_DIR).filter((f) => f.endsWith(".ts"));
  return files
    .sort()
    .map((f) => ({ name: f.replace(/\.ts$/, ""), path: join(PROBES_DIR, f) }));
}

function runProbe(probe: ProbeEntry, timeoutMs = 600000): { ok: boolean; ms: number; stderr: string } {
  const start = Date.now();
  const result = spawnSync("npx", ["tsx", probe.path], {
    encoding: "utf-8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ms = Date.now() - start;
  return {
    ok: result.status === 0,
    ms,
    stderr: result.stderr ?? "",
  };
}

const args = process.argv.slice(2);
const mode = args[0] ?? "--list";

const probes = listProbes();

if (mode === "--list") {
  console.log(`Found ${probes.length} probes in ${PROBES_DIR}:`);
  for (const p of probes) console.log(`  ${p.name}`);
  process.exit(0);
}

if (mode === "--run") {
  const filter = args[1];
  const toRun = filter
    ? probes.filter((p) => p.name.includes(filter))
    : probes;
  if (toRun.length === 0) {
    console.error(`No probes match filter: ${filter}`);
    process.exit(1);
  }
  console.log(`Running ${toRun.length} probe(s):\n`);
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];
  for (const probe of toRun) {
    process.stdout.write(`  ${probe.name}... `);
    const { ok, ms } = runProbe(probe);
    if (ok) {
      console.log(`✓ (${ms}ms)`);
      passed++;
    } else {
      console.log(`✗ (${ms}ms)`);
      failures.push(probe.name);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failures.length > 0) {
    console.log(`\nFailed probes:`);
    for (const f of failures) console.log(`  ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

console.error(`Unknown mode: ${mode}. Use --list or --run.`);
process.exit(1);
