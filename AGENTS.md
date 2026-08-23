# AGENTS.md — conventions for agents working in this repo

Read BUILD-SPEC.md for the authoritative product/build spec. Follow it.

## Commands

- `pnpm install` at root first.
- `pnpm -r build` — typechecks + builds every package.
- `pnpm -r test` — vitest everywhere.
- `pnpm lint` / `pnpm format:check` — must pass before any commit.
- `pnpm dev` — Next dev server (apps/web).
- `pnpm sim -- --games N` — headless Blitz bot simulations (packages/game-blitz).

## Hard architecture rules (spec §4)

1. **`packages/engine` is pure.** No React, no DOM APIs, no network imports, no `Date.now`, no `new Date()`, no `Math.random`. Randomness ONLY via the seeded `Rng`. ESLint enforces this — do not disable those rules.
2. **Moves are pure reducers.** `validate` then `apply`; `apply` MUST emit fx hints through the passed `FxEmitter`.
3. **State = replay(seed, eventLog).** Never mutate outside the reducer path.
4. **UI animates only from fx events**, never by diffing state.
5. **Engine state lives in the engine**, not React. zustand holds UI/session state only.
6. Motion targets: ≤250 ms interaction feedback; card flights ~200 ms; overshoot easing ~1.1×; staggered cascades 60–100 ms. See spec §7 and research/UNO-VISUAL-ANALYSIS.md.

## Style

- TypeScript strict everywhere; `type-check` script per package.
- ESLint/prettier style mirrors voidstrike (see eslint.config.mjs, .prettierrc.json).
- Tests colocated as `*.test.ts` next to sources; vitest per package.
- No secrets in the repo. No comments explaining obvious code.

## Git discipline

- Do NOT commit from worker slices unless your brief explicitly says so — the orchestrator integrates and commits per wave to avoid index contention.
- Conventional-commit-ish messages: `feat(engine): ...`, `fix(blitz): ...`, `chore(web): ...`
