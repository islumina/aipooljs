// aipooljs — fixed-size object pool for hot-path acquire/release patterns.
//
// v0.1.0: full implementation of the frozen API surface. Stack-backed
// available set, Set-tracked alive objects, double-release detection,
// idempotent dispose, destructurable methods (no `this`).
//
// v0.3.0: additive additions —
//   • onOverflow: 'throw' | 'null' | 'grow' | fn   (OverflowHandler<T>)
//   • borrow(fn, opts?)  — try/finally acquire/release + AbortSignal

/**
 * Overflow strategy passed to {@link PoolOptions.onOverflow}.
 *
 * - `'throw'` (default) — throws {@link PoolError} when the pool is empty.
 * - `'null'` — {@link Pool.acquire} returns `null` instead of throwing; the pool
 *   state is not mutated.
 * - `'grow'` — doubles capacity by allocating `currentCapacity` new objects via
 *   `create()` (O(capacity) re-alloc + same-frame GC spike). Use only where
 *   unbounded growth is acceptable.
 * - function handler — called with the pool as argument; return value is added to
 *   the alive set and handed to the caller. **Warning:** if the handler recycles
 *   an already-alive object (e.g. "evict the oldest"), the previous holder's
 *   reference is aliased — any subsequent `release` from either party may throw
 *   `PoolError("foreign or double-released")`. This is an escape hatch; caller
 *   takes full responsibility.
 *
 *   **Infinite-recursion hazard:** if the function handler calls
 *   `pool.acquire()` without first making a slot available (e.g. via
 *   `pool.release()` or `pool.drain()`), `acquire()` will find the pool still
 *   exhausted, invoke the handler again, and recurse without bound. The handler
 *   is responsible for ensuring a slot exists before any nested `acquire()` call.
 *
 * @public
 */
export type OverflowHandler<T> = "throw" | "null" | "grow" | ((pool: Pool<T>) => T);

/**
 * Configuration for {@link createPool}.
 *
 * @typeParam T — the pooled object type.
 * @public
 */
export interface PoolOptions<T> {
  /**
   * Factory invoked exactly `size` times at construction. Each invocation
   * must return a fresh instance — pool semantics depend on independence
   * between slots.
   *
   * If `create()` throws, {@link createPool} throws and no slots are kept.
   */
  create: () => T;

  /**
   * Reset hook called on every {@link Pool.release}. Must clear mutable
   * fields back to a known good state without `delete`-ing properties:
   * deleting fields demotes V8 hidden classes and turns the steady-state
   * loop megamorphic.
   *
   * Prefer `obj.x = 0; obj.visible = false;` over `delete obj.x`.
   */
  reset: (obj: T) => void;

  /**
   * Fixed pool capacity. When the pool is exhausted, behaviour is governed
   * by {@link onOverflow} (default: throw {@link PoolError}).
   */
  size: number;

  /**
   * What to do when {@link Pool.acquire} is called on an empty pool.
   *
   * - `'throw'` (default) — throws {@link PoolError}.
   * - `'null'` — returns `null`; pool state unchanged. Use {@link NullPool}
   *   return type (auto-narrowed by the overloaded factory).
   * - `'grow'` — allocates `currentCapacity` new objects via `create()`,
   *   doubles internal capacity, then hands out one slot. O(capacity) re-alloc;
   *   expect a same-frame GC spike.
   * - function — escape hatch; see {@link OverflowHandler}.
   */
  onOverflow?: OverflowHandler<T>;
}

/**
 * Handle returned by {@link createPool}.
 *
 * @typeParam T — the pooled object type.
 * @public
 */
export interface Pool<T> {
  /**
   * Take an object out of the pool. Throws {@link PoolError} when empty
   * (unless `onOverflow` changes that behaviour), throws
   * {@link PoolDisposedError} when the pool has been disposed.
   */
  acquire(): T;

  /**
   * Return an object previously obtained from {@link acquire}. Calls
   * `reset(obj)` then makes the slot available again.
   *
   * Throws {@link PoolError} on double-release or on releasing a foreign
   * object. Throws {@link PoolDisposedError} after dispose.
   */
  release(obj: T): void;

  /**
   * Reset every currently-alive object back into the available set, as if
   * each alive object were individually released. Useful between scenes
   * or rounds. No-op when nothing is alive.
   */
  drain(): void;

  /**
   * Idempotent teardown. Releases internal references so the GC can reclaim
   * pooled objects. Subsequent calls to `acquire` / `release` / `drain`
   * throw {@link PoolDisposedError}.
   */
  dispose(): void;

