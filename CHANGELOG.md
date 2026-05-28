# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Planned for 0.1.0

- `createPool({ create, reset, size })` factory — fixed-size, fail-fast on overflow.
- `acquire()` / `release()` / `drain()` / `dispose()` lifecycle.
- Double-release detection via `Set`-tracked alive set; offending `release()` throws `PoolError`.
- `dispose()` is idempotent; subsequent `acquire()` / `release()` / `drain()` throw `PoolDisposedError`.
- `alive` / `available` / `disposed` read-only counters.
- Test coverage ≥95% statements / lines / functions / ≥90% branches.
- Size budget: ≤500 B gzip.
- Dual ESM + CJS build via `tsup`; `sideEffects: false`; zero runtime dependencies.
