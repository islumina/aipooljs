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
// A. Construction & validation
// ---------------------------------------------------------------------------

describe("A. Construction & validation", () => {
  it("A1. createPool({size: 4}) allocates exactly 4 objects via create()", () => {
    const opts = makeOpts(4);
    createPool(opts);
    expect(opts.create).toHaveBeenCalledTimes(4);
  });

  it("A2. size: 0 is legal; acquire() throws immediately", () => {
    const pool = createPool(makeOpts(0));
    expect(pool.available).toBe(0);
    expect(pool.alive).toBe(0);
    expect(() => pool.acquire()).toThrow(PoolError);
  });

  it("A3. size: -1 throws PoolError from factory", () => {
    expect(() => createPool({ ...makeOpts(0), size: -1 })).toThrow(PoolError);
  });

  it("A4. size: 1.5 throws PoolError from factory", () => {
    expect(() => createPool({ ...makeOpts(0), size: 1.5 })).toThrow(PoolError);
  });

  it("A5. create() throwing on slot 3 of 5 throws from factory; no partial pool returned", () => {
    let call = 0;
    const opts = {
      size: 5,
      create: () => {
        call++;
        if (call === 3) throw new Error("boom");
        return { value: 0 };
      },
      reset: (_o: Obj) => {},
    };
    expect(() => createPool(opts)).toThrow("boom");
  });
});

// ---------------------------------------------------------------------------
// B. acquire
// ---------------------------------------------------------------------------

describe("B. acquire", () => {
  it("B1. acquire returns one of the pre-allocated objects", () => {
    const pool = createPool(makeOpts(2));
    const obj = pool.acquire();
    expect(obj).toBeDefined();
    expect(typeof obj.value).toBe("number");
  });

  it("B2. acquire decreases available, increases alive", () => {
    const pool = createPool(makeOpts(3));
    expect(pool.available).toBe(3);
    expect(pool.alive).toBe(0);
    pool.acquire();
    expect(pool.available).toBe(2);
    expect(pool.alive).toBe(1);
  });

  it("B3. acquire exhausts the pool; further acquire throws PoolError", () => {
    const pool = createPool(makeOpts(2));
    pool.acquire();
    pool.acquire();
    expect(() => pool.acquire()).toThrow(PoolError);
  });

  it("B4. acquire returns LIFO (last released first)", () => {
    const pool = createPool(makeOpts(3));
    const a = pool.acquire();
    const b = pool.acquire();
    pool.release(a);
    pool.release(b);
    // b was released last → b is first acquired
    expect(pool.acquire()).toBe(b);
    expect(pool.acquire()).toBe(a);
  });

  it("B5. returned object IS one of the originals — verify by reference", () => {
    const originals: Obj[] = [];
    const pool = createPool({
      size: 2,
      create: () => {
        const o: Obj = { value: 0 };
        originals.push(o);
        return o;
      },
      reset: (o) => {
        o.value = 0;
      },
    });
    const obj = pool.acquire();
    expect(originals).toContain(obj);
  });
});

// ---------------------------------------------------------------------------
// C. release
// ---------------------------------------------------------------------------

