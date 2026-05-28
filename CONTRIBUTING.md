# Contributing to aipooljs

Thanks for taking the time to look. aipooljs is a deliberately small library
(target ≤ 500 B gzip); contributions that keep the surface narrow are easier
to accept than ones that expand it.

## Quick start

```bash
pnpm install
pnpm test            # vitest
pnpm coverage        # vitest with v0.1.0 thresholds (95/90/100/100)
pnpm typecheck       # tsc --noEmit on strict mode
pnpm lint            # biome check
pnpm build           # tsup; dual ESM/CJS + .d.ts
pnpm verify:exports  # ensures package.json#exports matches dist/
pnpm verify:llms     # ensures llms-full.txt is in sync with README + CHANGELOG
pnpm check:size      # gzip per subpath against the size budget
```

The full pre-publish gate is `pnpm prepublishOnly`, which runs typecheck,
lint, coverage (with thresholds), build, exports verification, llms drift
check, and size budget check — in that order.

## What gets in easily

- Bug fixes with a failing test added first
- README / typing corrections
- Tests that lock down existing behaviour
- Performance work that keeps `acquire()` / `release()` at O(1) and zero
  allocation in steady state

## What needs discussion first

- Anything that changes the public surface (`createPool`, `Pool<T>`,
  `PoolOptions<T>`, error classes)
- Auto-grow / shrink semantics (explicit non-goal in 0.x)
- Async object construction (explicit non-goal in 0.x)
- Generation counters or stale-handle detection (0.3+ candidate)
- Anything that pushes the core gzip past 500 B

## Design principles

aipooljs follows the ai*js library-core priority order:

> Security > Correctness > Simplicity > YAGNI > Performance

Key invariants:

- `acquire()` / `release()` are O(1); no allocations in steady state.
- `reset(obj)` must clear by assignment, never `delete` (V8 hidden-class
  preservation is the whole point).
- Double-release throws; silent corruption of the available set is never an
  acceptable outcome.
- `dispose()` is idempotent.

## Commit & PR style

- Commit messages: imperative subject under 70 chars; body explains *why*.
- PRs: keep scope to one topic. Link the issue if any.
- Tests required for any behaviour change. Property-based tests welcome
  for invariants; example tests preferred for behaviour you want documented.

## Reporting issues

- Minimal reproduction welcome (paste the smallest `createPool` + acquire /
  release sequence that shows the bug).
- For security issues, please email the maintainer rather than filing
  publicly.

## License

By contributing, you agree your changes will be licensed under the MIT
license that covers this project.
