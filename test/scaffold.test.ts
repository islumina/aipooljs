// Scaffold-stage placeholder test. Asserts that the public surface compiles
// and is shaped correctly so vitest can run against a non-empty test set
// while the implementation is still a `throw` stub. Real tests land in 0.1.0.

import { describe, expect, it } from "vitest";

import {
  type Pool,
  PoolDisposedError,
  PoolError,
  type PoolOptions,
  createPool,
} from "../src/index.js";

describe("aipooljs scaffold", () => {
  it("exports a callable createPool factory", () => {
    expect(typeof createPool).toBe("function");
  });

  it("exports PoolError and PoolDisposedError classes", () => {
    expect(new PoolError("x")).toBeInstanceOf(Error);
    expect(new PoolDisposedError("x")).toBeInstanceOf(Error);
    expect(new PoolError("x").name).toBe("PoolError");
    expect(new PoolDisposedError("x").name).toBe("PoolDisposedError");
  });

  it("createPool throws the scaffold sentinel until 0.1.0", () => {
    const opts: PoolOptions<{ x: number }> = {
      create: () => ({ x: 0 }),
      reset: (o) => {
        o.x = 0;
      },
      size: 4,
    };
    expect(() => createPool(opts)).toThrow(/not implemented/);
  });

  it("public Pool<T> shape compiles", () => {
    // Type-level assertion only: this code path is never executed.
    const _typeProbe = (p: Pool<{ x: number }>): void => {
      void p.acquire;
      void p.release;
      void p.drain;
      void p.dispose;
      void p.alive;
      void p.available;
      void p.disposed;
    };
    void _typeProbe;
  });
});
