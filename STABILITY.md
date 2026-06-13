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
- `release()` detects foreign/double release.
- `drain()` resets every live object.
- `dispose()` is idempotent and permanent.
- `borrow()` releases in `finally` for sync throw, async rejection, and abort paths.

## Caveats

- Throwing `reset()` permanently removes that slot from the pool.
- Function overflow handlers are caller-owned escape hatches and may alias live objects if misused.
- Abort does not cancel the work inside `borrow()`.
- `"grow"` trades correctness for allocation spikes; use intentionally.
