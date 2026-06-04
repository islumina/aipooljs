# Code Review — aipooljs

| Field       | Value                                      |
|-------------|---------------------------------------------|
| Repo        | aipooljs                                    |
| Version     | 0.5.1                                       |
| Branch      | claude/adoring-ptolemy-OGonc               |
| Head SHA    | 838c72d771628312bda3b6cf6edb3f6012b65fb1   |
| Date        | 2026-06-03                                  |
| Reviewer    | sonnet                                      |

---

## Verdict / Summary

The implementation is **solid and production-ready** for its stated scope. The core acquire/release stack is O(1), the `Set`-based double-release detector is correct, dispose is properly idempotent, the overflow-mode dispatch is complete, and the `borrow()` try/finally + AbortSignal machinery is well-tested (20 borrow tests covering edge cases including synchronous-abort, dispose-during-borrow, latch correctness, and thenable dispatch).

Three safe doc fixes were applied: the status line in both README files still declared "0.3.0 published" (stale by two minor versions); STABILITY.md still counted "6 invariants" after INV7 (dispose-during-borrow) was added in 0.5.1 and needed to be listed. No source code, API, or behavior changes were made.

Six findings are logged for the backlog (no safe-fixable runtime issues found).

---

## Gate Results

### Baseline (before fixes)

| Gate              | Result | Key output                                           |
|-------------------|--------|------------------------------------------------------|
| `typecheck`       | PASS   | No errors (src + test)                               |
| `lint`            | PASS   | Checked 5 files in ~18ms. No fixes applied.          |
| `build`           | PASS   | ESM 1.69 KB / CJS 1.71 KB / DTS 8.63 KB             |
| `verify:exports`  | PASS   | 1 subpath resolved                                   |
| `verify:llms`     | PASS   | llms-full.txt up-to-date (20.0 KB)                   |
| `check:size`      | PASS   | dist/index.js gz 867 B / 900 B budget (96%)          |
| `coverage`        | PASS   | Stmts 98.92% / Branch 92.1% / Funcs 100% / Lines 100% (thresholds 95/90/100/100) |

### After fixes

| Gate              | Result | Key output                                           |
|-------------------|--------|------------------------------------------------------|
| `typecheck`       | PASS   | No errors                                            |
| `lint`            | PASS   | No fixes applied                                     |
| `build`           | PASS   | Output sizes unchanged                               |
| `verify:exports`  | PASS   | 1 subpath resolved                                   |
| `verify:llms`     | PASS   | llms-full.txt up-to-date (20.3 KB, regenerated)      |
| `check:size`      | PASS   | gz 867 B / 900 B (96%)                               |
| `coverage`        | PASS   | Same as baseline (no src/test changes)               |

---

## Safe Fixes Applied

| # | File | Kind | Description |
|---|------|------|-------------|
| 1 | `README.md` line 13 | doc drift | Updated stale status line from "0.3.0 published" to "0.5.1 published". |
| 2 | `README_ZHTW.md` line 13 | doc drift | Same status line correction in Traditional Chinese README. |
| 3 | `STABILITY.md` lines 14, 31 (new) | doc drift | Updated "see 6 invariants below" to "see 7 invariants"; added INV7 (dispose-during-borrow) to the documented invariant list. The invariant was added to `borrow` JSDoc in 0.5.1 but was never back-ported to STABILITY.md. |
| 4 | `llms-full.txt` | regenerated | Re-ran `pnpm build:llms` to reflect all three doc changes. |

---

## Findings by Severity

### H — High

*(none)*

### M — Medium

**M1 — `drain()` partial-state on reset() throw is silent / under-documented**
- File: `src/index.ts:311–318`
- Area: drain semantics
- Description: When `reset(obj)` throws mid-drain, the spread snapshot `[...alive]` means some objects have already been moved from `alive` to `avail`, while the remainder of `alive` (after the throwing entry) are still tracked as alive with no way for the caller to drain them without calling `drain()` again. The behavior is deterministic and covered by test D5, but the JSDoc on `Pool.drain` does not mention what happens when `reset` throws (partial reset, partial recovery). Callers relying on drain for scene-reset will be surprised if a bad `reset` leaves the pool partially drained.
- Recommendation: Add a JSDoc note to `Pool.drain` explaining the partial-reset behavior on throw, consistent with the C5/release documentation.
- Status: FINDINGS-ONLY (behavior is intentional; changing it could break callers relying on the existing exception-propagation contract)

**M2 — Coverage gap: 3 uncovered lines and 3 uncovered branches**
- File: `src/index.ts:280,350,374` (per coverage report)
- Area: correctness / coverage
- Description: Line 280 is the `take()` guard (`if (obj === undefined)`) — this branch is unreachable in practice (it guards against `noUncheckedIndexedAccess` after `avail.length > 0` is confirmed). Lines 350 and 374 are inside `borrow()`'s async-with-signal path. The 3 uncovered branches (92.1% of 38) likely include the `onAbort` undefined check and the `released` false-branch of the latch (documented in Br17 as a defensive safeguard). Branches 90% threshold passes but improvement is possible without algorithmic change.
- Recommendation: Add targeted tests for the latch false-branch (e.g., a spy on the `released` check) or document in a comment that lines 280/350/374 are intentionally unreachable defensive guards.
- Status: FINDINGS-ONLY

