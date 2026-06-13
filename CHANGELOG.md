# Changelog

All notable changes to aipooljs are summarized here.

## [Unreleased]

## [0.5.8] - 2026-06-14

- Documentation-only slimming pass across README, stability notes, review backlog, and LLM context. Family version alignment at 0.5.8 — no runtime or API change. A stricter overflow-handler mode that prevents aliasing by default remains a documented follow-up.

## [0.5.6] - 2026-06-10

- Hardened docs around overflow, reset failure, borrow abort, and dispose behavior.
- Kept fixed-size pool API stable and regenerated generated LLM context.

## Older releases

- `0.5.5` through `0.5.1` focused on release hygiene, docs accuracy, and regression tests for reset/borrow/overflow paths.
- `0.4.0` declared the stable ai*js pool surface.
- `0.3.x` added overflow strategies and `borrow()`.
- `0.1.x` introduced `createPool`, `Pool`, `NullPool`, `PoolError`, and `PoolDisposedError`.
