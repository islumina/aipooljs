# aipooljs Review

Current review state after the 2026-09-28 ai*js pass.

## Current Known Issues / Backlog

| Priority | Area | Status | Notes |
| --- | --- | --- | --- |
| P2 | Function overflow aliasing | Documented | Handler can return an already-live object. Consider a stricter opt-in mode if this becomes common misuse. |
| P3 | Reset throw shrinks pool | Documented | Intentional/test-locked behavior; callers should guard `reset()` if slot loss is unacceptable. |
| P3 | Thenable handling | Documented | `borrow()` only branches async for native `Promise`; non-`instanceof Promise` thenables are released synchronously and returned as-is. |
| P3 | Dispose during async borrow | Documented | Dispose can mask the callback result with `PoolDisposedError`. |
| P3 | Overflow handler / create() may return nullish | Open | The function `onOverflow` handler's return value and `create()`'s result are added to `alive`/`avail` without a null/undefined check, so a nullish return silently corrupts pool counts (e.g. `acquire()` returns `undefined` as `T`, or later throws "pool exhausted" with slots free). Fix: throw `PoolError` on a nullish handler/`create()` result. Deferred — adding the throw is an `apiChange` (new error path for callers currently getting a lenient `undefined`/`null`), so it needs a deliberate minor bump rather than a drive-by P3 fix. |
| P3 | Missing create/reset function validation | Open | `createPool` validates `size` and `onOverflow` but not that `create`/`reset` are functions, so a missing `reset` only fails at the first `release()`/`drain()`, mid-frame, and each failing release also permanently loses that slot. Fix: throw `PoolError` at construction when `create`/`reset` aren't functions. Deferred — throwing at construction where none was thrown before is an `apiChange`, so it needs a deliberate minor bump rather than a drive-by P3 fix. |

## Fixed Summary

- Overflow handling rejects already-available victims before returning them.
- Double-release and foreign-object detection are covered.
- Abort paths release slots rather than leaking them.
- `drain()` skips snapshot entries a re-entrant `reset()` already released, so it no longer double-resets/double-pushes an object into `available`.
- `borrow()`'s `finally` skips `release(obj)` once `drain()` has already reclaimed the slot, so it no longer resets/frees an object another caller has since acquired.
- User callbacks (`onOverflow` handler, `create()`, `reset()`) that re-entrantly call `dispose()` are now re-checked after the callback returns, so an in-progress `acquire()`/`release()`/`drain()` throws `PoolDisposedError` instead of continuing to mutate a disposed pool.
- `onOverflow: "grow"` from `size: 0` now records capacity as `capacity += growBy` instead of `growBy * 2`, so capacity truly doubles (1, 2, 4, ...) instead of drifting (1, 3, 7, ...).
- `borrow()`'s JSDoc (INV2/INV6) now documents that an in-flight abort releases the slot one microtask later (in the `finally` after the rejection), not synchronously within the same turn as `ctrl.abort()`.
- `package.json#exports` now nests `types` under each of `import`/`require` (with a matching `./dist/index.d.cts` for `require`), so CommonJS consumers under `module: node16`/`nodenext` no longer hit TS1479; `verify-exports.mjs` walks nested condition objects.

## Verification Baseline

- `pnpm typecheck`
- `pnpm test`
- `pnpm verify:docs`
- `pnpm verify:exports`
- `pnpm verify:llms`
- `pnpm check:size`
