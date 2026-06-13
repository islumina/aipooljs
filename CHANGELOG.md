# Changelog

All notable changes to aipooljs are summarized here.

## [Unreleased]

- Documentation-only slimming pass across README, stability notes, review backlog, and LLM context.
- Known follow-up: consider whether a stricter overflow handler mode should prevent aliasing by default.

## [0.5.6] - 2026-06-10

- Hardened docs around overflow, reset failure, borrow abort, and dispose behavior.
- Kept fixed-size pool API stable and regenerated generated LLM context.

## Older releases

- `0.5.5` through `0.5.1` focused on release hygiene, docs accuracy, and regression tests for reset/borrow/overflow paths.
- `0.4.0` declared the stable ai*js pool surface.
- `0.3.x` added overflow strategies and `borrow()`.
- `0.1.x` introduced `createPool`, `Pool`, `NullPool`, `PoolError`, and `PoolDisposedError`.
