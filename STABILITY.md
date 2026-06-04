# Stability

## Stable (since 0.3.0)

> **1.0-track frozen (since 0.4.0).** Every entry below is frozen for the 1.x line:
> no signature, return-type, error `name`/`code`, or default-behaviour change will land
> before 1.0, and these APIs are guaranteed stable across 1.x once 1.0 ships. Additive
> growth (new optional options / new exports) remains possible.

- `createPool` / `PoolOptions` / `Pool` / `PoolError` / `PoolDisposedError`
- `OverflowHandler<T>` / `NullPool<T>`
- `acquire` / `release` / `drain` / `dispose` / `alive` / `available` / `disposed`
- `onOverflow`: `'throw'` | `'null'` | `'grow'` | `(pool) => T`
- `borrow(fn, opts?)` — see 7 invariants below

### borrow invariants

1. `release(obj)` is guaranteed to run in `finally` — on sync throw, async reject, and abort alike.
2. `signal` abort → slot released immediately, promise rejects with `signal.reason` (default:
   `AbortError` DOMException). If the signal is already aborted before `borrow` is called, the
   promise rejects without acquiring or executing `fn`.
3. `borrow` does **not** cancel `fn`'s inner async work; `signal` is an advisory token only.
4. If the pool is disposed, `borrow` throws `PoolDisposedError` synchronously, before `acquire`.
5. If `onOverflow` is `'null'` and the pool is full, `borrow` throws `PoolError` synchronously;
   `fn` is never called.
6. **Abort does not fence inner work.** When `signal` aborts, `borrow` releases the slot and
   rejects immediately. It does **not** cancel the work inside `fn` — the signal is advisory.
   If `fn` keeps touching the borrowed object after abort, it may mutate an object another caller
   has since acquired. `fn` must observe `signal.aborted` and stop touching the object the moment
   it aborts. Treat the borrowed object as invalid once `signal` fires.
7. **Dispose-during-borrow:** if `dispose()` is called while an async borrow is in-flight, the
   `finally` block's `release()` throws `PoolDisposedError`, which masks whatever `fn` returned
   or threw. The caller will always see `PoolDisposedError` in this race. Do not dispose a pool
   that has active borrows.

## Experimental / Draft

### polymorphic-chunked-pool (draft) — Target: v0.6+

One contiguous `ArrayBuffer` partitioned into typed sub-pools (`Bullet | Particle | Explosion`).
Reduces header overhead from N × `Pool<T>` to 1 buffer + N offset tables.

Risk: API complexity; schema versioning across pool resize. Not implemented this cycle.
