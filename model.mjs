import {
  SeededRng,
  clone,
  decodeSave,
  encodeSave,
  exactKeys,
  integer,
  oneOf,
  plainObject,
} from "@webos/learning-game-core/core";
import {makeLearningReport} from "@webos/learning-game-core/experience";

export const FRACTION_FARM_APP_ID = "fraction-farm";
export const FRACTION_FARM_CONTENT_VERSION = "fraction-farm-core-2";
const PLOT_KINDS = ["shade", "equal", "compare", "add", "shade", "equal", "compare", "add", "order", "shade", "equal", "add"];
const TASK_KINDS = ["shade", "equal", "compare", "order", "add"];

export class FractionFarmSession {
  #state;
  #rng;

  constructor(seed, grade = 4) {
    if (plainObject(seed) && Array.isArray(seed.plots)) {
      validatePayload(seed);
      this.#state = clone(seed);
      this.#rng = SeededRng.fromState(seed.rngState);
      return;
    }
    if (!oneOf(grade, [4, 5])) throw Error("Grade must be 4 or 5.");
    const rng = new SeededRng(seed);
    const state = {
      version: FRACTION_FARM_CONTENT_VERSION,
      seed: String(seed),
      rngState: 0,
      grade,
      phase: "task",
      plots: PLOT_KINDS.map(kind => ({kind, solved: false, firstTry: false})),
      index: 0,
      current: null,
      related: null,
      attemptsForPlot: 0,
      attempts: 0,
      hintsUsed: 0,
      firstTry: 0,
      stars: 0,
    };
    state.current = makeTask(state.plots[0].kind, grade, rng);
    state.rngState = rng.state;
    this.#state = state;
    this.#rng = rng;
  }

  static fromSave(text) {
    return new FractionFarmSession(decodeSave(text, FRACTION_FARM_APP_ID, FRACTION_FARM_CONTENT_VERSION, validatePayload));
  }

  get phase() {
    return this.#state.phase;
  }

  get index() {
    return this.#state.index;
  }