  /**
   * Acquire an object, call `fn(obj)`, then release automatically via
   * `try/finally`. Both sync and async `fn` are supported.
   *
   * **Invariants:**
   * 1. `release(obj)` is guaranteed to run in `finally` — on sync throw,
   *    async reject, or abort.
   * 2. If `opts.signal` is aborted before or during `fn`, `borrow` releases
   *    the slot immediately and rejects with `signal.reason` (default:
   *    `AbortError` DOMException). If the signal is already aborted before
   *    `borrow` is called, the promise rejects without acquiring or calling
   *    `fn`.
   * 3. Abort does **not** cancel inner work — `fn` keeps running; `signal` is
   *    advisory. See **INV6** below.
   * 4. If the pool is disposed, `borrow` throws `PoolDisposedError`
   *    synchronously, before `acquire` or `fn`.
   * 5. If `onOverflow` is `'null'` and the pool is full, `borrow` throws
   *    `PoolError` synchronously; `fn` is never called.
   * 6. **Abort does not fence inner work.** When `signal` aborts, `borrow`
   *    releases the slot and rejects immediately. It does **not** cancel the
   *    work inside `fn` — the signal is advisory. If `fn` keeps touching the
   *    borrowed object after abort, it may mutate an object another caller has
   *    since acquired. `fn` must observe `signal.aborted` and stop touching
   *    the object the moment it aborts. Treat the borrowed object as invalid
   *    once `signal` fires.
   * 7. **Dispose-during-borrow:** if `dispose()` is called while an async
   *    `borrow` is in flight, the `finally` block runs `release(obj)` after
   *    the pool is already disposed — `release` throws `PoolDisposedError`,
   *    which surfaces from the `finally` block and **masks** whatever `fn`
   *    returned or threw. The caller will always see a `PoolDisposedError` in
   *    this race, regardless of `fn`'s outcome. This is an explicit invariant:
   *    do not dispose a pool that has active borrows.
   *
   * **Sync vs async dispatch:** disposed/overflow errors are thrown
   * synchronously (both overloads). A pre-aborted signal yields a rejected
   * Promise. The async branch activates only when `fn` returns a native
   * `Promise`; a non-`instanceof Promise` thenable is treated as sync —
   * release runs immediately and the thenable is returned as-is (document
   * this at call site if needed). Callers using `.catch()` instead of
   * `await` must also wrap the call in `try/catch` to handle the
   * synchronous error cases.
   */
  borrow<R>(fn: (obj: T) => R): R;
  borrow<R>(
    fn: (obj: T, signal?: AbortSignal) => Promise<R>,
    opts?: { signal?: AbortSignal },
  ): Promise<R>;

  /** Number of objects currently checked out. */
  readonly alive: number;

  /** Number of objects available for {@link acquire}. */
  readonly available: number;

  /** `true` once {@link dispose} has been called. */
  readonly disposed: boolean;
}

/**
 * Variant of {@link Pool} returned when `onOverflow: 'null'` is passed to
 * {@link createPool}. Identical to `Pool<T>` except `acquire()` returns
 * `T | null` instead of `T`.
 *
 * @public
 */
export interface NullPool<T> extends Omit<Pool<T>, "acquire"> {
  acquire(): T | null;
}

/**
 * Recoverable pool error. Thrown by `acquire()` on overflow and by
 * `release()` on double-release or foreign-object release.
 *
 * @public
 */
export class PoolError extends Error {
  override readonly name = "PoolError";
}

/**
 * Thrown by any pool method called after {@link Pool.dispose}.
 *
 * @public
 */
export class PoolDisposedError extends Error {
  override readonly name = "PoolDisposedError";
}

// ---------------------------------------------------------------------------
// Factory — overloaded so 'null' mode narrows acquire() to T | null
// ---------------------------------------------------------------------------

/**
 * Construct a fixed-size object pool configured to return `null` on overflow
 * (instead of throwing). The returned {@link NullPool} has `acquire(): T | null`.
 *
 * @public
 */
export function createPool<T>(opts: PoolOptions<T> & { onOverflow: "null" }): NullPool<T>;

/**
 * Construct a fixed-size object pool.
 *
 * @example
 * ```ts
 * import { createPool } from "aipooljs";
 *
 * interface Bullet {
 *   x: number;
 *   y: number;
 *   visible: boolean;
 *   alpha: number;
 * }
 *
 * const bullets = createPool<Bullet>({
 *   create: (): Bullet => ({ x: 0, y: 0, visible: false, alpha: 1 }),
 *   reset: (b) => {
 *     b.visible = false;
 *     b.x = 0;
 *     b.y = 0;
 *     b.alpha = 1;
 *   },
 *   size: 200,
 * });
 *
 * const b = bullets.acquire();
 * b.visible = true;
 * b.x = 100;
 * // ... use b ...
 * bullets.release(b);
 * ```
 *
 * @public
 */
export function createPool<T>(opts: PoolOptions<T>): Pool<T>;

