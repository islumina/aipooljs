# Contributing to aipooljs

Keep the pool predictable, allocation-aware, and explicit about sharp edges.

## Local workflow

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm verify:docs
pnpm build:llms
pnpm verify:llms
pnpm check:size
```

Run `pnpm lint` before PRs. If docs change, regenerate `llms-full.txt`.

## Rules

- Preserve double-release and foreign-object detection.
- Validate arguments before any side effect and throw `PoolError` through `bad()`, so every message keeps the `aipooljs: ` prefix.
- Add tests for overflow, reset throw, borrow abort, async borrow, and dispose paths.
- Do not hide allocation behavior behind friendly defaults.
- Keep examples hot-path friendly: reset fields, do not delete them.

## License

MIT
