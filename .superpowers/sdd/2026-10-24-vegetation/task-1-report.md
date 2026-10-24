# Task 1 Report

## Summary

Created the TypeScript package scaffold and the pure core foundation for shared vegetation types, seeded randomness, 3D value noise, and sRGB/linear color conversion. The core modules do not import three.js.

The package uses `three`, `@types/three`, TypeScript 5, Vite, Vitest, and lil-gui as development dependencies. It declares three.js as a peer dependency, configures library mode with three externalized, and includes the test, typecheck, build, and demo scripts. `src/index.ts` is a small entry point that exports the Task 1 core API so the configured library build and package exports have a real source entry.

## Files changed

- `.gitignore`
- `package.json`, `package-lock.json`
- `tsconfig.json`, `tsconfig.build.json`, `vite.config.ts`
- `src/index.ts`
- `src/core/types.ts`, `src/core/random.ts`, `src/core/noise.ts`, `src/core/color.ts`
- `tests/core/random.test.ts`, `tests/core/noise.test.ts`, `tests/core/color.test.ts`, `tests/core/purity.test.ts`

## TDD evidence

### RED

Command: `npx vitest run tests/core`

Result: exit code 1. Three suites failed to resolve the not-yet-created `src/core/color`, `src/core/noise`, and `src/core/random` modules. The purity test also failed because the empty core directory contained zero TypeScript files.

Output summary: `Test Files 4 failed (4)`, `Tests 1 failed (1)`.

### GREEN

Command: `npx vitest run tests/core`

Result: exit code 0. `Test Files 4 passed (4)`, `Tests 15 passed (15)`.

### Typecheck and build

- `npx tsc --noEmit` — passed.
- `npm run build` — passed; Vite emitted `dist/index.js` and the declaration build completed.

The first typecheck attempt failed because the initial purity test used Node built-in type declarations that were not in the requested dependency list. Replaced that filesystem read with Vite's raw-source glob, then reran the typecheck successfully without adding another package.

## Self-review findings

- Reading the working diff showed that the initial `.gitignore` update had removed the pre-existing `.superpowers/` ignore rule. Restored it while adding the generated and dependency directories.
- Fixed a `let value` indentation mismatch in the mulberry32 implementation.
- Added the minimal `src/index.ts` entry, although Task 1's file list does not name it. The Vite library config and package exports both target `dist/index`, so the entry keeps the configured build coherent.

## Concerns

No outstanding functional concerns. `src/index.ts` is the only scope extension; it exports Task 1's core API and can be extended with the three.js layer in a later task.

## Review Fix Report (2026-10-24)

### What changed

Updated `hashFork` to avalanche the seed before combining it with the salt, then avalanche the combined value. Added a regression test proving that `createRandom( 1 ).fork( 2 )` and `createRandom( 2 ).fork( 1 )` produce different first values. Widened the core purity check to reject quoted `three` and `three/...` module specifiers, covering side-effect and dynamic imports as well as `from` imports.

### Files changed

- `src/core/random.ts`
- `tests/core/random.test.ts`
- `tests/core/purity.test.ts`
- `.superpowers/sdd/2026-10-24-vegetation/task-1-report.md`

### TDD evidence

#### RED

Command: `npx vitest run tests/core/random.test.ts tests/core/purity.test.ts`

Result: exit code 1. The new swapped seed/salt regression failed because both values were `0.5320210254285485`; the purity suite passed.

Output summary: `Test Files 1 failed | 1 passed (2)`, `Tests 1 failed | 9 passed (10)`.

#### GREEN

Command: `npx vitest run tests/core/random.test.ts tests/core/purity.test.ts`

Result: exit code 0. `Test Files 2 passed (2)`, `Tests 10 passed (10)`.

Full suite command: `npm test`

Result: exit code 0. `Test Files 4 passed (4)`, `Tests 16 passed (16)`.

### Self-review findings

Read the diff for the four files listed above. It contains the seed-first mixing change, the requested fork regression, the widened module-specifier expression, and this appended report.

### Concerns

None.
