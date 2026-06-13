# aipooljs Review

Current review state after the 2026-06-10 ai*js pass.

## Current Known Issues / Backlog

| Priority | Area | Status | Notes |
| --- | --- | --- | --- |
| P2 | Function overflow aliasing | Documented | Handler can return an already-live object. Consider a stricter opt-in mode if this becomes common misuse. |
| P3 | Reset throw shrinks pool | Documented | Intentional/test-locked behavior; callers should guard `reset()` if slot loss is unacceptable. |
| P3 | Thenable handling | Documented | `borrow()` only branches async for native `Promise`; non-`instanceof Promise` thenables are released synchronously and returned as-is. |
| P3 | Dispose during async borrow | Documented | Dispose can mask the callback result with `PoolDisposedError`. |

## Fixed Summary

- Overflow handling rejects already-available victims before returning them.
- Double-release and foreign-object detection are covered.
- Abort paths release slots rather than leaking them.

## Verification Baseline

- `pnpm typecheck`
- `pnpm test`
- `pnpm verify:docs`
- `pnpm verify:exports`
- `pnpm verify:llms`
- `pnpm check:size`
