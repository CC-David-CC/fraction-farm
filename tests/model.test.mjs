import assert from "node:assert/strict";
import test from "node:test";
import {FractionFarmSession} from "../model.mjs";

function correctAnswer(task) {
  if (task.kind === "shade") return task.target;
  if (task.kind === "compare") return task.answer;
  return task.answerIndex;
}

function solve(session) {
  while (session.phase !== "done") {
    if (session.phase === "explain") {
      session.continueAfterMiss();
      continue;
    }
    session.answer(correctAnswer(session.current));
  }
}

test("generator creates legal, uniquely answerable fraction tasks", () => {
  for (const grade of [4, 5]) {
    for (let seed = 0; seed < 40; seed++) {
      const session = new FractionFarmSession(`fraction-${grade}-${seed}`, grade);
      while (session.phase !== "done") {
        const task = session.current;
        assert.equal(["shade", "equal", "compare", "order", "add"].includes(task.kind), true);
        session.answer(correctAnswer(task));
      }
    }
  }
});

test("equivalent choices use exact canonical comparison", () => {
  const session = new FractionFarmSession("equivalence", 5);
  while (session.current.kind !== "equal") session.answer(correctAnswer(session.current));
  const task = session.current;
  const selected = task.choices[task.answerIndex];
  assert.equal(selected.numerator * task.fraction.denominator, selected.denominator * task.fraction.numerator);
});

test("hints remove one wrong choice and keep the correct choice index valid", () => {
  const session = new FractionFarmSession("hint", 5);
  while (session.current.kind !== "equal") session.answer(correctAnswer(session.current));
  const answer = session.current.choices[session.current.answerIndex];
  const removed = session.hint();
  assert.ok(removed);
  assert.notDeepEqual(removed, answer);
  assert.equal(session.current.choices.length, 2);
  assert.deepEqual(session.current.choices[session.current.answerIndex], answer);
  assert.equal(session.hint(), null);
});

test("grade-four addition never exceeds one whole", () => {
  for (let seed = 0; seed < 80; seed++) {
    const session = new FractionFarmSession(`sum-bound-${seed}`, 4);
    while (session.phase !== "done") {
      const task = session.current;
      if (task.kind === "add") {
        const left = task.left.numerator * task.denominator / task.left.denominator;
        const right = task.right.numerator * task.denominator / task.right.denominator;
        assert.ok(left + right <= task.denominator);
      }
      session.answer(correctAnswer(task));
    }
  }
});

test("grade-five addition stays within two wholes", () => {
  for (let seed = 0; seed < 80; seed++) {
    const session = new FractionFarmSession(`sum-cap-${seed}`, 5);
    while (session.phase !== "done") {
      const task = session.current;
      if (task.kind === "add") {
        const left = task.left.numerator * task.denominator / task.left.denominator;
        const right = task.right.numerator * task.denominator / task.right.denominator;
        assert.ok(left + right <= task.denominator * 2);
      }
      session.answer(correctAnswer(task));
    }
  }
});

test("wrong answers preserve the plot, explain, and re-ask the same kind", () => {
  const session = new FractionFarmSession("miss", 4);
  const index = session.index, kind = session.current.kind;
  session.answer(-1);
  assert.equal(session.index, index);
  assert.equal(session.phase, "explain");
  session.continueAfterMiss();
  assert.equal(session.current.kind, kind);
  assert.equal(session.phase, "task");
});

test("a complete farm ends once with stars", () => {
  const session = new FractionFarmSession("complete", 4);
  solve(session);
  assert.equal(session.phase, "done");
  assert.equal(session.index, 12);
  assert.equal(session.stars, 3);
  assert.throws(() => session.answer(0));
});

test("seed and snapshot restore the exact generated sequence", () => {
  const first = new FractionFarmSession("roundtrip", 5);
  const second = new FractionFarmSession("roundtrip", 5);
  first.answer(correctAnswer(first.current));
  second.answer(correctAnswer(second.current));
  const restored = FractionFarmSession.fromSave(second.encodeSave());
  assert.deepEqual(restored.state, second.state);
  restored.answer(correctAnswer(restored.current));
  second.answer(correctAnswer(second.current));
  assert.deepEqual(restored.state, second.state);
});

test("malformed fractions and tasks are rejected", () => {
  const session = new FractionFarmSession("invalid", 4);
  const valid = JSON.parse(session.encodeSave());
  for (const mutate of [
    value => { value.payload.grade = 3; },
    value => { value.payload.current.denominator = 1; },
    value => { value.payload.plots[0].kind = "equal"; },
    value => { value.payload.index = 12; },
    value => { value.payload.hintsUsed = -1; },
    value => { value.payload.current.choices = [value.payload.current.choices[value.payload.current.answerIndex]]; },
  ]) {
    const broken = structuredClone(valid);
    mutate(broken);
    assert.throws(() => FractionFarmSession.fromSave(JSON.stringify(broken)));
  }
});