export function createPool<T>(opts: PoolOptions<T>): Pool<T> | NullPool<T> {
  const { size, create, reset } = opts;
  const overflow = opts.onOverflow ?? "throw";

  if (!Number.isInteger(size) || size < 0) {
    throw new PoolError("aipooljs: size must be a non-negative integer");
  }

  // POL-S-02: validate onOverflow at construction time so a typo'd string throws
  // immediately rather than deferring a TypeError to first overflow mid-frame.
  if (
    overflow !== "throw" &&
    overflow !== "null" &&
    overflow !== "grow" &&
    typeof overflow !== "function"
  ) {
    throw new PoolError(
      `aipooljs: invalid onOverflow value "${String(overflow)}" — expected "throw", "null", "grow", or a function`,
    );
  }

  const avail: T[] = [];
  for (let i = 0; i < size; i++) {
    avail.push(create());
  }

  let capacity = size;
  const alive: Set<T> = new Set();
  let disposed = false;

  function ck(): void {
    if (disposed) throw new PoolDisposedError("aipooljs: pool has been disposed");
  }

  // Precondition: avail is non-empty.
  function take(): T {
    const obj = avail.pop();
    if (obj === undefined) throw new PoolError("pool exhausted"); // noUncheckedIndexedAccess guard
    alive.add(obj);
    return obj;
  }

  function acquire(): T | null {
    ck();
    if (avail.length > 0) return take();
    if (overflow === "throw") throw new PoolError("pool exhausted");
    if (overflow === "null") return null; // does NOT mutate alive or avail
    if (overflow === "grow") {
      // POL-R-02: size:0 would give 0*2=0 forever; grow by at least 1.
      const growBy = Math.max(capacity, 1);
      const grown: T[] = [];
      for (let i = 0; i < growBy; i++) grown.push(create()); // O(capacity) re-alloc; atomic
      for (const o of grown) avail.push(o);
      capacity = growBy * 2;
      return take();
    }
    // function handler — POL-B-01: reject if handler returned an object already in avail
    // (release-then-return "evict oldest" misuse corrupts avail∩alive disjointness invariant).
    // This is a cold overflow path; linear scan of avail is acceptable per design contract.
    const obj = overflow(self as Pool<T>);
    if (avail.includes(obj)) {
      throw new PoolError(
        "aipooljs: overflow handler returned an object that is already in the available set — " +
          "release-then-return corrupts pool invariants; do not release and return the same object",
      );
    }
    alive.add(obj);
    return obj;
  }

  function release(obj: T): void {
    ck();
    if (!alive.has(obj)) throw new PoolError("foreign or double-released object");
    alive.delete(obj);
    reset(obj);
    avail.push(obj);
  }

  function drain(): void {
    ck();
    for (const obj of [...alive]) {
      alive.delete(obj);
      reset(obj);
      avail.push(obj);
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    avail.length = 0;
    alive.clear();
  }

  function borrow(
    fn: (obj: T, signal?: AbortSignal) => unknown,
    opts?: { signal?: AbortSignal },
  ): unknown {
    ck(); // INV4: disposed → PoolDisposedError synchronously

    const signal = opts?.signal;
    // Shared thunk: signal.reason ?? AbortError DOMException (INV2 / in-flight abort).
    // Both pre-abort and in-flight abort reuse the same expression — tsup minifies
    // the repeated string literal into a single reference.
    const abortErr = (): unknown =>
      signal?.reason ?? new DOMException("This operation was aborted.", "AbortError");

    // INV2 pre-abort: already aborted → reject without acquiring or calling fn
    if (signal?.aborted) return Promise.reject(abortErr());

    const obj = acquire();
    if (obj == null) throw new PoolError("pool exhausted"); // INV5: 'null' mode full → sync throw

    // INV-once latch: single location for the boolean check, prevents double-release
    // on concurrent abort + inner-settle paths.
    let released = false;
    const ro = (): void => {
      if (!released) {
        released = true;
        release(obj);
      }
    };

    let r: unknown;
    try {
      r = fn(obj, signal);
    } catch (e) {
      ro(); // INV1: sync throw
      throw e;
    }

    if (r instanceof Promise) {
      if (!signal) return r.finally(ro); // async, no signal
      // async with signal
      let onAbort: (() => void) | undefined;
      return new Promise((resolve, reject) => {
        onAbort = () => reject(abortErr());
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
        r.then(resolve, reject);
      }).finally(() => {
        if (onAbort !== undefined) signal.removeEventListener("abort", onAbort);
        ro();
      });
    }

    ro(); // sync success
    return r;
  }

  // `self` is referenced inside `acquire` (function handler arm) via closure.
  // It is assigned after the object literal is built — safe because `acquire`
  // is never called during construction, so no TDZ issue.
  // biome-ignore lint/suspicious/noExplicitAny: intentional loose type to avoid recursive Pool<T> constraint
  const self: any = {
    acquire,
    release,
    drain,
    dispose,
    borrow,
    get alive() {
      return alive.size;
    },
    get available() {
      return avail.length;
    },
    get disposed() {
      return disposed;
    },
  };

  return self as Pool<T> | NullPool<T>;
}
