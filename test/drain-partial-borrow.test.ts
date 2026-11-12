import { describe, expect, it } from "vitest";
import { createPool } from "../src/index.js";

interface Obj {
  id: number;
}

describe("partial drain() must not cancel borrow()'s release", () => {
  it("async borrow still releases its slot when drain() threw before reaching it", async () => {
    let n = 0;
    let poison: Obj | undefined;
    const pool = createPool<Obj>({
      create: () => ({ id: n++ }),
      reset: (o) => {
        if (o === poison) throw new Error("reset boom");
      },
      size: 2,
    });
    const a = pool.acquire();
    poison = a;
    let finish!: () => void;
    const p = pool.borrow(
      () =>
        new Promise<void>((res) => {
          finish = res;
        }),
    );
    expect(pool.alive).toBe(2);
    expect(() => pool.drain()).toThrow("reset boom");
    expect(pool.alive).toBe(1);
    finish();
    await p;
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(1);
  });

  it("sync borrow still releases its slot when a drain() inside fn threw before reaching it", () => {
    let n = 0;
    let poison: Obj | undefined;
    const pool = createPool<Obj>({
      create: () => ({ id: n++ }),
      reset: (o) => {
        if (o === poison) throw new Error("reset boom");
      },
      size: 2,
    });
    const a = pool.acquire();
    poison = a;
    pool.borrow(() => {
      try {
        pool.drain();
      } catch {
        /* caller guards the documented reset-throw */
      }
    });
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(1);
  });

  it("async borrow skips release when drain() reclaimed its own object and reset() threw on it", async () => {
    // Guard: the borrowed object counts as reclaimed once drain() removed it from
    // alive, even though its reset() threw (slot lost per POL-R-01, no double-release).
    let poison: Obj | undefined;
    const pool = createPool<Obj>({
      create: () => ({ id: 0 }),
      reset: (o) => {
        if (o === poison) throw new Error("reset boom");
      },
      size: 1,
    });
    let finish!: () => void;
    const p = pool.borrow((obj) => {
      poison = obj;
      return new Promise<void>((res) => {
        finish = res;
      });
    });
    expect(() => pool.drain()).toThrow("reset boom");
    finish();
    await expect(p).resolves.toBeUndefined();
    expect(pool.alive).toBe(0);
    expect(pool.available).toBe(0);
  });
});
