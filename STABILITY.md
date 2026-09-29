# Stability

## Stable Surface

| Surface | Status | Notes |
| --- | --- | --- |
| `createPool()` | Stable | Fixed-size pool factory with overload for `"null"`. |
| `Pool` methods | Stable | `acquire`, `release`, `drain`, `borrow`, `dispose`. |
| Runtime state | Stable | `available`, `alive`, `disposed`. |
| Overflow strategies | Stable | `"throw"`, `"null"`, `"grow"`, function handler. |
| Error classes | Stable | `PoolError`, `PoolDisposedError`. |

## Behavioral Contract

- Objects are created eagerly at construction.
- `createPool()` validates before the first `create()` call, in this order: `size` (a missing or non-object options argument fails here), `onOverflow`, `create` is a function, `reset` is a function.
- `create()` and a function overflow handler must return a value that is not `null` or `undefined`. Otherwise `PoolError` is thrown and nothing changes: `createPool()` returns no pool, `"grow"` discards the partial allocation, and the handler result is never added to `alive`.
- `release()` detects foreign/double release.
- `drain()` resets every live object.
- `dispose()` is idempotent and permanent.
- `borrow()` throws `PoolError` synchronously, after the disposed check and before `acquire()`, when `fn` is not a function or `signal` lacks `addEventListener` / `removeEventListener`; a `null` or `undefined` signal means no signal.
- `borrow()` releases in `finally` for sync throw, async rejection, and abort paths.
- Misuse and overflow errors are `PoolError`; every message starts with `aipooljs: ` (argument errors read `aipooljs: <subject> must be <constraint>`), and `error.name` equals the class name.
- Re-entrancy: the pool has no event dispatch and no mailbox. `create()`, `reset()` and function overflow handlers run synchronously inside the pool call and may call back into the same pool; nested calls run immediately and are never queued. A re-entrant `dispose()` makes the in-progress call throw `PoolDisposedError`, and `drain()` skips snapshot entries that a re-entrant `reset()` already released. Separate pools are independent.

## Caveats

- Throwing `reset()` permanently removes that slot from the pool.
- Function overflow handlers are caller-owned escape hatches and may alias live objects if misused.
- Abort does not cancel the work inside `borrow()`.
- `"grow"` trades correctness for allocation spikes; use intentionally.
