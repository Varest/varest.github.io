'use strict';

// Start once half the video is visible; leave native controls available.
document.querySelectorAll('video[data-scroll-play]').forEach((video) => {
  if (!('IntersectionObserver' in window)) return;
  let inView = false;
  function updatePlayback() {
    if (!inView || document.hidden) {
      video.pause();
    } else if (!video.ended) {
      // Autoplay restrictions or a quick scroll can reject this promise.
      video.play().catch(() => {});
    }
  }
  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting && entry.intersectionRatio >= 0.5;
    updatePlayback();
  }, { threshold: [0, 0.5] });
  observer.observe(video);
  document.addEventListener('visibilitychange', updatePlayback);
});

// Case explorer. Data comes from assets/cases/cases.js (tools/build_cases.py).
(() => {
  const data = window.VAREST_CASES;
  const root = document.querySelector('#cases');
  if (!data || !root) return;
  const $ = (selector) => root.querySelector(selector);
  const state = { group: 0, prompt: 0, budget: 0 };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // A row of toggle buttons; the selected one has aria-pressed="true".
  function toggles(container, labels, selected, onSelect) {
    container.replaceChildren(...labels.map((label, index) => {
      const button = el('button', '', label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(index === selected));
      button.addEventListener('click', () => { onSelect(index); render(); });
      return button;
    }));
  }

  function verdict(run) {
    const answer = run.iou == null ? run.answer : `IoU ${run.iou.toFixed(2)}`;
    return el('p', `answer ${run.ok ? 'is-ok' : 'is-bad'}`, `${run.ok ? '✓' : '✗'} ${answer}`);
  }

  function shot(src, caption, prompt, run, answer = true) {
    const figure = el('figure', 'shot');
    const frame = el('div', 'frame');
    const img = el('img');
    Object.assign(img, { src, alt: caption, decoding: 'async' });
    frame.append(img);
    // Grounding cases: draw the ground-truth (dashed) and predicted boxes.
    [[prompt?.gtBox, 'box-gt'], [run?.box, 'box-pred']].forEach(([box, className]) => {
      if (!box) return;
      const [x1, y1, x2, y2] = box.map((v) => Math.min(Math.max(v, 0), 1) * 100);
      const node = el('span', `box ${className}`);
      Object.assign(node.style, { left: `${x1}%`, top: `${y1}%`, width: `${x2 - x1}%`, height: `${y2 - y1}%` });
      frame.append(node);
    });
    figure.append(frame, el('figcaption', '', caption));
    if (run && answer) figure.append(verdict(run));
    return figure;
  }

  // Normalize stage labels to "<where in the model>: <tokens left>".
  function stageCaption(label, run) {
    const count = label.match(/(\d+)$/)?.[1] ?? label.match(/^(\d+) tokens/)?.[1] ?? run.k;
    const layer = label.match(/layer[- ](\d+)/i)?.[1];
    return layer ? `Layer ${layer}: ${count}` : `Before LLM: ${count}`;
  }

  // One block per method at the selected budget, each showing its pruning stages.
  function render() {
    const group = data.groups[state.group];
    const prompt = group.prompts[state.prompt];
    const budgets = data.budgets.map(String);
    const budget = budgets[state.budget];
    // Size columns for the longest method at any budget so images keep their size when switching.
    const stages = Math.max(...data.methods.flatMap((m) => budgets.map((b) => prompt.methods[m.key][b].panels.length)));
    root.style.setProperty('--aspect', group.aspect);
    root.style.setProperty('--stages', stages);
    [...$('#case-thumbs').children].forEach((button, index) => button.setAttribute('aria-pressed', String(index === state.group)));
    toggles($('#case-prompts'), group.prompts.map((p) => p.q), state.prompt, (index) => { state.prompt = index; });
    toggles($('#case-budget'), budgets.map((b) => `B = ${b}`), state.budget, (index) => { state.budget = index; });
    $('#case-input').replaceChildren(shot(group.input, group.title));
    $('#case-legend').hidden = !prompt.gtBox;

    const cells = data.methods.map(({ key, label }) => {
      const run = prompt.methods[key][budget];
      let panels = run.panels.map(([caption, src]) => [stageCaption(caption, run), src]);
      if (key === 'varest') {
        const [, tokens, kept, layer] = run.info.match(/K=(\d+).*K′=(\d+) after layer (\d+)/) || [];
        panels = [[`Before LLM: ${tokens}`, run.panels[0][1]], [`Layer ${layer}: ${kept}`, run.panels[1][1]]];
      }
      const block = el('div', `case-method${key === 'varest' ? ' is-ours' : ''}`);
      const head = el('div', 'case-method-head');
      head.append(el('strong', '', label), verdict(run));
      const row = el('div', 'case-stages');
      row.append(...panels.map(([caption, src]) => shot(src, caption, prompt, run, false)));
      block.append(head, row);
      return block;
    });
    $('#case-grid').replaceChildren(...cells);
  }

  $('#case-thumbs').replaceChildren(...data.groups.map((group, index) => {
    const button = el('button');
    button.type = 'button';
    const img = el('img');
    Object.assign(img, { src: group.input, alt: '', decoding: 'async' });
    button.append(img, el('span', '', group.title));
    button.addEventListener('click', () => { Object.assign(state, { group: index, prompt: 0 }); render(); });
    return button;
  }));
  root.hidden = false;
  render();
})();

const copyButton = document.querySelector('#copy-citation');
const copyStatus = document.querySelector('#copy-status');
copyButton.hidden = false;
copyButton.addEventListener('click', async () => {
  const citation = document.querySelector('#bibtex');
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(citation.textContent);
    copyStatus.textContent = 'Citation copied to clipboard.';
    copyButton.textContent = 'Copied ✓';
    window.setTimeout(() => { copyButton.textContent = 'Copy citation ⧉'; }, 2500);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(citation);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    copyStatus.textContent = 'Citation selected. Press Ctrl+C (Windows/Linux) or ⌘C (Mac) to copy.';
  }
});

