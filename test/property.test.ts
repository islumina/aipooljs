import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PoolError, createPool } from "../src/index.js";

// ---------------------------------------------------------------------------
// P. Property-based invariant tests (fast-check)
// No framework/DOM imports; AbortSignal/DOMException are node >=18 globals.
// ---------------------------------------------------------------------------

interface Obj {
  value: number;
}

describe("P. Property-based invariants", () => {
  it("P1. alive + available === size throughout any acquire/release/drain sequence", () => {
    // Arbitraries: pool size 1–8; sequence of operations encoded as numbers.
    // 0 = acquire (if pool not full), 1 = release (if alive > 0), 2 = drain.
    //
    // NOTE: this property holds for the fixed-capacity overflow modes — 'throw'
    // (the default) and 'null' (overflow returns null without mutating
    // alive/available). Under 'grow', the invariant becomes
    // `alive + available === currentCapacity` (which doubles on each grow event);
    // the function-handler escape hatch can likewise change capacity. See P3
    // below for the 'grow' variant.
    const opArb = fc.integer({ min: 0, max: 2 });
    const sizeArb = fc.integer({ min: 1, max: 8 });

    fc.assert(
      fc.property(sizeArb, fc.array(opArb, { minLength: 0, maxLength: 50 }), (size, ops) => {
        const pool = createPool<Obj>({
          size,
          create: () => ({ value: 0 }),
          reset: (o) => {
            o.value = 0;
          },
        });
        const acquired: Obj[] = [];

        const check = () => {
          expect(pool.alive + pool.available).toBe(size);
        };

        check();

        for (const op of ops) {
          if (op === 0 && pool.available > 0) {
            // acquire only when space available
            acquired.push(pool.acquire());
          } else if (op === 1 && acquired.length > 0) {
            // release the most-recently acquired
            const obj = acquired.pop()!;
            pool.release(obj);
          } else if (op === 2) {
            acquired.length = 0; // drain returns everything
            pool.drain();
          }
          check();
        }
      }),
      { numRuns: 100 },
    );
  });

  it("P2. double-release always throws PoolError regardless of pool size", () => {
    const sizeArb = fc.integer({ min: 1, max: 8 });

    fc.assert(
      fc.property(sizeArb, (size) => {
        const pool = createPool<Obj>({
          size,
          create: () => ({ value: 0 }),
          reset: (o) => {
            o.value = 0;
          },
        });
        const obj = pool.acquire();
        pool.release(obj);
        expect(() => pool.release(obj)).toThrow(PoolError);
      }),
      { numRuns: 100 },
    );
  });

  it("P3. 'grow' invariant: alive + available === currentCapacity (doubles on each grow) — no phantom slots", () => {
    // Under 'grow', capacity doubles each time the pool is exhausted. After k
    // grows from an initial size of `s`, currentCapacity === s * 2^k and
    // alive + available must equal that value with no phantom slots.
    const sizeArb = fc.integer({ min: 1, max: 4 }); // keep small: each grow doubles
    const growsArb = fc.integer({ min: 1, max: 3 }); // number of grow events to trigger

    fc.assert(
      fc.property(sizeArb, growsArb, (initSize, numGrows) => {
        const pool = createPool<Obj>({
          size: initSize,
          create: () => ({ value: 0 }),
          reset: (o) => {
            o.value = 0;
          },
          onOverflow: "grow",
        });

        let expectedCapacity = initSize;
        const held: Obj[] = [];

        for (let g = 0; g < numGrows; g++) {
          // Exhaust current capacity to trigger the next grow event.
          while (pool.available > 0) {
            held.push(pool.acquire());
          }
          // One more acquire triggers grow: capacity doubles.
          held.push(pool.acquire());
          expectedCapacity *= 2;

          // After each grow event the invariant must hold immediately.
          expect(pool.alive + pool.available).toBe(expectedCapacity);
        }

        // Release everything and confirm the invariant still holds.
        for (const obj of held) pool.release(obj);
        expect(pool.alive + pool.available).toBe(expectedCapacity);
        expect(pool.alive).toBe(0);
        expect(pool.available).toBe(expectedCapacity);
      }),
      { numRuns: 50 },
    );
  });
});
