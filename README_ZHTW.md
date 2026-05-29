# aipooljs

[![npm version](https://img.shields.io/npm/v/aipooljs.svg)](https://www.npmjs.com/package/aipooljs)
[![CI](https://github.com/yshengliao/aipooljs/actions/workflows/ci.yml/badge.svg)](https://github.com/yshengliao/aipooljs/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-brightgreen.svg)](LICENSE)
[![AI Generated](https://img.shields.io/badge/AI_Generated-Claude_Code_Opus_4.7_Max-blueviolet.svg)](https://www.anthropic.com/claude-code)
[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md)

> 一個小而嚴格的物件池，給高頻 `acquire()` / `release()` 場景使用 ── PixiJS Sprite pool、子彈池、粒子池、DOM node 回收器、Worker job slot。預設 fixed-size、溢位即拋、可偵測重複 release。

隸屬 [ai\*js micro-runtime 生態系](https://github.com/yshengliao) ─ 另見 [aifsmjs](https://github.com/yshengliao/aifsmjs)（FSM）、[aiecsjs](https://github.com/yshengliao/aiecsjs)（ECS）、[aibridgejs](https://github.com/yshengliao/aibridgejs)（cross-context RPC）、[aieventjs](https://github.com/yshengliao/aieventjs)（event emitter）、[aiquadtreejs](https://github.com/yshengliao/aiquadtreejs)（空間分割）、[aiaudiojs](https://github.com/yshengliao/aiaudiojs)（Web Audio 薄殼）。

> **狀態：0.3.0 published。** API surface 穩定；完整實作已上線。

---

## 為什麼有 aipooljs

網頁遊戲與反應式 UI 都有同一個熱路徑問題：每秒被建立又銷毀的同形物件 ── 子彈發射又回收、粒子噴出又消失、列表 row 掛上又卸載、Worker job 排入又消化。把這種 churn 丟給 V8 GC，會在 major GC 走整個 heap 時看到 frame-time spike。物件池用「固定 buffer + 常數時間 slot 重用」取代 churn，正是熱路徑需要的解。

`aipooljs` 是把這四件事做對的最小 pool API：

- **常數時間 `acquire` / `release`** ── 內部用 stack（JS array 的 `push` / `pop`）；兩個動作都是 O(1)。`Array.shift()` 是 O(n)，是手刻 pool 最常出包的點。
- **V8 友善的 reset 語意** ── `reset(obj)` 必須用「賦值」清欄位，**不能 `delete`**。`delete` 會降級 hidden class、把 steady-state loop 變 megamorphic；這條規則寫進 JSDoc，AI 代理人與人類讀到的是同一條。
- **重複 release 偵測** ── 對同一物件 release 兩次會悄悄把 available set 弄壞，是 pool 領域的招牌 bug。`aipooljs` 用 `Set` 追蹤 alive set，第二次 release 拋 `PoolError`。
- **Fixed size、溢位即拋** ── auto-grow 讓 worst case 不可預期（一次大配置可能在同一個你想保護的 frame 內 stutter）。溢位即拋的好處是逼你修上游速率，而不是修 pool。

明確**不做**的：不做連線池、不做 thread pool、不做泛用資源管理器。契約就是「固定 buffer + O(1) check-out/check-in 的 plain object」── 故意收窄到 gzip 落在 600 B 上下、認知負擔 < 五分鐘。

> `aipooljs` 是 v0.3 cycle 四個新加入兄弟套件之一 ── 另外三個是 [aiquadtreejs](https://github.com/yshengliao/aiquadtreejs)（空間 broadphase）、`aieventjs`（typed event；**自寫不 fork mitt**）、`aiaudiojs`（Web Audio 薄殼，底層用 Howler.js 作 `peerDependency`）。

---

## Quick Start

```bash
pnpm add aipooljs
```

```typescript
import { createPool } from "aipooljs";

// 1. 預先配置固定 buffer。
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

// 2. 在熱路徑 acquire。
function fireBullet(x: number, y: number) {
  const s = sprites.acquire();   // O(1)、零配置
  s.visible = true;
  s.x = x;
  s.y = y;
  stage.addChild(s);
  return s;
}

// 3. Entity 死亡時釋放回 pool。
function reclaim(s: PIXI.Sprite) {
  s.parent?.removeChild(s);
  sprites.release(s);            // O(1)、reset() 先跑
}
```

契約刻意收窄。沒有 async constructor、沒有 priority；auto-grow 是 opt-in（`onOverflow: 'grow'`）而非預設 ── 其餘真正有需要時，留給 user-land 寫。

---

## 能做 / 不做

| 會做（v1）                                                  | 不會做                                                |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| 固定大小預配置；可選 auto-grow（`onOverflow: 'grow'`）       | 預設溢位即拋（`PoolError`）；可透過 `onOverflow` opt-in auto-grow |
| O(1) `acquire()` / `release()`；`drain()` 為 O(alive)      | Async object construction                             |
| Reset hook（V8 友善：賦值、絕不 `delete`）                  | 靜默重複 release（任何模式下都拋）                    |
| `alive` / `available` / `disposed` 唯讀 counter            | 連線池 / Thread pool / DB pool                        |
| `dispose()` 冪等；dispose 後呼叫拋錯                       | Weak reference（pool 本來就要強引用）                 |
| 對非自家物件 release 會偵測                                | 物件層級 metadata / generation counter                |

---

## API 草稿

```typescript
type OverflowHandler<T> = 'throw' | 'null' | 'grow' | ((pool: Pool<T>) => T);

interface PoolOptions<T> {
  create: () => T;
  reset: (obj: T) => void;
  size: number;
  onOverflow?: OverflowHandler<T>; // 預設：'throw'
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

// 'null' 模式：溢位時 acquire() 回 T | null，不拋錯
interface NullPool<T> extends Omit<Pool<T>, 'acquire'> { acquire(): T | null; }

class PoolError extends Error { /* 溢位 / 重複 release / 非自家物件 */ }
class PoolDisposedError extends Error { /* dispose 後任何呼叫 */ }

function createPool<T>(opts: PoolOptions<T> & { onOverflow: 'null' }): NullPool<T>;
function createPool<T>(opts: PoolOptions<T>): Pool<T>;
```

完整 JSDoc 在 [`src/index.ts`](src/index.ts)。

---

## Roadmap

| 版本       | 加入內容                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **0.1.0**  | `createPool`、`acquire` / `release` / `drain` / `dispose`、重複 release 偵測、error classes、≥95% coverage、≤700 B gzip（strict-TS 額外負擔實測落在 ~557 B）。 |
| **0.3.0**  | `onOverflow` 選項（`'throw'` / `'null'` / `'grow'` / function handler）；`borrow(fn, opts?)` helper（含 `AbortSignal` 支援）；`STABILITY.md`；size budget 提升至 850 B。 |
| **0.6+**   | TBD ── 由真實整合回饋驅動（polymorphic chunked pool、batch acquire、generation counter 等）。                                            |

---

## License

[MIT](LICENSE)。
