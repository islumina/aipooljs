# aipooljs

Tiny strict object pool for hot acquire/release paths: sprites, bullets, particles, DOM nodes, and worker slots.

> **Status: 0.5.8 - stable 1.0-track surface.** The root entry is the public API.

## Install

```bash
pnpm add aipooljs
```

```ts
import { createPool } from "aipooljs";
```

## Quick Start

```ts
const bullets = createPool({
  size: 256,
  create: () => ({ x: 0, y: 0, active: false }),
  reset: (b) => {
    b.x = 0;
    b.y = 0;
    b.active = false;
  },
});

const bullet = bullets.acquire();
bullet.active = true;
bullets.release(bullet);

await bullets.borrow(async (slot) => {
  slot.active = true;
});

bullets.dispose();
```

## Core API

- `createPool({ size, create, reset, onOverflow? })` builds a fixed-size pool.
- `pool.acquire()` returns a live slot or follows `onOverflow`.
- `pool.release(obj)` resets and returns a live slot.
- `pool.drain()` releases all currently live slots.
- `pool.borrow(fn, { signal }?)` acquires, runs `fn`, and releases in `finally`.
- `pool.dispose()` is idempotent permanent teardown.
- Read-only state: `available`, `alive`, `disposed`.
- Errors: `PoolError`, `PoolDisposedError`.

## Overflow Strategies

| Strategy | Behavior |
| --- | --- |
| `"throw"` | Default; throws `PoolError` when empty. |
| `"null"` | `acquire()` returns `null`; factory overload narrows the pool type. |
| `"grow"` | Allocates more objects and doubles capacity; can cause same-frame GC spikes. |
| function | Escape hatch. The handler returns a slot and is responsible for avoiding aliasing/recursion. |

## Sharp Edges

- Function overflow handlers can return an already-live object. That aliases the previous holder and can make later `release()` calls throw.
- If `reset()` throws, the slot is removed from alive before it returns to available, so capacity shrinks permanently for that object.
- `borrow()` only takes the async branch when `fn` returns a native `Promise`. Non-`instanceof Promise` thenables are treated as sync: the slot is released immediately and the thenable is returned as-is. Prefer real `Promise`s.
- Aborting `borrow()` releases the slot but does not stop inner work. If the pool is disposed during async borrow, the result is reported through the disposed path.
- Do not `delete` fields in `reset()` on hot objects; assign default values to preserve hidden classes.

## AI Context

- Short index: [`llms.txt`](llms.txt)
- Full generated context: [`llms-full.txt`](llms-full.txt)
- Stability contract: [`STABILITY.md`](STABILITY.md)
- Current review backlog: [`REVIEW.md`](REVIEW.md)
- Release history: [`CHANGELOG.md`](CHANGELOG.md)

## License

MIT
