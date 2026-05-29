# aipooljs

[![npm version](https://img.shields.io/npm/v/aipooljs.svg)](https://www.npmjs.com/package/aipooljs)
[![CI](https://github.com/yshengliao/aipooljs/actions/workflows/ci.yml/badge.svg)](https://github.com/yshengliao/aipooljs/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-brightgreen.svg)](LICENSE)
[![AI Generated](https://img.shields.io/badge/AI_Generated-Claude_Code_Opus_4.7_Max-blueviolet.svg)](https://www.anthropic.com/claude-code)
[![繁體中文](https://img.shields.io/badge/lang-繁體中文-red.svg)](README_ZHTW.md)

> A tiny, strict object pool for high-frequency `acquire()` / `release()` patterns — PixiJS Sprite pools, bullet pools, particle pools, DOM node recyclers, worker job slots. Fixed-size by default; fail-fast on overflow; double-release detection.

Part of the [ai\*js micro-runtime ecosystem](https://github.com/yshengliao) — see also [aifsmjs](https://github.com/yshengliao/aifsmjs) (FSM), [aiecsjs](https://github.com/yshengliao/aiecsjs) (ECS), [aibridgejs](https://github.com/yshengliao/aibridgejs) (cross-context RPC), [aieventjs](https://github.com/yshengliao/aieventjs) (event emitter), [aiquadtreejs](https://github.com/yshengliao/aiquadtreejs) (spatial partitioning), and [aiaudiojs](https://github.com/yshengliao/aiaudiojs) (Web Audio shell).

> **Status: 0.3.0 published.** API surface is stable; full implementation shipped.

---

## Why aipooljs

Web games and reactive UIs both have hot paths that churn the same shape of object many times per second: bullets fired and recycled, particles spawned and faded, list rows mounted and unmounted, worker jobs queued and drained. Letting V8's GC chase that churn produces stutter you can see — frame-time spikes where the major GC walks the heap. An object pool replaces that churn with a fixed buffer and constant-time slot reuse, which is exactly what the hot path needs.

`aipooljs` is the smallest pool API that gets the four things right:

- **Constant-time `acquire` / `release`** — backed by an internal stack (`push` / `pop` on a JS array), both are O(1). `Array.shift()` is O(n) and is the most common reason hand-rolled pools regress.
- **V8-friendly reset semantics** — the `reset(obj)` hook must clear fields by assignment, never by `delete`. Deletion demotes hidden classes and turns the steady-state loop megamorphic; the JSDoc states this explicitly so AI agents and humans converge on the same rule.
- **Double-release detection** — releasing the same object twice silently corrupts the available set and is the canonical pool bug. `aipooljs` tracks the alive set with a `Set` and throws `PoolError` on the second release.
- **Fixed size, fail-fast on overflow** — auto-grow makes the pool's worst-case unpredictable (a single big allocation can stutter the same frame the pool was supposed to protect). Overflow throws so you fix the upstream rate, not the pool.

What this is **not**: not a connection pool, not a thread pool, not a generic resource manager. The contract is "fixed buffer of plain objects with O(1) check-out/check-in" — narrow on purpose so the gzip stays around 600 B and the cognitive surface stays under five minutes.

> `aipooljs` is one of the four 0.3-cycle siblings joining the family — alongside [aiquadtreejs](https://github.com/yshengliao/aiquadtreejs) (spatial broadphase), `aieventjs` (typed events; self-built, not a `mitt` fork), and `aiaudiojs` (Web Audio shell over a Howler.js `peerDependency`).

---

## Quick Start

```bash
pnpm add aipooljs
```

```typescript
import { createPool } from "aipooljs";

// 1. Pre-allocate a fixed-size buffer.
const sprites = createPool({
  create: () => new PIXI.Sprite(bulletTexture),
  reset: (s) => {
    s.visible = false;
    s.x = 0;
    s.y = 0;
    s.alpha = 1;
  },
  size: 200,
});

// 2. Acquire in the hot path.
function fireBullet(x: number, y: number) {
  const s = sprites.acquire();   // O(1), no allocation
  s.visible = true;
  s.x = x;
  s.y = y;
  stage.addChild(s);
  return s;
}

// 3. Release when the entity dies.
function reclaim(s: PIXI.Sprite) {
  s.parent?.removeChild(s);
  sprites.release(s);            // O(1), reset() runs first
}
```

The contract is deliberately narrow. There's no async constructor and no priority queue; auto-grow is opt-in via `onOverflow: 'grow'`, never the default — the rest belongs in user-land when actually needed.

---

## Capabilities / Limitations

| Will do (v1)                                              | Won't do                                              |
| --------------------------------------------------------- | ----------------------------------------------------- |
| Fixed-size pre-allocation; opt-in auto-grow via `onOverflow: 'grow'` | Auto-grow by default (overflow throws `PoolError`; opt-in via `onOverflow`) |
| O(1) `acquire()` / `release()`; `drain()` is O(alive)     | Async object construction                             |
| Reset hook (V8-friendly: assign, never `delete`)          | Silent double-release (throws in all modes)           |
| `alive` / `available` / `disposed` read-only counters     | Connection pool / thread pool / DB pool               |
| `dispose()` idempotent; post-dispose calls throw          | Weak references (pool is intentionally strong-ref)    |
| Foreign-object release detection                          | Per-object metadata / generation counters             |

---

## API sketch

```typescript
type OverflowHandler<T> = 'throw' | 'null' | 'grow' | ((pool: Pool<T>) => T);

interface PoolOptions<T> {
  create: () => T;
  reset: (obj: T) => void;
  size: number;
  onOverflow?: OverflowHandler<T>; // default: 'throw'
}

interface Pool<T> {
  acquire(): T;
  release(obj: T): void;
  drain(): void;
  dispose(): void;
  borrow<R>(fn: (obj: T) => R): R;
  borrow<R>(fn: (obj: T, signal?: AbortSignal) => Promise<R>, opts?: { signal?: AbortSignal }): Promise<R>;
  readonly alive: number;
  readonly available: number;
  readonly disposed: boolean;
}

// 'null' mode: acquire() returns T | null instead of throwing on overflow
interface NullPool<T> extends Omit<Pool<T>, 'acquire'> { acquire(): T | null; }

class PoolError extends Error { /* overflow / double-release / foreign object */ }
class PoolDisposedError extends Error { /* any call after dispose */ }

function createPool<T>(opts: PoolOptions<T> & { onOverflow: 'null' }): NullPool<T>;
function createPool<T>(opts: PoolOptions<T>): Pool<T>;
```

Full JSDoc lives in [`src/index.ts`](src/index.ts).

---

## Roadmap

| Version    | Adds                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **0.1.0**  | `createPool`, `acquire` / `release` / `drain` / `dispose`, double-release detection, error classes, ≥95% coverage, ≤700 B gzip (strict-TS overhead lands at ~557 B). |
| **0.3.0**  | `onOverflow` option (`'throw'` / `'null'` / `'grow'` / function handler); `borrow(fn, opts?)` helper with `AbortSignal` support; `STABILITY.md`; budget raised to 850 B. |
| **0.6+**   | TBD — driven by real integration feedback (e.g. polymorphic chunked pool, batch acquire, generation counters for stale checks). |

---

## License

[MIT](LICENSE).
