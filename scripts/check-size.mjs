#!/usr/bin/env node
// Verify gzip-compressed bundle size per subpath stays under budget.
// Run after `pnpm build`; fails the publish if any entry exceeds.

import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const budgets = {
  // v0.1.0 base: ~557 B gzip. v0.3.0 additions:
  //   • onOverflow if-chain + take() helper: ~30–40 B.
  //   • 'grow' re-alloc loop: ~25–35 B.
  //   • borrow() sync path (try/catch + instanceof): ~45–60 B.
  //   • borrow() async + abort (listener + latch + pre-abort + reject): ~70–95 B.
  //   NullPool / Omit / overloads are types-only — 0 runtime bytes.
  // v0.3.1: budget raised from 850 B to 900 B to accommodate F1/F2 correctness
  // fixes (immediate-abort guard + atomic grow temp array); messages retained.
  // wave 2026-06-10: 900 B -> 950 B (leader-ratified). +70 B gzip measured
  // (869 -> 939 B): POL-S-02 onOverflow construction validation, POL-B-01
  // avail-membership guard on the cold overflow path, POL-R-02 grow-from-zero.
  // Error messages already minimal; ~11 B margin keeps the creep gate tight.
  // 0.6.0: 950 B -> 1,050 B (maintainer-approved for the 0.6.0 minor, ai*js
  // size-budget decision). Measured 950 -> 1,048 B gzip. Bytes consumed by the
  // four 0.6.0 validation throws plus the borrow() argument gate:
  //   • createPool: `create must be a function` / `reset must be a function`.
  //   • create() returning null/undefined, at construction and in 'grow'
  //     (shared make() helper).
  //   • function onOverflow handler returning null/undefined.
  //   • borrow(): `fn must be a function` and the duck-typed signal gate that
  //     closes the slot leak for a signal without removeEventListener.
  // Offsetting trims first: one bad() thrower adds the `aipooljs: ` prefix,
  // the dead take() undefined guard and the redundant `{ once: true }` are gone,
  // and options destructure through Object() instead of a separate gate.
  "dist/index.js": 1050,
};

const failures = [];
for (const [rel, max] of Object.entries(budgets)) {
  const abs = resolve(root, rel);
  let buf;
  try {
    buf = await readFile(abs);
  } catch {
    failures.push(`${rel}: missing (did you run pnpm build?)`);
    continue;
  }
  const gz = gzipSync(buf).length;
  const pct = ((gz / max) * 100).toFixed(0);
  const tag = gz > max ? "FAIL" : "ok  ";
  console.log(`[${tag}] ${rel.padEnd(28)} gz ${String(gz).padStart(5)} B / ${max} B (${pct}%)`);
  if (gz > max) failures.push(`${rel}: ${gz} B > ${max} B budget`);
}

if (failures.length > 0) {
  console.error("\ncheck-size: bundle budget exceeded:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`\ncheck-size: all ${Object.keys(budgets).length} entries within budget.`);
