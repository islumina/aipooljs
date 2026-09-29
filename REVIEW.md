# aipooljs Review

Current review state after the 2026-09-29 ai*js 0.6.0 pass. Fixed findings are summarised; the backlog keeps only documented boundaries and deferred items.

## Current Known Issues / Backlog

| Priority | Area | Status | Notes |
| --- | --- | --- | --- |
| P2 | Function overflow aliasing | Documented | Handler can return an already-live object. Consider a stricter opt-in mode if this becomes common misuse. |
| P3 | Reset throw shrinks pool | Documented | Intentional/test-locked behavior; callers should guard `reset()` if slot loss is unacceptable. |
| P3 | Thenable handling | Documented | `borrow()` only branches async for native `Promise`; non-`instanceof Promise` thenables are released synchronously and returned as-is. |
| P3 | Dispose during async borrow | Documented | Dispose can mask the callback result with `PoolDisposedError`. |
| P3 | Dedicated message for missing options | Deferred | `createPool()` with a missing or primitive options argument throws `PoolError("aipooljs: size must be a non-negative integer")`, because options destructure through `Object()`. A separate `aipooljs: options must be an object` gate measured 1,064 B gzip, 14 B over the 1,050 B ceiling granted for 0.6.0 (1,048 B used without it). Deferred until the next budget review; the class and prefix already follow the family rule, and no bare `TypeError` escapes. |

## Fixed Summary

- Construction validation (0.6.0, P3 backlog): `createPool()` checks `size`, `onOverflow`, then `create must be a function` and `reset must be a function`, all before the first `create()` call; a missing or primitive options argument fails the `size` check with `PoolError` instead of a bare `TypeError`. Pinned by A6-A9.
- Nullish results (0.6.0, P3 backlog): every `create()` result (construction and `"grow"`) goes through one `make()` check, and the function handler result is checked after the dispose re-check; `null`/`undefined` throws `PoolError` and leaves `alive`/`available`/capacity unchanged. Pinned by A10, O20-O22 and Br28. Breaking: callers used to get `undefined` as `T` or corrupted counters.
- `borrow()` argument validation (0.6.0): a non-function `fn` throws `PoolError` before acquiring (it used to acquire, reset and throw a bare `TypeError`), and a `signal` without `addEventListener` / `removeEventListener` throws `PoolError` (one without `removeEventListener` made the async `finally` throw before release, leaking the slot). Pinned by Br25-Br27.
- Message shape (0.6.0): every `PoolError` goes through one `bad()` thrower with the `aipooljs: ` prefix; `pool exhausted` and `foreign or double-released object` gained it (B3, C3, C4, Br29).
- Size (0.6.0): `dist/index.js` is 1,048 B gzip under the 1,050 B budget; the dead `take()` undefined guard and the redundant `{ once: true }` on the abort listener were removed to pay for the new checks (Br30 pins listener removal on every settle path).
- Overflow handling rejects already-available victims before returning them.
- Double-release and foreign-object detection are covered.
- Abort paths release slots rather than leaking them.
- `drain()` skips snapshot entries a re-entrant `reset()` already released, so it no longer double-resets/double-pushes an object into `available`.
- `borrow()`'s `finally` skips `release(obj)` once `drain()` has already reclaimed the slot, so it no longer resets/frees an object another caller has since acquired.
- User callbacks (`onOverflow` handler, `create()`, `reset()`) that re-entrantly call `dispose()` are re-checked after the callback returns, so an in-progress `acquire()`/`release()`/`drain()` throws `PoolDisposedError` instead of mutating a disposed pool.
- `onOverflow: "grow"` from `size: 0` records capacity as `capacity += growBy`, so capacity truly doubles (1, 2, 4, ...).
- `borrow()`'s JSDoc (INV2/INV6) documents that an in-flight abort releases the slot one microtask later, not within the same turn as `ctrl.abort()`.
- `package.json#exports` nests `types` under each of `import`/`require` (with `./dist/index.d.cts` for `require`); `verify-exports.mjs` walks nested condition objects.

## Closed Without Change

- Explicit `{ signal: undefined }` under `exactOptionalPropertyTypes`: `borrow()` keeps the family and DOM shape `signal?: AbortSignal`; at runtime `null` and `undefined` already mean no signal (Br27).
- Re-entrancy mailbox: the family FIFO-mailbox rule covers state-owning dispatchers (aifsmjs, aispritejs). The pool dispatches no events, so nested calls from `create()`, `reset()` or a handler keep running immediately; STABILITY.md states this clause.

## Verification Baseline

- `pnpm typecheck`
- `pnpm test`
- `pnpm verify:docs`
- `pnpm verify:exports`
- `pnpm verify:llms`
- `pnpm check:size`
- `pnpm prepublishOnly` (all of the above plus lint, coverage thresholds and build)
