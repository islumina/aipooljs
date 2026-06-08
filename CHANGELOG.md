# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.5] - 2026-06-08

### Changed

- Project home migrated to the [`islumina`](https://github.com/islumina) GitHub org; the package is now published from there via npm trusted publisher (OIDC + SLSA provenance). Family-wide version alignment at `0.5.5` — no runtime or API changes.

## [0.5.2] - 2026-06-05

### Docs

- Review-driven documentation fixes (`README.md`, `README_ZHTW.md`, `llms-full.txt`; plus repo-only `STABILITY.md`): clarity and accuracy from a cross-package code review. No runtime or API change; `dist` byte-identical to 0.5.1.

## [0.5.1] - 2026-06-02

### Docs

- `src/index.ts` (`borrow` JSDoc): documented **INV7** — dispose-during-borrow
  invariant. If `dispose()` is called while an async borrow is in-flight, the
  `finally` block's `release()` throws `PoolDisposedError`, which masks the
  original `fn` result or error. Explicit guidance: do not dispose a pool that
  has active borrows.
- `src/index.ts` (`OverflowHandler` JSDoc): added **infinite-recursion hazard**
  warning for the function-handler form. Calling `pool.acquire()` from within
  the handler without first making a slot available causes unbounded recursion;
  the handler is responsible for ensuring capacity before any nested acquire.

### Tests

- `test/borrow.test.ts` (Br20): regression test locking in INV7 — `dispose()`
  called while an async borrow is in-flight causes the borrow to reject with
  `PoolDisposedError` regardless of `fn`'s outcome.
- `test/property.test.ts` (P1 comment): added note that the `alive + available
  === size` property holds only under fixed-capacity modes; under `'grow'` the
  bound is the current (doubled) capacity. See P3.
- `test/property.test.ts` (P3): new property test for the `'grow'` invariant —
  across a sequence of grow-triggered acquires, `alive + available` equals the
  current (doubled) capacity with no phantom slots.

## [0.4.0] - 2026-05-29

Dependency-hygiene + stability-freeze release, part of the ai\*js family-wide v0.4.0
dependency-reduction cycle. **No runtime API addition.** Production bundles are
byte-identical to 0.3.1 (`dist/index.js` 869 B gzip); the public surface is unchanged.

### Changed

- **Removed unused `tsx` devDependency.** `depcheck` confirmed `tsx` was not referenced
  by any script, config, or source file. `pnpm-lock.yaml` is pruned accordingly — smaller
  install graph and reduced CI supply-chain surface. Runtime/peer dependencies remain zero.

### Docs

- `STABILITY.md`: the 0.3.x stable surface (`createPool` / `PoolOptions` / `Pool` /
  `NullPool` / `OverflowHandler` / `PoolError` / `PoolDisposedError` / `onOverflow` /
  `borrow` + its 6 invariants) is now declared **1.0-track frozen** — these signatures
  will not change before 1.0 and are guaranteed stable across the 1.x line once 1.0 ships.
  The polymorphic-chunked-pool remains a draft (target v0.6+).

### Notes

- `pnpm audit` clean — no transitive advisories.
- Backward-compatible minor: no exports removed, no signatures changed, no error
  `name`/`code` changes, no default-behaviour changes.

## [0.3.1] - 2026-05-29

### Fixed

- **F1 — borrow synchronous-abort during fn:** if `fn` calls `signal.abort()` synchronously
  before its first `await`, the `abort` event fires before the `addEventListener("abort", …)`
  listener is attached, causing the rejection to be silently dropped. A post-attach
  `if (signal.aborted) onAbort()` guard now catches this case, ensuring the borrow rejects
  with `AbortError` and the slot is released immediately (not deferred until `fn` settles).
- **F2 — 'grow' is now atomic on `create()` failure:** the grow loop previously pushed
  each newly created object straight into `avail`, so a mid-grow `create()` throw left
  partial slots committed (breaking the `alive + available === size` invariant). The loop
  now builds into a temporary `grown: T[]` array and only commits to `avail` and
  `capacity` once all allocations succeed.

### Changed

- Size budget `dist/index.js`: 850 B → 900 B (accommodates F1/F2 correctness fixes;
  error-message strings retained — no golfing).

### Docs

- `STABILITY.md`: added `OverflowHandler<T>` and `NullPool<T>` to the Stable section
  (both were already exported and documented in 0.3.0; the omission was an oversight).
- `CONTRIBUTING.md`: updated stale "≤ 500 B gzip" / "past 500 B" guidance to "≤ 900 B".

## [0.3.0] - 2026-05-29

### Added

- `onOverflow` option (`'throw' | 'null' | 'grow' | (pool) => T`) on `PoolOptions<T>`. Default
  remains `'throw'` — fully backward-compatible.
- `NullPool<T>` interface and overloaded `createPool` factory: `onOverflow: 'null'` narrows
  `acquire()` return type to `T | null` at compile time.
- `OverflowHandler<T>` type exported.
- `borrow(fn, opts?)` helper on `Pool<T>`: auto-releases via `try/finally`, with opt-in
  `AbortSignal` cancellation. Sync and async `fn` both supported. Six stability invariants
  documented in `STABILITY.md`.
- `STABILITY.md` — stable API surface + borrow invariants + polymorphic-chunked-pool draft
  placeholder.

### Changed

- Size budget `dist/index.js`: 700 B → 850 B (accounts for `onOverflow` dispatch + `borrow`
  async/abort machinery).

### Docs

- README roadmap: `borrow` + `onOverflow` moved from the never-shipped 0.2.0 row to **0.3.0**.
- README status line: "0.1.0 published" → "0.3.0 published".
- README Capabilities table: "Auto-grow (overflow throws PoolError)" updated to reflect opt-in
  `onOverflow` (`'grow'` available; default still throws).
- `STABILITY.md` added to `llms-full.txt` via `scripts/build-llms-full.mjs`.

## [0.1.1] - 2026-05-28

### Changed (CI)

- **`publish.yml` now triggers on `push: tags: ["v*"]`** (was `workflow_dispatch` only). Aligns with the trigger used by `aifsmjs` / `aiecsjs` / `aibridgejs`. Tag push now automatically runs the OIDC trusted publish.
- **`npm publish --provenance --access public`** — the workflow now emits a [sigstore provenance attestation](https://docs.npmjs.com/generating-provenance-statements) so consumers can verify the tarball was built by this workflow on this commit.

No runtime / source / API changes. This is a CI-only patch to validate the GitHub Actions OIDC trusted-publisher pipeline now that the npm trusted publisher entry is configured. Production bundles are byte-identical to 0.1.0.

## [0.1.0] - 2026-05-28

### Added

- `createPool({ create, reset, size })` factory — fixed-size, fail-fast on overflow.
- `acquire()` / `release()` / `drain()` / `dispose()` lifecycle.
- Double-release detection via `Set`-tracked alive set; offending `release()` throws `PoolError`.
- `dispose()` is idempotent; subsequent `acquire()` / `release()` / `drain()` throw `PoolDisposedError`.
- `alive` / `available` / `disposed` read-only counters.
- Test coverage ≥95% statements / lines / functions / ≥90% branches.
- Size budget: ≤500 B gzip (raised to 700 B if strict-TS overhead pushes past 500 B).
- Dual ESM + CJS build via `tsup` with `minify: true`; `sideEffects: false`; zero runtime dependencies.

## [0.0.1] - 2026-05-28

### Added (scaffold)

- Full package scaffold landed (`package.json`, `tsconfig.json`,
  `tsconfig.test.json`, `tsup.config.ts`, `vitest.config.ts`, `biome.json`,
  `scripts/{verify-exports,check-size,build-llms-full}.mjs`,
  `test/scaffold.test.ts`, `examples/.gitkeep`, `.github/workflows/{ci,publish}.yml`,
  `llms.txt`, `llms-full.txt`).
- `src/index.ts` remains a `throw` stub exposing the frozen 0.1.0 API surface
  (`createPool`, `Pool<T>`, `PoolOptions<T>`, `PoolError`, `PoolDisposedError`).
- `pnpm typecheck && pnpm lint && pnpm coverage && pnpm build &&
  pnpm verify:exports && pnpm verify:llms && pnpm check:size` walks clean
  against a single placeholder test.
- Coverage thresholds temporarily set to `0/0/0/0`; tightened to
  `95/90/100/100` in 0.1.0 with real tests.
- Size budget temporarily set to 3 KB gzip; tightened to the 500 B README
  target in 0.1.0.
- Publish workflow exists but trigger is `workflow_dispatch` only — no
  accidental npm release on tag push until 0.1.0.

