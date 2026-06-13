# aipooljs

小型嚴格 object pool，適合高頻 acquire/release 路徑：sprites、bullets、particles、DOM nodes、worker slots。

> **狀態：0.5.8 - 穩定 1.0 軌道 API。** root entry 是公開 API。

## 安裝

```bash
pnpm add aipooljs
```

```ts
import { createPool } from "aipooljs";
```

## 快速開始

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

## 核心 API

- `createPool({ size, create, reset, onOverflow? })` 建立 fixed-size pool。
- `pool.acquire()` 取出 live slot，或依 `onOverflow` 處理。
- `pool.release(obj)` reset 並回收 live slot。
- `pool.drain()` 回收所有目前 live slots。
- `pool.borrow(fn, { signal }?)` acquire、執行 `fn`，並在 `finally` release。
- `pool.dispose()` 是可重複呼叫的永久 teardown。
- Read-only state：`available`、`alive`、`disposed`。
- Errors：`PoolError`、`PoolDisposedError`。

## Overflow Strategies

| Strategy | 行為 |
| --- | --- |
| `"throw"` | 預設；空池時丟 `PoolError`。 |
| `"null"` | `acquire()` 回傳 `null`；factory overload 會窄化 pool type。 |
| `"grow"` | 分配更多 objects 並倍增 capacity；可能造成同 frame GC spike。 |
| function | Escape hatch。handler 回傳 slot，並自行負責避免 aliasing/recursion。 |

## 注意事項

- Function overflow handler 可以回傳已 live 的 object，這會 alias 前一個持有者，後續 `release()` 可能丟錯。
- 若 `reset()` throw，slot 會先從 alive 移除但不會回到 available，因此該物件的容量永久縮小。
- `borrow()` 只有在 `fn` 回傳 native `Promise` 時才走 async branch。非 `instanceof Promise` 的 thenable 會被視為 sync：slot 會立即 release，thenable 原樣回傳。請優先回傳真正的 `Promise`。
- Abort `borrow()` 會釋放 slot，但不會停止內部工作。若 async borrow 期間 pool 被 dispose，結果會走 disposed path。
- 熱路徑的 `reset()` 不要 `delete` 欄位；請指派預設值以維持 hidden class。

## AI Context

- 短索引：[`llms.txt`](llms.txt)
- 完整生成內容：[`llms-full.txt`](llms-full.txt)
- 穩定度契約：[`STABILITY.md`](STABILITY.md)
- 目前 review backlog：[`REVIEW.md`](REVIEW.md)
- 版本紀錄：[`CHANGELOG.md`](CHANGELOG.md)

## License

MIT
