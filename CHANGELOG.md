# Changelog

All notable changes to aipooljs are summarized here.

## [Unreleased]

- Fixed: `drain()` no longer double-resets and double-pushes an object into `available` when a re-entrant `reset()` releases it earlier in the same snapshot.
- Fixed: `borrow()` no longer resets/frees an object another caller has since acquired when `drain()` reclaims the borrowed slot while the borrow is in flight.
- Fixed: user callbacks (`onOverflow` handler, `create()`, `reset()`) that re-entrantly call `dispose()` no longer leave the pool disposed with `alive`/`available` above zero — the in-progress call now throws `PoolDisposedError`.
- Fixed: `onOverflow: "grow"` from `size: 0` now doubles capacity correctly (1, 2, 4, ...) instead of drifting (1, 3, 7, ...).
- Fixed: `package.json#exports` nests `types` under each of `import`/`require`, fixing TS1479 for CommonJS consumers under `module: node16`/`nodenext`.

## [0.5.9] - 2026-06-29

- Family version alignment at 0.5.9 — no runtime or API change.

## [0.5.8] - 2026-06-14

- Documentation-only slimming pass across README, stability notes, review backlog, and LLM context. Family version alignment at 0.5.8 — no runtime or API change. A stricter overflow-handler mode that prevents aliasing by default remains a documented follow-up.

## [0.5.6] - 2026-06-10

- Hardened docs around overflow, reset failure, borrow abort, and dispose behavior.
- Kept fixed-size pool API stable and regenerated generated LLM context.

## Older releases

- `0.5.5` through `0.5.1` focused on release hygiene, docs accuracy, and regression tests for reset/borrow/overflow paths.
- `0.4.0` declared the stable ai*js pool surface.
- `0.3.x` added overflow strategies and `borrow()`.
- `0.1.x` introduced `createPool`, `Pool`, `NullPool`, `PoolError`, and `PoolDisposedError`.