describe("C. release", () => {
  it("C1. release calls reset(obj) exactly once", () => {
    const opts = makeOpts(1);
    const pool = createPool(opts);
    const obj = pool.acquire();
    opts.reset.mockClear();
    pool.release(obj);
    expect(opts.reset).toHaveBeenCalledOnce();
    expect(opts.reset).toHaveBeenCalledWith(obj);
  });

  it("C2. release returns object to available; counters flip back", () => {
    const pool = createPool(makeOpts(1));
    const obj = pool.acquire();
    expect(pool.alive).toBe(1);
    expect(pool.available).toBe(0);
    pool.release(obj);
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(1);
  });

  it("C3. double release throws PoolError", () => {
    const pool = createPool(makeOpts(2));
    const obj = pool.acquire();
    pool.release(obj);
    expect(() => pool.release(obj)).toThrow(PoolError);
  });

  it("C4. release(foreign) throws PoolError", () => {
    const pool = createPool(makeOpts(1));
    const foreign: Obj = { value: 99 };
    expect(() => pool.release(foreign)).toThrow(PoolError);
  });

  it("C5. reset throws → release rethrows; object gone from both available and aliveSet", () => {
    const throwingReset = vi.fn((_o: Obj) => {
      throw new Error("reset exploded");
    });
    const pool = createPool({ size: 1, create: () => ({ value: 0 }), reset: throwingReset });
    const obj = pool.acquire();
    expect(() => pool.release(obj)).toThrow("reset exploded");
    // obj is in neither set: aliveSet.delete runs before reset, available.push never runs
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(0);
  });

  it("C6. release on object acquired, released, and re-acquired works cleanly", () => {
    const pool = createPool(makeOpts(1));
    const obj = pool.acquire();
    pool.release(obj);
    const obj2 = pool.acquire();
    expect(obj2).toBe(obj);
    expect(() => pool.release(obj2)).not.toThrow();
    expect(pool.available).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// D. drain
// ---------------------------------------------------------------------------

describe("D. drain", () => {
  it("D1. drain returns every alive object to available; counters reflect", () => {
    const pool = createPool(makeOpts(3));
    pool.acquire();
    pool.acquire();
    expect(pool.alive).toBe(2);
    pool.drain();
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(3);
  });

  it("D2. drain calls reset on every alive object", () => {
    const opts = makeOpts(3);
    const pool = createPool(opts);
    pool.acquire();
    pool.acquire();
    pool.acquire();
    opts.reset.mockClear();
    pool.drain();
    expect(opts.reset).toHaveBeenCalledTimes(3);
  });

  it("D3. drain on empty pool (nothing alive) is no-op, zero reset calls", () => {
    const opts = makeOpts(2);
    const pool = createPool(opts);
    opts.reset.mockClear();
    pool.drain();
    expect(opts.reset).not.toHaveBeenCalled();
    expect(pool.available).toBe(2);
  });

  it("D4. drain snapshots aliveSet — acquire N, drain, then acquire N more works", () => {
    const pool = createPool(makeOpts(3));
    pool.acquire();
    pool.acquire();
    pool.acquire();
    pool.drain();
    // All 3 available again
    expect(() => {
      pool.acquire();
      pool.acquire();
      pool.acquire();
    }).not.toThrow();
  });

  it("D5. drain with reset throwing on object 2 of 3 — first drained, second lost, third not processed", () => {
    // Set iteration order is insertion order. Objects are acquired 1, 2, 3.
    // Snapshot: [o1, o2, o3]. Drain loop:
    //   o1: delete from aliveSet, reset (call 1 ok), push to available → alive=2, avail=1
    //   o2: delete from aliveSet, reset (call 2 throws) → alive=1, avail=1, o2 lost
    //   o3: not processed (rethrown) → alive=1, avail=1
    let callCount = 0;
    const pool = createPool({
      size: 3,
      create: () => ({ value: 0 }),
      reset: (_o: Obj) => {
        callCount++;
        if (callCount === 2) throw new Error("reset fail");
      },
    });
    pool.acquire();
    pool.acquire();
    pool.acquire();
    expect(() => pool.drain()).toThrow("reset fail");
    expect(pool.alive).toBe(1);
    expect(pool.available).toBe(1);
  });

  it("D6. drain with a reset that re-entrantly releases a later snapshot entry resets and frees it once", () => {
    // parent's reset releases child, which also sits later in drain's snapshot.
    interface Node {
      children: Node[];
    }
    const pool = createPool<Node>({
      size: 3,
      create: () => ({ children: [] }),
      reset: (n) => {
        for (const c of n.children) pool.release(c);
        n.children.length = 0;
      },
    });
    const parent = pool.acquire();
    const child = pool.acquire();
    parent.children.push(child);
    pool.drain();
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(3);
    const x = pool.acquire();
    const y = pool.acquire();
    const z = pool.acquire();
    expect(new Set([x, y, z]).size).toBe(3);
    pool.release(x);
    pool.release(y);
    expect(() => pool.release(z)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// E. dispose
// ---------------------------------------------------------------------------

describe("E. dispose", () => {
  it("E1. dispose is idempotent", () => {
    const pool = createPool(makeOpts(2));
    pool.dispose();
    expect(() => pool.dispose()).not.toThrow();
  });

  it("E2. dispose clears available and aliveSet; alive===0 available===0 disposed===true", () => {
    const pool = createPool(makeOpts(3));
    pool.acquire();
    pool.dispose();
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(0);
    expect(pool.disposed).toBe(true);
  });

  it("E3. dispose does NOT call reset on alive objects", () => {
    const opts = makeOpts(3);
    const pool = createPool(opts);
    pool.acquire();
    pool.acquire();
    opts.reset.mockClear();
    pool.dispose();
    expect(opts.reset).not.toHaveBeenCalled();
  });

  it("E4. post-dispose acquire / release / drain all throw PoolDisposedError", () => {
    const pool = createPool(makeOpts(2));
    const obj = pool.acquire();
    pool.dispose();
    expect(() => pool.acquire()).toThrow(PoolDisposedError);
    expect(() => pool.release(obj)).toThrow(PoolDisposedError);
    expect(() => pool.drain()).toThrow(PoolDisposedError);
  });

  it("E5. disposed getter reflects state correctly", () => {
    const pool = createPool(makeOpts(1));
    expect(pool.disposed).toBe(false);
    pool.dispose();
    expect(pool.disposed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F. Destructurable + getters
// ---------------------------------------------------------------------------

describe("F. Destructurable + getters", () => {
  it("F1. const { acquire, release } = pool; acquire() works without this", () => {
    const pool = createPool(makeOpts(2));
    const { acquire, release } = pool;
    const obj = acquire();
    expect(obj).toBeDefined();
    expect(() => release(obj)).not.toThrow();
  });

  it("F2. pool.alive getter is reactive (reflects mutations)", () => {
    const pool = createPool(makeOpts(2));
    expect(pool.alive).toBe(0);
    const o = pool.acquire();
    expect(pool.alive).toBe(1);
    pool.release(o);
    expect(pool.alive).toBe(0);
  });

  it("F3. pool.available getter is reactive", () => {
    const pool = createPool(makeOpts(2));
    expect(pool.available).toBe(2);
    pool.acquire();
    expect(pool.available).toBe(1);
  });

  it("F4. pool.disposed getter is reactive", () => {
    const pool = createPool(makeOpts(1));
    expect(pool.disposed).toBe(false);
    pool.dispose();
    expect(pool.disposed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// G. Invariant property
// ---------------------------------------------------------------------------

describe("G. Invariant property", () => {
  it("G1. alive + available === size at every step in a random acquire/release/drain sequence", () => {
    const size = 5;
    const pool = createPool(makeOpts(size));
    const acquired: ReturnType<typeof pool.acquire>[] = [];

    const check = () => expect(pool.alive + pool.available).toBe(size);

    check();

    // Acquire all
    for (let i = 0; i < size; i++) {
      acquired.push(pool.acquire());
      check();
    }

    // Release 3
    for (let i = 0; i < 3; i++) {
      const obj = acquired.pop();
      if (obj !== undefined) pool.release(obj);
      check();
    }

    // Acquire 2 more
    acquired.push(pool.acquire());
    check();
    acquired.push(pool.acquire());
    check();

    // Drain
    pool.drain();
    check();

    // Acquire 2
    acquired.push(pool.acquire());
    check();
    acquired.push(pool.acquire());
    check();
  });
});
