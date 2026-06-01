import { describe, expect, it, vi } from "vitest";

import { PoolDisposedError, PoolError, createPool } from "../src/index.js";

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

interface Obj {
  value: number;
}

function makeOpts(size: number) {
  const create = vi.fn((): Obj => ({ value: 0 }));
  const reset = vi.fn((o: Obj) => {
    o.value = 0;
  });
  return { size, create, reset };
}

// ---------------------------------------------------------------------------
// Br. borrow() helper
// ---------------------------------------------------------------------------

describe("Br. borrow()", () => {
  it("Br1. sync: returns fn result; reset called once after borrow completes", () => {
    const opts = makeOpts(1);
    const pool = createPool(opts);
    opts.reset.mockClear();
    const result = pool.borrow((obj) => {
      obj.value = 7;
      return obj.value;
    });
    expect(result).toBe(7);
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(1);
    expect(opts.reset).toHaveBeenCalledOnce();
  });

  it("Br2. sync: fn throws → borrow rethrows; slot released (alive back to 0)", () => {
    const pool = createPool(makeOpts(1));
    expect(() =>
      pool.borrow((_obj) => {
        throw new Error("sync boom");
      }),
    ).toThrow("sync boom");
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(1);
  });

  it("Br3. async: resolves with fn return value; release runs after resolve", async () => {
    const opts = makeOpts(1);
    const pool = createPool(opts);
    opts.reset.mockClear();
    const result = await pool.borrow(async (obj) => {
      obj.value = 42;
      return obj.value;
    });
    expect(result).toBe(42);
    expect(pool.alive).toBe(0);
    expect(opts.reset).toHaveBeenCalledOnce();
  });

  it("Br4. async: fn rejects → borrow rejects; release still runs", async () => {
    const opts = makeOpts(1);
    const pool = createPool(opts);
    opts.reset.mockClear();
    await expect(
      pool.borrow(async (_obj) => {
        throw new Error("async boom");
      }),
    ).rejects.toThrow("async boom");
    expect(pool.alive).toBe(0);
    expect(opts.reset).toHaveBeenCalledOnce();
  });

  it("Br5. INV2 pre-abort: already-aborted signal → rejects AbortError; fn not called; no acquire", () => {
    const pool = createPool(makeOpts(1));
    const ctrl = new AbortController();
    ctrl.abort();
    const fn = vi.fn(async (_obj: Obj) => 0);
    const p = pool.borrow(fn, { signal: ctrl.signal });
    expect(fn).not.toHaveBeenCalled();
    expect(pool.alive).toBe(0); // no acquire happened
    return expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("Br6. INV2 abort-during-pending: borrow rejects AbortError; release runs immediately", async () => {
    const pool = createPool(makeOpts(1));
    const ctrl = new AbortController();

    let resolveInner!: () => void;
    const innerDone = new Promise<void>((res) => {
      resolveInner = res;
    });

    const borrowPromise = pool.borrow(
      async (_obj, _signal) => {
        // park until test drives abort
        await innerDone;
        return 1;
      },
      { signal: ctrl.signal },
    );

    // slot is held
    expect(pool.alive).toBe(1);

    // abort while fn is still running
    ctrl.abort();

    await expect(borrowPromise).rejects.toMatchObject({ name: "AbortError" });
    // slot released after abort
    expect(pool.alive).toBe(0);

    // resolve inner work after the fact — should not cause double-release
    resolveInner();
    await new Promise<void>((r) => setTimeout(r, 0)); // let microtasks drain
    expect(pool.alive).toBe(0);
  });

  it("Br7. abort with custom reason → borrow rejects with that exact reason", async () => {
    const pool = createPool(makeOpts(1));
    const ctrl = new AbortController();
    const customReason = new Error("custom abort reason");

    let resolveInner!: () => void;
    const innerDone = new Promise<void>((res) => {
      resolveInner = res;
    });

    const borrowPromise = pool.borrow(
      async (_obj, _signal) => {
        await innerDone;
        return 1;
      },
      { signal: ctrl.signal },
    );

    ctrl.abort(customReason);
    await expect(borrowPromise).rejects.toBe(customReason);
    resolveInner();
    await new Promise<void>((r) => setTimeout(r, 0));
  });

  it("Br8. ?? fallback: signal aborted with reason=undefined → rejects DOMException AbortError", async () => {
    // Deliberately construct a signal where .reason is undefined (the ?? branch).
    const pool = createPool(makeOpts(1));
    const ctrl = new AbortController();
    // Abort with undefined so signal.reason is undefined
    ctrl.abort(undefined);
    // At this point signal.aborted is true but signal.reason may be the default
    // DOMException (in Node 18+). We need to force reason to be literally undefined.
    // Override via Object.defineProperty to exercise the ?? fallback.
    Object.defineProperty(ctrl.signal, "reason", { value: undefined, configurable: true });

    const p = pool.borrow(async (_obj) => 0, { signal: ctrl.signal });
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
  });

  it("Br9. INV4: dispose before borrow → throws PoolDisposedError synchronously", () => {
    const pool = createPool(makeOpts(1));
    pool.dispose();
    expect(() => pool.borrow((_obj) => 0)).toThrow(PoolDisposedError);
  });

  it("Br10. INV5: 'null' mode full → borrow throws PoolError synchronously; fn not called", () => {
    const pool = createPool({ ...makeOpts(1), onOverflow: "null" });
    pool.acquire(); // exhaust
    const fn = vi.fn((_obj: Obj) => 0);
    expect(() => pool.borrow(fn)).toThrow(PoolError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("Br11. INV-once: abort then inner settles → release exactly once; no double-release PoolError", async () => {
    const opts = makeOpts(1);
    const pool = createPool(opts);
    const ctrl = new AbortController();

    let resolveInner!: (v: number) => void;
    const innerDone = new Promise<number>((res) => {
      resolveInner = res;
    });

    const borrowPromise = pool.borrow(
      async (_obj, _signal) => {
        return await innerDone;
      },
      { signal: ctrl.signal },
    );

    ctrl.abort();
    await expect(borrowPromise).rejects.toMatchObject({ name: "AbortError" });
    // slot already released by abort path
    expect(pool.alive).toBe(0);

    opts.reset.mockClear();
    // inner promise settles later — must not cause second release
    resolveInner(99);
    await new Promise<void>((r) => setTimeout(r, 10));
    // reset should NOT have been called again (no double-release)
    expect(opts.reset).not.toHaveBeenCalled();
    expect(pool.alive).toBe(0);
  });

  it("Br12. listener cleanup: after borrow resolves, aborting the same signal does nothing", async () => {
    const pool = createPool(makeOpts(1));
    const ctrl = new AbortController();

    await pool.borrow(async (_obj) => 42, { signal: ctrl.signal });
    expect(pool.alive).toBe(0);

    // abort after borrow has already resolved — must not throw or double-release
    expect(() => ctrl.abort()).not.toThrow();
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(1);
  });

  it("Br13. borrow success but reset throws → borrow throws reset error; slot lost (alive+available −1)", () => {
    const throwingReset = vi.fn((_o: Obj) => {
      throw new Error("reset exploded");
    });
    const pool = createPool({ size: 1, create: () => ({ value: 0 }), reset: throwingReset });
    expect(() =>
      pool.borrow((_obj) => {
        return 1; // sync success — release will run, reset will throw
      }),
    ).toThrow("reset exploded");
    // slot lost: alive=0 (deleted from aliveSet before reset), available=0 (push never ran)
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(0);
  });

  it("Br14. abort + reset throws → reset error surfaces (finally-throw semantics); latch prevents second release", async () => {
    const throwingReset = vi.fn((_o: Obj) => {
      throw new Error("reset in abort path");
    });
    const pool = createPool({ size: 1, create: () => ({ value: 0 }), reset: throwingReset });
    const ctrl = new AbortController();

    let resolveInner!: () => void;
    const innerDone = new Promise<void>((res) => {
      resolveInner = res;
    });

    const borrowPromise = pool.borrow(
      async (_obj, _signal) => {
        await innerDone;
        return 1;
      },
      { signal: ctrl.signal },
    );

    ctrl.abort();
    // The .finally calls releaseOnce → release → reset throws → finally rethrows reset error
    // (reset error masks the AbortError per JS finally-throw semantics)
    await expect(borrowPromise).rejects.toThrow("reset in abort path");
    // slot lost (same as C5/Br13 path)
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(0);
    // resolve inner — latch must prevent any second release attempt
    resolveInner();
    await new Promise<void>((r) => setTimeout(r, 0));
    // no further error: latch blocked second release
  });

  it("Br15. borrow respects 'grow': full + 'grow' → borrow grows pool and executes fn (does not throw)", async () => {
    const pool = createPool({ ...makeOpts(1), onOverflow: "grow" });
    pool.acquire(); // exhaust

    const result = await pool.borrow(async (obj) => {
      obj.value = 55;
      return obj.value;
    });
    expect(result).toBe(55);
    expect(pool.alive).toBe(1); // the manually-acquired obj still alive
  });

  it("Br16. sync fn returning non-Promise thenable is treated as sync (release already ran)", () => {
    const pool = createPool(makeOpts(1));
    // biome-ignore lint/suspicious/noThenProperty: intentional test of non-Promise thenable dispatch
    const thenable = { then: (res: (v: number) => void) => res(7) };
    const result = pool.borrow((_obj) => thenable as unknown as number);
    // Result is the thenable, not a Promise; release has already executed
    expect(result).toBe(thenable);
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(1);
  });

  it("Br17. abort + late-settle does not double-release (latch false-branch is unreachable safeguard under single-.finally design)", async () => {
    // This test verifies that abort + a late-settling inner promise does not cause
    // a double-release PoolError. Under the single-.finally design, ro() is invoked
    // exactly once via .finally; the latch false-branch is a defensive safeguard
    // that is unreachable in the current implementation, not an exercised code path.
    const opts = makeOpts(2); // size=2 so we can confirm alive stays consistent
    const pool = createPool(opts);
    const ctrl = new AbortController();

    // Track how many times reset is called — should be exactly 1 despite two releaseOnce calls.
    opts.reset.mockClear();

    let resolveInner!: (v: number) => void;
    const innerP = new Promise<number>((res) => {
      resolveInner = res;
    });

    const borrowPromise = pool.borrow(async (_obj, _signal) => await innerP, {
      signal: ctrl.signal,
    });

    // abort — triggers outer promise rejection and schedules releaseOnce via .finally
    ctrl.abort();

    // resolve inner BEFORE the abort .finally has run (microtask race)
    resolveInner(1);

    // Both paths eventually call releaseOnce; latch must ensure only 1 release.
    // We don't care which rejects — just that no PoolError is thrown.
    await borrowPromise.catch(() => {
      /* absorb AbortError */
    });

    // Let all microtasks settle
    await new Promise<void>((r) => setTimeout(r, 10));

    expect(opts.reset).toHaveBeenCalledTimes(1);
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(2); // original 2 slots back
  });

  it("Br18. in-flight abort with reason=undefined → rejects DOMException AbortError (in-flight ?? branch)", async () => {
    const pool = createPool(makeOpts(1));
    const ctrl = new AbortController();

    let resolveInner!: () => void;
    const innerDone = new Promise<void>((res) => {
      resolveInner = res;
    });

    const borrowPromise = pool.borrow(
      async (_obj, _signal) => {
        await innerDone;
        return 1;
      },
      { signal: ctrl.signal },
    );

    // Override reason to undefined to force the ?? fallback inside the in-flight abort handler
    Object.defineProperty(ctrl.signal, "reason", { value: undefined, configurable: true });
    ctrl.abort(undefined);

    const err = await borrowPromise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");

    resolveInner();
    await new Promise<void>((r) => setTimeout(r, 0));
  });

  it("Br19. F1 regression: fn synchronously aborts before its first await → borrow rejects AbortError; slot released immediately", async () => {
    // Regression for F1: if fn calls ctrl.abort() synchronously (before any await),
    // the abort event fires before the listener is attached. The immediate-abort guard
    // (`if (signal.aborted) onAbort()`) ensures the rejection is delivered correctly.
    const pool = createPool(makeOpts(1));
    const ctrl = new AbortController();

    const borrowPromise = pool.borrow(
      async (_obj, _signal) => {
        // Synchronously abort before any await — signal is aborted before the
        // addEventListener("abort", ...) listener fires.
        ctrl.abort();
        // Now yield; the pool should have already rejected via the guard.
        await Promise.resolve();
        return 1;
      },
      { signal: ctrl.signal },
    );

    await expect(borrowPromise).rejects.toMatchObject({ name: "AbortError" });
    // Slot must be released immediately (not waiting for the inner promise to settle).
    expect(pool.alive).toBe(0);
  });

  it("Br20. INV7 regression: dispose() called while async borrow is in-flight → borrow rejects PoolDisposedError (masks fn result)", async () => {
    // Documents INV7: when dispose() races an in-flight async borrow, the finally
    // block's release() throws PoolDisposedError, which surfaces from .finally and
    // masks whatever fn returned or threw. The caller always sees PoolDisposedError.
    const pool = createPool(makeOpts(1));

    let resolveInner!: (v: number) => void;
    const innerDone = new Promise<number>((res) => {
      resolveInner = res;
    });

    const borrowPromise = pool.borrow(async (_obj) => {
      // park until test disposes the pool
      return await innerDone;
    });

    // slot is held while fn is parked
    expect(pool.alive).toBe(1);

    // dispose while borrow is in-flight
    pool.dispose();
    expect(pool.disposed).toBe(true);

    // let fn resolve normally — the finally block will attempt release on
    // the now-disposed pool and throw PoolDisposedError, masking the result
    resolveInner(42);

    await expect(borrowPromise).rejects.toBeInstanceOf(PoolDisposedError);
    // pool is disposed; alive/available both 0
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(0);
  });
});
