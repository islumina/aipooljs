# Changelog

All notable changes to aipooljs are summarized here.

## [0.6.0] - 2026-09-29

### Breaking

- `createPool()`: a `create` or `reset` option that is not a function now throws `PoolError` (`aipooljs: create must be a function` / `aipooljs: reset must be a function`) at construction, before any `create()` call, instead of building a pool whose first `release()` failed mid-frame and lost that slot. Migration: plain-JS callers must pass both `create` and `reset` as functions.
- `createPool()` / `onOverflow: "grow"` / function `onOverflow` handler: a `create()` or handler result of `null` or `undefined` now throws `PoolError` (`aipooljs: create() returned null or undefined` / `aipooljs: overflow handler returned null or undefined`) and leaves the pool unchanged, instead of silently corrupting `alive`/`available` and handing `undefined` out as `T`. Migration: make factories and handlers return an object (any value other than `null`/`undefined`), and use `onOverflow: "null"` where you meant "no object on overflow".
- `borrow()`: a `fn` that is not a function, or an `opts.signal` without `addEventListener` / `removeEventListener`, now throws `PoolError` synchronously before anything is acquired, instead of acquiring, resetting the slot and throwing a bare `TypeError` (non-function `fn`) or permanently leaking the slot (a signal without `removeEventListener`). Migration: pass a function and a real `AbortSignal` (or omit `signal`; `null` still means no signal), and catch `PoolError` where you caught `TypeError`.
- `createPool()`: a missing or primitive options argument now throws `PoolError` (`aipooljs: size must be a non-negative integer`) instead of a bare `TypeError` from destructuring. Migration: always pass an options object, and catch `PoolError` where you caught `TypeError`.

### Changes

- Changed: every `PoolError` message now starts with `aipooljs: `; `pool exhausted` and `foreign or double-released object` gained the prefix. Match on the class plus a regex, not the exact text.
- Changed: `dist/index.js` size budget raised from 950 B to 1,050 B gzip (maintainer-approved for 0.6.0); measured 1,048 B (from 950 B) after offsetting trims: one prefixing `bad()` thrower, and the dead `take()` guard and redundant `{ once: true }` removed.
- Fixed: `drain()` no longer double-resets and double-pushes an object into `available` when a re-entrant `reset()` releases it earlier in the same snapshot.
- Fixed: `borrow()` no longer resets/frees an object another caller has since acquired when `drain()` reclaims the borrowed slot while the borrow is in flight.
- Fixed: user callbacks (`onOverflow` handler, `create()`, `reset()`) that re-entrantly call `dispose()` no longer leave the pool disposed with `alive`/`available` above zero — the in-progress call now throws `PoolDisposedError`.
- Fixed: `onOverflow: "grow"` from `size: 0` now doubles capacity correctly (1, 2, 4, ...) instead of drifting (1, 3, 7, ...).
- Fixed: `package.json#exports` nests `types` under each of `import`/`require`, fixing TS1479 for CommonJS consumers under `module: node16`/`nodenext`.
- Docs: STABILITY.md's Behavioral Contract now states the construction validation order, the nullish-result rule, `borrow()` argument checks, the `aipooljs: ` message shape and the callback re-entrancy clause (no mailbox; nested calls run immediately); README/README_ZHTW list the misuse errors.
- Docs: JSDoc for `PoolError`, `PoolOptions.create`/`reset`, `OverflowHandler`, `dispose()` (now names `borrow`) and `borrow()` (new INV9 on argument validation) matches the 0.6.0 contract.

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
