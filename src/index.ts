// aipooljs — fixed-size object pool for hot-path acquire/release patterns.
//
// v0.0.1 scaffold: types and JSDoc are stable; implementation is intentionally
// stubbed (`throw`) until 0.1.0 wires up the runtime.

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
   * Fixed pool capacity. {@link Pool.acquire} throws {@link PoolError}
   * when the pool is empty — no auto-grow, by design.
   */
  size: number;
}

/**
 * Handle returned by {@link createPool}.
 *
 * @typeParam T — the pooled object type.
 * @public
 */
export interface Pool<T> {
  /**
   * Take an object out of the pool. Throws {@link PoolError} when empty,
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

  /** Number of objects currently checked out. */
  readonly alive: number;

  /** Number of objects available for {@link acquire}. */
  readonly available: number;

  /** `true` once {@link dispose} has been called. */
  readonly disposed: boolean;
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
export function createPool<T>(opts: PoolOptions<T>): Pool<T> {
  // v0.0.1 scaffold — implementation lands with 0.1.0.
  void opts;
  throw new Error("aipooljs: not implemented (v0.0.1 scaffold)");
}
