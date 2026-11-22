import {connectGameFiles} from '@webos/learning-game-core/workspace';
import {FractionFarmSession} from './model.mjs';
import {computeLayout} from './layout.mjs';

function formatFraction(f) {
  if (!f) return '';
  if (typeof f === 'string') return f;
  if (Array.isArray(f)) return f.map(formatFraction).join(', ');
  if (f.whole) return `${f.whole} ${f.numerator}/${f.denominator}`;
  return `${f.numerator}/${f.denominator}`;
}

function createElement(host, tag, className, text) {
  if (host?.ui?.make) {
    return host.ui.make(tag, className, text);
  }
  if (typeof document !== 'undefined') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }
  return {
    tagName: tag.toUpperCase(),
    className: className || '',
    dataset: {},
    children: [],
    style: {},
    append(...kids) { this.children.push(...kids); },
    replaceChildren(...kids) { this.children = kids ? [...kids] : []; },
    setAttribute() {},
    removeAttribute() {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
    removeEventListener() {}
  };
}

export function mount(host, options = {}) {
  const root = createElement(host, 'div', 'window-content fraction-farm-app');

  let grade = options.grade || 4;
  let session = new FractionFarmSession(`farm-${Date.now()}`, grade);
  let shadedCount = 0;
  let disposed = false;
  let resizeObserver = null;

  // Header Bar
  const header = createElement(host, 'header', 'farm-header');

  const titleGroup = createElement(host, 'div', 'farm-title-group');
  const title = createElement(host, 'h1', 'farm-title', '🥕 Fraction Farm');
  titleGroup.append(title);

  const stats = createElement(host, 'div', 'farm-stats');

  const gradeSelect = createElement(host, 'select', 'farm-grade-select');
  gradeSelect.setAttribute?.('aria-label', 'Grade Level');
  if (typeof document !== 'undefined' && gradeSelect instanceof HTMLElement) {
    gradeSelect.innerHTML = '<option value="4">Grade 4</option><option value="5">Grade 5</option>';
    gradeSelect.value = String(grade);
    gradeSelect.onchange = () => {
      grade = Number(gradeSelect.value);
      session = new FractionFarmSession(`farm-${Date.now()}`, grade);
      shadedCount = 0;
      render();
    };
  }

  const progressBadge = createElement(host, 'span', 'farm-badge farm-progress');
  const starsBadge = createElement(host, 'span', 'farm-badge farm-stars');

  stats.append(gradeSelect, progressBadge, starsBadge);
  header.append(titleGroup, stats);

  // Main Container: Farm & Task Workbench
  const main = createElement(host, 'main', 'farm-main');

  // Left: 12-Plot Farm Overview
  const farmView = createElement(host, 'section', 'farm-plots-section');
  farmView.setAttribute?.('aria-label', 'Farm Plots');

  const plotGrid = createElement(host, 'div', 'farm-plot-grid');
  farmView.append(plotGrid);

  // Right: Interactive Task Workbench
  const workbench = createElement(host, 'section', 'farm-workbench');
  workbench.setAttribute?.('aria-label', 'Task Workbench');

  // Controls footer
  const controls = createElement(host, 'footer', 'farm-controls');

  const hintBtn = createElement(host, 'button', 'farm-btn farm-btn-secondary', '💡 Hint');
  hintBtn.onclick = () => {
    if (session.phase === 'task') {
      const removed = session.hint();
      if (removed) render();
    }
  };

  const newGameBtn = createElement(host, 'button', 'farm-btn farm-btn-outline', '🔄 New Field');
  newGameBtn.onclick = () => {
    session = new FractionFarmSession(`farm-${Date.now()}`, grade);
    shadedCount = 0;
    render();
  };

  controls.append(hintBtn, newGameBtn);

  main.append(farmView, workbench);
  root.append(header, main, controls);

  function renderPlots() {
    plotGrid.replaceChildren();
    const state = session.state;
    state.plots.forEach((p, idx) => {
      const plot = createElement(host, 'div', 'farm-plot');
      if (idx === session.index) plot.classList?.add('active');
      if (p.solved) plot.classList?.add('solved');

      const plotNum = createElement(host, 'div', 'plot-num', String(idx + 1));
      const plotKind = createElement(host, 'div', 'plot-kind', p.kind);
      const plotStatus = createElement(host, 'div', 'plot-status', p.solved ? '🌱 Harvested' : idx === session.index ? '🚜 Active' : '🌾 Ready');

      plot.append(plotNum, plotKind, plotStatus);
      plotGrid.append(plot);
    });
  }

  function renderWorkbench() {
    workbench.replaceChildren();
    progressBadge.textContent = `Plot ${Math.min(session.index + 1, 12)} / 12`;
    starsBadge.textContent = `⭐ ${session.stars} stars`;

    if (session.phase === 'done') {
      const doneBox = createElement(host, 'div', 'farm-card farm-done');
      const heading = createElement(host, 'h2', '', '🎉 All 12 Plots Harvested!');
      const summary = createElement(host, 'p', '', `Terrific work! You earned ${session.stars} stars. Hints used: ${session.hintsUsed}.`);

      const restartBtn = createElement(host, 'button', 'farm-btn farm-btn-primary', 'Plant Another Season');
      restartBtn.onclick = () => {
        session = new FractionFarmSession(`farm-${Date.now()}`, grade);
        shadedCount = 0;
        render();
      };

      doneBox.append(heading, summary, restartBtn);
      workbench.append(doneBox);
      return;
    }

    if (session.phase === 'explain') {
      const explainCard = createElement(host, 'div', 'farm-card farm-explain');
      const heading = createElement(host, 'h2', '', '🌱 Learning Model');
      const prompt = createElement(host, 'p', '', 'Let us examine this step together to cultivate the solution:');

      const continueBtn = createElement(host, 'button', 'farm-btn farm-btn-primary', 'Continue Farming ▶');
      continueBtn.onclick = () => {
        session.continueAfterMiss();
        shadedCount = 0;
        render();
      };

      explainCard.append(heading, prompt, continueBtn);
      workbench.append(explainCard);
      return;
    }

    const task = session.current;
    if (!task) return;

    const taskCard = createElement(host, 'div', 'farm-card farm-task-card');
    const taskKindTitle = createElement(host, 'h3', 'task-title', `Task: ${task.kind.toUpperCase()}`);
    const promptText = createElement(host, 'p', 'task-prompt');

    taskCard.append(taskKindTitle, promptText);

    if (task.kind === 'shade') {
      promptText.textContent = `Divide and shade the field to show ${task.target}/${task.denominator}:`;

      const visualField = createElement(host, 'div', 'farm-fraction-bar');
      visualField.setAttribute?.('role', 'group');
      visualField.setAttribute?.('aria-label', `Fraction bar of ${task.denominator} parts`);

      for (let i = 0; i < task.denominator; i++) {
        const seg = createElement(host, 'button', 'fraction-segment');
        seg.setAttribute?.('aria-label', `Part ${i + 1}`);
        if (i < shadedCount) seg.classList?.add('shaded');
        seg.onclick = () => {
          shadedCount = (i + 1 === shadedCount) ? i : i + 1;
          renderWorkbench();
        };
        visualField.append(seg);
      }

      const countDisplay = createElement(host, 'div', 'shade-counter', `Currently shaded: ${shadedCount} / ${task.denominator}`);

      const confirmBtn = createElement(host, 'button', 'farm-btn farm-btn-primary farm-submit-btn', 'Harvest Plot (Confirm)');
      confirmBtn.onclick = () => {
        session.answer(shadedCount);
        shadedCount = 0;
        render();
      };

      taskCard.append(visualField, countDisplay, confirmBtn);
    } else if (task.kind === 'compare') {
      promptText.textContent = `Compare the two fraction harvests: ${formatFraction(task.left)}  ___  ${formatFraction(task.right)}`;

      const choiceGroup = createElement(host, 'div', 'farm-choices-group');

      ['<', '=', '>'].forEach(op => {
        const btn = createElement(host, 'button', 'farm-choice-btn', op);
        btn.onclick = () => {
          session.answer(op);
          render();
        };
        choiceGroup.append(btn);
      });

      taskCard.append(choiceGroup);
    } else {
      if (task.kind === 'equal') {
        promptText.textContent = `Find the equivalent fraction harvest for ${formatFraction(task.fraction)}:`;
      } else if (task.kind === 'add') {
        promptText.textContent = `Combine crop plots: ${formatFraction(task.left)} + ${formatFraction(task.right)} = ?`;
      } else if (task.kind === 'order') {
        promptText.textContent = 'Choose the correctly ordered fraction yield:';
      }

      const choiceGroup = createElement(host, 'div', 'farm-choices-group');

      task.choices.forEach((choice, idx) => {
        const btn = createElement(host, 'button', 'farm-choice-btn', formatFraction(choice));
        btn.onclick = () => {
          session.answer(idx);
          render();
        };
        choiceGroup.append(btn);
      });

      taskCard.append(choiceGroup);
    }

    workbench.append(taskCard);
  }

  function render() {
    if (disposed) return;
    renderPlots();
    renderWorkbench();
  }

  const files = connectGameFiles(host, {
    header,
    id: 'fraction-farm',
    title: 'Fraction Farm',
    serialize: () => session.encodeSave(),
    restore(snapshot) {
      session = FractionFarmSession.fromSave(snapshot);
      grade = session.state.grade;
      gradeSelect.value = String(grade);
      shadedCount = 0;
      render();
    },
  });

  render();

  if (typeof ResizeObserver !== 'undefined' && root.getBoundingClientRect) {
    resizeObserver = new ResizeObserver(([entry]) => {
      const {width, height} = entry.contentRect;
      const layout = computeLayout(width, height);
      if (root.dataset) root.dataset.tier = layout.tier;
    });
    resizeObserver.observe(root);
  }

  return {
    element: root,
    get session() { return session; },
    ready: files.ready,
    requestClose: files.requestClose,
    dispose() {
      files.dispose?.();
      disposed = true;
      resizeObserver?.disconnect();
      resizeObserver = null;
      root.replaceChildren?.();
    }
  };
}
