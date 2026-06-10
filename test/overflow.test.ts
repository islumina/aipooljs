import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { PoolDisposedError, PoolError, createPool } from "../src/index.js";
import type { Pool } from "../src/index.js";

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
// O. onOverflow behaviour
// ---------------------------------------------------------------------------

describe("O. onOverflow", () => {
  it("O1. default (omit) === 'throw': full pool → acquire throws PoolError", () => {
    const pool = createPool(makeOpts(1));
    pool.acquire();
    expect(() => pool.acquire()).toThrow(PoolError);
  });

  it("O2. explicit 'throw' same as default", () => {
    const pool = createPool({ ...makeOpts(1), onOverflow: "throw" });
    pool.acquire();
    expect(() => pool.acquire()).toThrow(PoolError);
  });

  it("O3. 'null': full pool → acquire returns null; alive/available unchanged", () => {
    const pool = createPool({ ...makeOpts(1), onOverflow: "null" });
    pool.acquire();
    expect(pool.alive).toBe(1);
    expect(pool.available).toBe(0);
    const result = pool.acquire();
    expect(result).toBeNull();
    // state must not change
    expect(pool.alive).toBe(1);
    expect(pool.available).toBe(0);
  });

  it("O4. 'null' type-level: acquire() infers T | null; default pool infers T", () => {
    const nullPool = createPool({ ...makeOpts(2), onOverflow: "null" });
    const defaultPool = createPool(makeOpts(2));
    // Use expectTypeOf for exact type enforcement — a plain assignment would pass
    // even if acquire() were mistakenly narrowed to T (Obj is assignable to Obj|null).
    expectTypeOf(nullPool.acquire()).toEqualTypeOf<Obj | null>();
    expectTypeOf(defaultPool.acquire()).toEqualTypeOf<Obj>();
    // Also verify runtime values while we have the pool open.
    expect(nullPool.acquire()).not.toBeNull(); // pool not yet full, returns real object
    expect(defaultPool.acquire()).toBeDefined();
  });

  it("O5. 'grow': full pool → create() called capacity more times; alive+available === 2×size", () => {
    const opts = makeOpts(2);
    const pool = createPool({ ...opts, onOverflow: "grow" });
    opts.create.mockClear(); // clear the 2 initial calls
    pool.acquire();
    pool.acquire();
    // pool now full — next acquire triggers grow
    pool.acquire();
    // grow pushes capacity (2) new objects
    expect(opts.create).toHaveBeenCalledTimes(2);
    // alive=3, available=1 → total=4 = 2×2
    expect(pool.alive + pool.available).toBe(4);
  });

  it("O6. 'grow': grow after full → acquire returns real object; LIFO still holds", () => {
    const pool = createPool({ ...makeOpts(1), onOverflow: "grow" });
    pool.acquire(); // exhaust
    const obj = pool.acquire(); // triggers grow, returns newly created obj
    expect(obj).toBeDefined();
    expect(typeof obj.value).toBe("number");
    // release and re-acquire to verify LIFO
    pool.release(obj);
    expect(pool.acquire()).toBe(obj);
  });

  it("O7. 'grow': two consecutive grows (size→2×→4×) — counts correct (no off-by-one)", () => {
    const pool = createPool({ ...makeOpts(2), onOverflow: "grow" });
    // exhaust initial 2
    pool.acquire();
    pool.acquire();
    // 1st grow: adds 2, capacity=4; acquire one of them
    pool.acquire();
    expect(pool.alive + pool.available).toBe(4);
    // exhaust remaining 1 from first grow
    pool.acquire();
    // 2nd grow: adds 4, capacity=8; acquire one of them
    pool.acquire();
    expect(pool.alive + pool.available).toBe(8);
  });

  it("O8. function handler: full pool → handler receives pool; returned obj enters aliveSet", () => {
    const handlerObj: Obj = { value: 99 };
    const handler = vi.fn((_pool: Pool<Obj>) => handlerObj);
    const pool = createPool({ ...makeOpts(1), onOverflow: handler });
    pool.acquire(); // exhaust
    const result = pool.acquire();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(pool);
    expect(result).toBe(handlerObj);
    // handlerObj is now alive
    expect(pool.alive).toBe(2);
  });

  it("O9. function handler: recycle-oldest escape hatch — handler returns already-alive obj (aliasing)", () => {
    // Acquire obj1 first; on overflow, handler returns obj1 (escape hatch).
    // obj1 is now aliased — both the first caller and the second caller hold it.
    const pool = createPool<Obj>({
      size: 1,
      create: () => ({ value: 0 }),
      reset: (o) => {
        o.value = 0;
      },
      onOverflow: (p) => {
        // grab from aliveSet via drain trick: drain returns items to available
        // but that would release them. Instead return the pool ref so we can
        // acquire the first alive object directly — we have to be creative here.
        // We use p.alive and p.available as a signal; the simplest escape hatch:
        // just drain and re-acquire (which modifies pool state — demonstrating
        // the danger).
        p.drain(); // resets obj1 back to available
        const recycled = p.acquire(); // takes obj1 out again
        return recycled;
      },
    });
    const obj1 = pool.acquire(); // slot taken
    obj1.value = 42;
    // overflow triggers: drain → acquire obj1
    const obj2 = pool.acquire();
    // obj2 IS obj1 (handler recycled it)
    expect(obj2).toBe(obj1);
    // alive should be 1 (drain removed, acquire re-added)
    expect(pool.alive).toBe(1);
  });

  it("O10. 'null' + subsequent release: null does not consume a slot; existing obj releases fine", () => {
    const pool = createPool({ ...makeOpts(2), onOverflow: "null" });
    const obj = pool.acquire();
    pool.acquire(); // exhaust 2nd slot
    const nullResult = pool.acquire(); // null, no slot taken
    expect(nullResult).toBeNull();
    // release the first obj — should work normally
    expect(() => pool.release(obj)).not.toThrow();
    expect(pool.available).toBe(1);
  });

  it("O11. dispose is checked before overflow — all strategies still throw PoolDisposedError after dispose", () => {
    for (const strategy of ["throw", "null", "grow"] as const) {
      const pool = createPool({ ...makeOpts(1), onOverflow: strategy });
      pool.dispose();
      expect(() => pool.acquire()).toThrow(PoolDisposedError);
    }
    // function handler strategy
    const poolFn = createPool({ ...makeOpts(1), onOverflow: () => ({ value: 0 }) });
    poolFn.dispose();
    expect(() => poolFn.acquire()).toThrow(PoolDisposedError);
  });

  // -------------------------------------------------------------------------
  // RED tests for wave 2026-06-10 — uncomment after fixes applied
  // -------------------------------------------------------------------------

  it("O13 [POL-S-02] onOverflow typo at construction → throws PoolError immediately (not deferred TypeError)", () => {
    // Before fix: createPool with onOverflow:"gorw" succeeds; TypeError only on
    // first overflow. After fix: construction throws PoolError right away.
    expect(() =>
      createPool({
        ...makeOpts(1),
        onOverflow: "gorw" as unknown as "grow",
      }),
    ).toThrow(PoolError);
  });

  it("O14 [POL-S-02] PoolError message contains 'aipooljs:' prefix", () => {
    expect(() =>
      createPool({
        ...makeOpts(1),
        onOverflow: "typo" as unknown as "throw",
      }),
    ).toThrow(/^aipooljs:/);
  });

  it("O15 [POL-R-02] size:0 + onOverflow:'grow' → acquire succeeds (pool grows from 0)", () => {
    // Before fix: 0 * 2 = 0, loop runs 0 times, take() hits empty-stack guard and throws.
    // After fix: Math.max(capacity, 1) ensures at least 1 object is created on first grow.
    const pool = createPool({ ...makeOpts(0), onOverflow: "grow" });
    expect(() => pool.acquire()).not.toThrow();
    expect(pool.alive).toBe(1);
    expect(pool.available).toBe(0); // grew by max(0,1)=1; one acquired
  });

  it("O16 [POL-B-01] handler that release(victim)+return victim → throws PoolError (avail∩alive disjointness)", () => {
    // Before fix: victim ends up in both avail and alive; second acquire() gets the
    // same aliased object silently.
    // After fix: the overflow path detects victim is already in avail and throws.
    const pool = createPool<Obj>({
      size: 1,
      create: () => ({ value: 0 }),
      reset: (o) => {
        o.value = 0;
      },
      onOverflow: (p) => {
        // Classic "evict oldest" misuse: release the single alive object, then
        // return it — corrupts avail∩alive invariant.
        const victim = p.acquire() as Obj; // no-op in overflow context; just to get ref
        // Actually we need to grab the already-alive object.
        // Use drain to push it back to avail, then return it from handler.
        p.drain(); // victim → avail
        return victim; // handler returns object that is now in avail
      },
    });

    const victim = pool.acquire();
    // After drain in handler, victim is in avail AND handler returns it.
    // This should throw PoolError now (not silently alias).
    expect(() => pool.acquire()).toThrow(PoolError);
    // pool state must not be corrupted — victim should still be cleanly releasable
    // (it was drained back to avail by the handler's drain() call)
    void victim;
  });

  it("O17 [POL-B-01] handler release(victim)+return victim — PoolError message has 'aipooljs:' prefix", () => {
    let victim!: Obj;
    const pool = createPool<Obj>({
      size: 1,
      create: () => ({ value: 0 }),
      reset: (o) => {
        o.value = 0;
      },
      onOverflow: (p) => {
        p.drain();
        return victim;
      },
    });
    victim = pool.acquire();
    expect(() => pool.acquire()).toThrow(/^aipooljs:/);
  });

  it("O18 [POL-B-01] sibling disjointness: second acquire after aliasing handler returns fresh object (no alias)", () => {
    // After the fix, a handler that returns an avail-resident object throws; a handler
    // returning a fresh object (correct usage) must still work as before (O8 shape).
    const fresh: Obj = { value: 77 };
    const pool = createPool<Obj>({
      size: 1,
      create: () => ({ value: 0 }),
      reset: (o) => {
        o.value = 0;
      },
      onOverflow: () => fresh,
    });
    pool.acquire();
    const result = pool.acquire(); // handler returns fresh object not in avail
    expect(result).toBe(fresh);
    expect(pool.alive).toBe(2);
  });

  it("O12. F2 regression: 'grow' is atomic — create() throwing on 2nd allocation leaves pool unchanged", () => {
    // Pool size=2 exhausted; on grow, create() will throw on the 2nd new allocation.
    // Before the fix, the 1st newly created object would already be in avail (partial
    // pollution). After the fix, the temp `grown` array is discarded and avail/capacity
    // are untouched — alive+available === 2 (the pre-grow total) and the pre-existing
    // alive objects are still valid.
    let callCount = 0;
    const existingObjects: Obj[] = [];
    const pool = createPool<Obj>({
      size: 2,
      create: () => {
        callCount++;
        if (callCount === 4) {
          // callCount 1,2 = initial construction; 3 = 1st grow alloc (ok); 4 = 2nd grow alloc (throw)
          throw new Error("create failed mid-grow");
        }
        const o: Obj = { value: callCount };
        existingObjects.push(o);
        return o;
      },
      reset: (o) => {
        o.value = 0;
      },
      onOverflow: "grow",
    });

    const [a, b] = [pool.acquire(), pool.acquire()]; // exhaust initial 2
    expect(pool.alive).toBe(2);
    expect(pool.available).toBe(0);

    const aliveBeforeGrow = pool.alive;
    const availableBeforeGrow = pool.available;

    // Trigger grow — should throw mid-grow
    expect(() => pool.acquire()).toThrow("create failed mid-grow");

    // Invariant: alive+available must equal pre-grow total (no partial slot pollution)
    expect(pool.alive + pool.available).toBe(aliveBeforeGrow + availableBeforeGrow);

    // Pre-existing alive objects must still be valid (release should not throw)
    expect(() => pool.release(a)).not.toThrow();
    expect(() => pool.release(b)).not.toThrow();
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(2);
  });

  it("O19 [POL-T-02] infinite-recursion hazard pin: handler that re-entrantly calls acquire() on exhausted pool → throws RangeError (stack overflow)", () => {
    // The JSDoc (src/index.ts:27–31) documents this hazard as contract.
    // This test pins that a handler calling acquire() without first freeing a slot
    // causes the documented RangeError, so a future refactor cannot silently change it.
    const pool = createPool<Obj>({
      size: 1,
      create: () => ({ value: 0 }),
      reset: (o) => {
        o.value = 0;
      },
      onOverflow: (p) => {
        // Re-entrantly acquires without releasing → infinite recursion.
        return p.acquire() as Obj;
      },
    });
    pool.acquire(); // exhaust
    expect(() => pool.acquire()).toThrow(RangeError);
  });
});