  get current() {
    return clone(this.#state.current);
  }

  get related() {
    return clone(this.#state.related);
  }

  get stars() {
    return this.#state.stars;
  }

  get hintsUsed() {
    return this.#state.hintsUsed;
  }

  get state() {
    return clone(this.#state);
  }

  get report() {
    return makeLearningReport({
      appId: FRACTION_FARM_APP_ID,
      audience: this.#state.grade === 4 ? "grade-4" : "grade-4-5",
      phase: this.#state.phase,
      stars: this.#state.stars,
      score: this.#state.firstTry * 10 + (this.#state.phase === "done" ? this.#state.stars * 100 : 0),
      firstTry: this.#state.firstTry,
      attempts: this.#state.attempts,
      hintsUsed: this.#state.hintsUsed,
      remaining: this.#state.plots.length - this.#state.index,
      objectives: ["Shade, compare, order, and add visual fractions."],
      details: {plotsSolved: this.#state.plots.filter(plot => plot.solved).length},
    });
  }

  answer(value) {
    if (this.#state.phase !== "task") throw Error("No fraction task is ready.");
    const task = this.#state.current, firstAttempt = this.#state.attemptsForPlot === 0;
    this.#state.attemptsForPlot++;
    this.#state.attempts++;
    const correct = task.kind === "shade" ? value === task.target :
      task.kind === "compare" ? value === task.answer : value === task.answerIndex;
    if (!correct) {
      this.#state.phase = "explain";
      this.#state.related = makeDifferentTask(task, this.#state.grade, this.#rng);
      this.#state.rngState = this.#rng.state;
      return {correct: false, model: explainTask(task), next: "continue"};
    }
    this.#state.plots[this.#state.index] = {
      ...this.#state.plots[this.#state.index],
      solved: true,
      firstTry: firstAttempt,
    };
    if (firstAttempt) this.#state.firstTry++;
    this.#state.index++;
    this.#state.attemptsForPlot = 0;
    this.#state.current = null;
    this.#state.related = null;
    if (this.#state.index === this.#state.plots.length) {
      this.#state.phase = "done";
      this.#state.stars = starCount(this.#state.firstTry);
    } else {
      this.#state.current = makeTask(this.#state.plots[this.#state.index].kind, this.#state.grade, this.#rng);
      this.#state.rngState = this.#rng.state;
    }
    return {correct: true, done: this.#state.phase === "done", stars: this.#state.stars};
  }

  hint() {
    const task = this.#state.current;
    if (this.#state.phase !== "task" || !Array.isArray(task.choices) || task.choices.length <= 2) return null;
    const answer = task.kind === "shade" ? task.target :
      task.kind === "compare" ? task.answer : task.choices[task.answerIndex];
    const wrong = task.choices.filter(value => JSON.stringify(value) !== JSON.stringify(answer));
    const removed = this.#rng.pick(wrong);
    task.choices = task.choices.filter(value => JSON.stringify(value) !== JSON.stringify(removed));
    if (task.kind !== "compare" && task.kind !== "shade") {
      task.answerIndex = task.choices.findIndex(value => JSON.stringify(value) === JSON.stringify(answer));
    }
    this.#state.hintsUsed++;
    this.#state.rngState = this.#rng.state;
    return removed;
  }

  continueAfterMiss() {
    if (this.#state.phase !== "explain" || !this.#state.related) throw Error("No fraction explanation is active.");
    this.#state.current = this.#state.related;
    this.#state.related = null;
    this.#state.phase = "task";
  }

  encodeSave() {
    this.#state.rngState = this.#rng.state;
    return encodeSave(FRACTION_FARM_APP_ID, clone(this.#state), FRACTION_FARM_CONTENT_VERSION);
  }
}

function fraction(numerator, denominator) {
  const divisor = gcd(Math.abs(numerator), denominator);
  return {numerator: numerator / divisor, denominator: denominator / divisor};
}

function gcd(left, right) {
  while (right) [left, right] = [right, left % right];
  return left || 1;
}

function fractionKey(value) {
  return `${value.numerator}/${value.denominator}`;
}

function compareFractions(left, right) {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return Math.sign(difference);
}

function makeTask(kind, grade, rng) {
  const maxDenominator = grade === 4 ? 8 : 12;
  if (kind === "shade") {
    const denominator = rng.int(2, maxDenominator);
    return {kind, denominator, target: rng.int(1, denominator - 1), answer: null, choices: [], answerIndex: null};
  }
  if (kind === "equal") {
    const denominator = rng.int(2, maxDenominator);
    const numerator = rng.int(1, denominator - 1);
    const source = fraction(numerator, denominator);
    const multiplier = rng.int(2, 3);
    const correct = fraction(source.numerator * multiplier, source.denominator * multiplier);
    const values = [correct];
    for (let attempts = 0; values.length < 3 && attempts < 200; attempts++) {
      const candidate = fraction(rng.int(1, maxDenominator - 1), rng.int(2, maxDenominator));
      if (!values.some(value => compareFractions(value, candidate) === 0) &&
          !values.some(value => fractionKey(value) === fractionKey(candidate))) values.push(candidate);
    }
    if (values.length !== 3) throw Error("Could not generate equivalent-fraction choices.");
    const choices = rng.shuffle(values);
    return {kind, fraction: source, choices, answerIndex: choices.findIndex(value => compareFractions(value, correct) === 0),
      answer: null, denominator: null, target: null};
  }
  if (kind === "compare") {
    const left = fraction(rng.int(1, maxDenominator), rng.int(2, maxDenominator));
    let right;
    for (let attempts = 0; attempts < 200; attempts++) {
      right = fraction(rng.int(1, maxDenominator), rng.int(2, maxDenominator));
      if (compareFractions(left, right) !== 0) break;
    }
    if (!right || compareFractions(left, right) === 0) throw Error("Could not generate a fraction comparison.");
    const comparison = compareFractions(left, right);
    return {kind, left, right, choices: ["<", "=", ">"], answer: comparison < 0 ? "<" : comparison > 0 ? ">" : "=",
      answerIndex: null, denominator: null, target: null, fraction: null};
  }
  if (kind === "order") {
    const values = [];
    for (let attempts = 0; values.length < 3 && attempts < 200; attempts++) {
      const candidate = fraction(rng.int(1, maxDenominator), rng.int(2, maxDenominator));
      if (!values.some(value => compareFractions(value, candidate) === 0)) values.push(candidate);
    }
    if (values.length !== 3) throw Error("Could not generate a fraction order.");
    const sorted = [...values].sort(compareFractions);
    const choices = [values];
    for (let attempts = 0; choices.length < 3 && attempts < 200; attempts++) {
      const candidate = rng.shuffle(values);
      if (!choices.some(order => order.every((value, index) => fractionKey(value) === fractionKey(candidate[index])))) choices.push(candidate);
    }
    if (choices.length !== 3) throw Error("Could not generate fraction order choices.");
    const shuffled = rng.shuffle(choices);
    return {kind, fractions: sorted, choices: shuffled, answerIndex: shuffled.findIndex(order =>
      order.every((value, index) => fractionKey(value) === fractionKey(sorted[index]))),
    answer: null, denominator: null, target: null, left: null, right: null};
  }
  const denominator = rng.int(2, maxDenominator);
  const leftNumerator = rng.int(1, denominator - 1);
  const rightNumerator = rng.int(1, grade === 4 ? denominator - leftNumerator : denominator - 1);
  const left = fraction(leftNumerator, denominator), right = fraction(rightNumerator, denominator);
  const correct = fraction(leftNumerator + rightNumerator, denominator);
  const values = [correct];
  for (let attempts = 0; values.length < 3 && attempts < 200; attempts++) {
    const candidate = fraction(rng.int(1, maxDenominator * 2), rng.int(2, maxDenominator));
    if (!values.some(value => compareFractions(value, candidate) === 0)) values.push(candidate);
  }
  if (values.length !== 3) throw Error("Could not generate addition choices.");
  const choices = rng.shuffle(values);
  return {kind, left, right, choices, answerIndex: choices.findIndex(value => compareFractions(value, correct) === 0),
    answer: null, denominator, target: null, fraction: null, fractions: null};
}

function makeDifferentTask(previous, grade, rng) {
  for (let count = 0; count < 30; count++) {
    const task = makeTask(previous.kind, grade, rng);
    if (JSON.stringify(task) !== JSON.stringify(previous)) return task;
  }
  throw Error("Could not generate a related fraction task.");
}

function explainTask(task) {
  if (task.kind === "shade") return `Shade ${task.target} of ${task.denominator} equal parts.`;
  if (task.kind === "equal") return `${fractionKey(task.fraction)} is equivalent to ${fractionKey(task.choices[task.answerIndex])}.`;
  if (task.kind === "compare") {
    const sign = task.answer;
    return `${fractionKey(task.left)} ${sign} ${fractionKey(task.right)} using a common denominator.`;
  }
  if (task.kind === "order") return `Smallest to largest: ${task.fractions.map(fractionKey).join(", ")}.`;
  return `${fractionKey(task.left)} + ${fractionKey(task.right)} = ${fractionKey(task.choices[task.answerIndex])}.`;
}

function starCount(firstTry) {
  if (firstTry >= 10) return 3;
  if (firstTry >= 7) return 2;
  return 1;
}

function validFraction(value, maxDenominator = 12) {
  return exactKeys(value, ["numerator", "denominator"]) && integer(value.numerator, 1, 24) &&
    integer(value.denominator, 2, maxDenominator) && gcd(value.numerator, value.denominator) === 1;
}

function scaledTo(value, denominator) {
  const product = value.numerator * denominator;
  return product % value.denominator === 0 ? product / value.denominator : null;
}

function validTask(task, grade) {
  if (!plainObject(task) || !oneOf(task.kind, TASK_KINDS)) return false;
  const maxDenominator = grade === 4 ? 8 : 12;
  if (task.kind === "shade") {
    return exactKeys(task, ["kind", "denominator", "target", "answer", "choices", "answerIndex"]) &&
      integer(task.denominator, 2, maxDenominator) && integer(task.target, 1, task.denominator - 1) &&
      task.answer === null && Array.isArray(task.choices) && task.choices.length === 0 && task.answerIndex === null;
  }
  if (task.kind === "equal") {
    return exactKeys(task, ["kind", "fraction", "choices", "answerIndex", "answer", "denominator", "target"]) &&
      validFraction(task.fraction, maxDenominator) && Array.isArray(task.choices) && task.choices.length >= 2 && task.choices.length <= 3 &&
      task.choices.every(value => validFraction(value, maxDenominator)) &&
      integer(task.answerIndex, 0, 2) && task.answer === null && task.denominator === null && task.target === null &&
      task.choices.filter(value => compareFractions(value, task.choices[task.answerIndex]) === 0).length === 1;
  }
  if (task.kind === "compare") {
    return exactKeys(task, ["kind", "left", "right", "choices", "answer", "answerIndex", "denominator", "target", "fraction"]) &&
      validFraction(task.left, maxDenominator) && validFraction(task.right, maxDenominator) &&
      Array.isArray(task.choices) && task.choices.length >= 2 && task.choices.length <= 3 &&
      task.choices.every(choice => ["<", "=", ">"].includes(choice)) &&
      new Set(task.choices).size === task.choices.length && task.choices.includes(task.answer) &&
      task.answer === (compareFractions(task.left, task.right) < 0 ? "<" : compareFractions(task.left, task.right) > 0 ? ">" : "=") &&
      task.answerIndex === null && task.denominator === null && task.target === null && task.fraction === null;
  }
  if (task.kind === "order") {
    return exactKeys(task, ["kind", "fractions", "choices", "answerIndex", "answer", "denominator", "target", "left", "right"]) &&
      Array.isArray(task.fractions) && task.fractions.length === 3 && task.fractions.every(value => validFraction(value, maxDenominator)) &&
      task.fractions.every((value, index) => index === 0 || compareFractions(task.fractions[index - 1], value) < 0) &&
      Array.isArray(task.choices) && task.choices.length >= 2 && task.choices.length <= 3 &&
      task.choices.every(order => Array.isArray(order) && order.length === 3 && order.every(value => validFraction(value, maxDenominator))) &&
      task.choices.every(order => order.every(value => task.fractions.some(correct => fractionKey(correct) === fractionKey(value)))) &&
      task.choices.filter(order => order.every((value, index) => fractionKey(value) === fractionKey(task.fractions[index]))).length === 1 &&
      integer(task.answerIndex, 0, 2) &&
      task.choices[task.answerIndex].every((value, index) => fractionKey(value) === fractionKey(task.fractions[index])) &&
      task.answer === null && task.denominator === null && task.target === null && task.left === null && task.right === null;
  }
  const leftScaled = scaledTo(task.left, task.denominator), rightScaled = scaledTo(task.right, task.denominator);
  const totalScaled = leftScaled === null || rightScaled === null ? null : leftScaled + rightScaled;
  return exactKeys(task, ["kind", "left", "right", "choices", "answerIndex", "answer", "denominator", "target", "fraction", "fractions"]) &&
    validFraction(task.left, maxDenominator) && validFraction(task.right, maxDenominator) &&
    integer(task.denominator, 2, maxDenominator) && Array.isArray(task.choices) && task.choices.length >= 2 && task.choices.length <= 3 &&
    task.choices.every(value => validFraction(value, maxDenominator)) && integer(task.answerIndex, 0, 2) &&
    totalScaled !== null &&
    task.choices.filter(value => value.numerator * task.denominator === totalScaled * value.denominator).length === 1 &&
    task.choices[task.answerIndex].numerator * task.denominator === totalScaled * task.choices[task.answerIndex].denominator &&
    task.answer === null && task.target === null && task.fraction === null && task.fractions === null &&
    (grade === 5 ? totalScaled <= task.denominator * 2 : totalScaled <= task.denominator);
}

function validatePayload(state) {
  if (!exactKeys(state, ["version", "seed", "rngState", "grade", "phase", "plots", "index", "current", "related",
    "attemptsForPlot", "attempts", "hintsUsed", "firstTry", "stars"]) || state.version !== FRACTION_FARM_CONTENT_VERSION ||
    typeof state.seed !== "string" || !integer(state.rngState, 0, 0xffffffff) || !oneOf(state.grade, [4, 5]) ||
    !oneOf(state.phase, ["task", "explain", "done"]) || !Array.isArray(state.plots) || state.plots.length !== 12 ||
    !integer(state.index, 0, 12) || !integer(state.attemptsForPlot, 0, 1000) || !integer(state.attempts, 0, 10000) ||
    !integer(state.hintsUsed, 0, 10000) ||
    !integer(state.firstTry, 0, 12) || !integer(state.stars, 0, 3)) throw Error("Invalid Fraction Farm snapshot.");
  state.plots.forEach((plot, index) => {
    if (!exactKeys(plot, ["kind", "solved", "firstTry"]) || plot.kind !== PLOT_KINDS[index] ||
        typeof plot.solved !== "boolean" || typeof plot.firstTry !== "boolean") throw Error("Invalid Fraction Farm plot.");
  });
  if (state.phase === "done") {
    if (state.index !== 12 || !state.plots.every(plot => plot.solved) || state.current !== null || state.related !== null) {
      throw Error("Invalid completed Fraction Farm state.");
    }
  } else if (state.phase === "task") {
    if (state.index >= 12 || !validTask(state.current, state.grade) || state.current.kind !== state.plots[state.index].kind ||
        state.related !== null) throw Error("Invalid active Fraction Farm task.");
  } else if (state.index >= 12 || !validTask(state.current, state.grade) || !validTask(state.related, state.grade) ||
      state.related.kind !== state.current.kind) throw Error("Invalid related Fraction Farm task.");
}