### L — Low

**L1 — README roadmap table states 850 B budget for 0.3.0 row; actual current budget is 900 B**
- File: `README.md:132`, `README_ZHTW.md:132`
- Area: doc drift (historical roadmap)
- Description: The 0.3.0 roadmap row says "budget raised to 850 B" — this was accurate at time of 0.3.0 but the budget was subsequently raised to 900 B in 0.3.1. The CHANGELOG correctly documents the raise. The roadmap row is historical, not a live budget claim, but readers may be confused.
- Recommendation: Annotate the 0.3.0 row as "(subsequently raised to 900 B in 0.3.1)" or leave as-is with a note that CHANGELOG is the authoritative record. Not updating avoids regenerating llms unless both READMEs change.
- Status: FINDINGS-ONLY (historical row, CHANGELOG is authoritative)

**L2 — STABILITY.md "borrow invariants" count now visible as "7" but historical CHANGELOG.md entry still cites "six invariants"**
- File: `CHANGELOG.md:98` (reference: "Six stability invariants documented in STABILITY.md")
- Area: doc parity
- Description: CHANGELOG.md:98 ("Six stability invariants documented in STABILITY.md" in the 0.3.0 entry) is historical and correct for the time of that release. CONTRIBUTING.md does not cite the count so no change needed there. The CHANGELOG entry is historical and should not be changed. The STABILITY.md fix (Fix 3) is sufficient.
- Status: FINDINGS-ONLY (historical CHANGELOG entry, no fix needed)

**L3 — `property.test.ts:52` uses non-null assertion `acquired.pop()!`**
- File: `test/property.test.ts:52`
- Area: strict-TS / test style
- Description: `const obj = acquired.pop()!;` uses the `!` non-null assertion operator, which `biome.json` has disabled via `noNonNullAssertion: "off"`. The project's source philosophy avoids `!` (see tsconfig strictness + pool doc on `take()`). In the test the guard `else if (op === 1 && acquired.length > 0)` ensures `pop()` is always non-undefined at that branch, making the `!` safe — but it is stylistically inconsistent. A safe alternative is `const obj = acquired.pop(); if (obj !== undefined) pool.release(obj);` (already the pattern used in `pool.test.ts:360`).
- Recommendation: Replace `acquired.pop()!` with a guarded form to maintain style consistency. Low priority since the assertion is logically unreachable.
- Status: FINDINGS-ONLY (changing test assertion style is trivial but not a bug, and could be considered a behavior-neutral test-mechanical fix; however the existing pattern is safe and the inconsistency is minor)

**L4 — No use-after-free guard (per-object generation counter)**
- File: `src/index.ts` (architecture)
- Area: missing defense-in-depth
- Description: Once an object is released, the caller's reference to it remains valid and indistinguishable from a freshly-acquired object — `release()` only removes from `alive` and calls `reset()`. If a caller holds a stale reference and reads mutated fields set by a new borrower, there is no detection mechanism. This is acknowledged in the README Capabilities table ("Per-object metadata / generation counters" is listed under "Won't do"). The CHANGELOG roadmap mentions "generation counters for stale checks" as a 0.6+ candidate. This is an intentional design gap, not a defect in the current scope.
- Recommendation: When implementing generation counters (0.6+ roadmap), consider wrapping each slot in a versioned handle. For now, callers must null their references on release.
- Status: FINDINGS-ONLY (documented architectural decision)

---

## Findings-Only Backlog

| ID  | Sev | Area            | Title                                                         |
|-----|-----|-----------------|---------------------------------------------------------------|
| M1  | M   | drain semantics | `drain()` partial-state on reset() throw not documented in JSDoc |
| M2  | M   | coverage        | 3 uncovered lines / 3 uncovered branches (defensive guards)   |
| L1  | L   | doc drift       | README roadmap 0.3.0 row cites stale 850 B budget            |
| L2  | L   | doc parity      | Historical CHANGELOG entry cites "six invariants" (now seven) |
| L3  | L   | test style      | `property.test.ts:52` uses `!` non-null assertion             |
| L4  | L   | architecture    | No per-object generation counter / use-after-free guard       |

---

## Appendix

### Commands run

```
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm build
pnpm verify:exports
pnpm verify:llms
pnpm check:size
pnpm coverage
# [fixes applied]
pnpm build:llms
pnpm lint && pnpm typecheck
pnpm build && pnpm check:size
pnpm verify:exports && pnpm verify:llms && pnpm coverage
```

### Versions

| Tool | Version  |
|------|----------|
| node | v22.22.2 |
| pnpm | 9.12.3   |
