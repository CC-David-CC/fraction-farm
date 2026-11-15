# Fraction Farm — core rules

Audience: grades 4–5. Learning target: fraction meaning, equivalence,
comparison, and simple addition with visual models.

## Canonical state

```
session = {
  version, seed, rngState, phase: "task" | "explain" | "done",
  plots: {id, kind, solved, stars}, plotIndex,
  task: fractionTask, attempts
}
fractionTask =
  | {kind: "shade",   denominator, target, chosen}
  | {kind: "equal",   fraction, choices: fraction[]}
  | {kind: "compare", left, right, choices: ["<", "=", ">"]}
  | {kind: "order",   choices: fraction[][]}
  | {kind: "add",     left, right, choices: fraction[]}
```

Fractions are canonical `{numerator, denominator}` with denominator 2–12 and
`0 <= numerator <= denominator` for shading. Improper values are allowed only
where a task explicitly calls for them.

## Operations

- `shade(parts)` commits a whole-number count of shaded parts.
- `choose(index)` answers equal, compare, order, and add tasks.
- `explain()` moves to the visual model for one attempt, then returns.
- `nextPlot()` is legal only after `solved`.

## Rules and invariants

- Equivalence uses fully reduced canonical fractions; a choice that merely
  looks similar is not correct.
- Comparison uses common denominators; results never depend on floating point.
- Addition uses same-denominator pairs with sums `<= 1` in grade 4 and mixed
  results up to 2 in grade 5.
- Every generated task has exactly one canonical correct answer.
- Wrong answers preserve progress and show the same task with a worked model;
  no plot is ever lost.

## Win and loss

All 12 plots solved ends the session with stars by first-try success. There is
no dead-end; explain always offers a path forward.

## Seeded behavior

One RNG stream chooses plot kinds, denominators, numerators, and distractor
order. Deterministic given seed and action history.

## Snapshot

Store version, seed, RNG state, plot progress, current task, attempts, stars,
and phase. Validation rejects denominators outside 2–12, non-integer shading,
unreduced duplicates among choices, and comparison choices not in the fixed
set.

## Pure tests before a view

- Generator produces legal denominators and exactly one correct choice.
- Reduction and equivalence, including the same fraction written differently.
- Compare/order agree with a whole-number cross-product check.
- Same-denominator addition never uses float arithmetic.
- Wrong answers preserve the task and transition to the worked model.
- Snapshot round-trip and rejection of malformed tasks.
