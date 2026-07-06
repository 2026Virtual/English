const DATA_ROOT = new URL("./reading-question-bank/", window.location.href);
const app = document.querySelector("#reading-app");

const state = {
  manifest: null,
  currentData: null,
  dataCache: new Map(),
  lastReaderRoute: null,
  route: { view: "selector" },
  initialized: false,
  loadingPromise: null,
};

window.readingApp = {
  show: initReadingApp,
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initIfReadingVisible);
} else {
  initIfReadingVisible();
}

function initIfReadingVisible() {
  if (document.querySelector("#reading-view:not([hidden])")) {
    initReadingApp();
  }
}

async function initReadingApp() {
  if (!app) return;
  if (state.initialized) {
    renderRoute();
    return;
  }
  if (state.loadingPromise) {
    await state.loadingPromise;
    return;
  }

  renderLoading();
  state.loadingPromise = loadReadingManifest();
  await state.loadingPromise;
}

async function loadReadingManifest() {
  try {
    const manifest = await fetchJson(new URL("manifest.json", DATA_ROOT));
    state.manifest = normalizeManifest(manifest);
    state.initialized = true;
    renderRoute();
  } catch (error) {
    renderError("题库加载失败", error);
  }
}

function renderLoading() {
  app.innerHTML = `
    <div class="reading-module">
      <main class="shell" aria-live="polite">
        <section class="loading-panel">
          <div class="mark" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <p>Loading reading tests...</p>
        </section>
      </main>
    </div>
  `;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function normalizeManifest(manifest) {
  const items = (manifest.items || [])
    .filter((item) => item.status === "ok" || item.status === "warning")
    .map((item) => {
      const [cam, test] = item.id.split("-").map(Number);
      return { ...item, cam, test };
    })
    .sort((a, b) => a.cam - b.cam || a.test - b.test);
  return { ...manifest, items };
}

function parseRoute() {
  return state.route;
}

function navigateReading(route) {
  state.route = route;
  renderRoute();
}

function emitReadingRouteChange(route = state.route) {
  window.dispatchEvent(
    new CustomEvent("reading-route-change", {
      detail: { view: route.view },
    }),
  );
}

async function renderRoute() {
  const route = parseRoute();
  emitReadingRouteChange(route);
  if (route.view === "test") {
    await renderTest(route.id, route.passage);
  } else if (route.view === "workspace") {
    await renderWorkspace();
  } else {
    state.currentData = null;
    renderSelector();
  }
}

function renderSelector() {
  const items = state.manifest.items;
  const cams = [...new Set(items.map((item) => item.cam))];

  app.innerHTML = `
    <div class="reading-module">
      <main class="shell">
        <header class="topbar">
          <div class="brand">
            <div class="mark" aria-hidden="true"><span></span><span></span><span></span></div>
            <div>
              <h1>IELTS Reading Practice</h1>
              <p>Cambridge ${cams[0]}-${cams[cams.length - 1]} · ${items.length} tests</p>
            </div>
          </div>
          <div class="toolbar">
            <select class="field" id="cam-filter" aria-label="选择 Cambridge 套题">
              <option value="all">全部套题</option>
              ${cams.map((cam) => `<option value="${cam}">Cam ${cam}</option>`).join("")}
            </select>
            <input class="field" id="test-search" type="search" placeholder="搜索 19-01" aria-label="搜索套题" />
          </div>
        </header>
        <section class="selector-panel" id="selector-list"></section>
      </main>
    </div>
  `;

  const camFilter = document.querySelector("#cam-filter");
  const search = document.querySelector("#test-search");
  const list = document.querySelector("#selector-list");

  const draw = () => {
    const selectedCam = camFilter.value;
    const keyword = search.value.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const camOk = selectedCam === "all" || String(item.cam) === selectedCam;
      const text = `${item.id} cam ${item.cam} test ${String(item.test).padStart(2, "0")}`;
      const searchOk = !keyword || text.includes(keyword);
      return camOk && searchOk;
    });
    list.innerHTML = renderTestGrid(filtered);
  };

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-reading-test]");
    if (!button) return;
    navigateReading({ view: "test", id: button.dataset.readingTest, passage: 1 });
  });

  camFilter.addEventListener("change", draw);
  search.addEventListener("input", draw);
  draw();
}

function renderTestGrid(items) {
  if (!items.length) {
    return `<div class="empty">没有匹配的套题</div>`;
  }

  const grouped = groupBy(items, (item) => item.cam);
  return [...grouped.entries()]
    .map(([cam, camItems]) => {
      const cards = camItems
        .map((item) => {
          const label = `Cam ${item.cam} · Test ${String(item.test).padStart(2, "0")}`;
          return `
            <button class="test-card" type="button" data-reading-test="${escapeAttr(item.id)}">
              <strong>${label}</strong>
              <span>${item.problem_groups || ""} question groups</span>
            </button>
          `;
        })
        .join("");

      return `
        <section class="cam-section">
          <div class="cam-head">
            <h2>Cambridge ${cam}</h2>
            <span>${camItems.length} tests</span>
          </div>
          <div class="test-grid">${cards}</div>
        </section>
      `;
    })
    .join("");
}

async function renderTest(id, passageNo) {
  try {
    renderReader(await loadTestData(id), passageNo);
  } catch (error) {
    renderError(`无法加载 ${id}`, error);
  }
}

async function loadTestData(id) {
  if (state.dataCache.has(id)) {
    const cached = state.dataCache.get(id);
    state.currentData = cached;
    return cached;
  }
  if (!state.currentData || state.currentData.id !== id) {
    const data = await fetchJson(new URL(`${id}.json`, DATA_ROOT));
    state.currentData = { ...data, id };
    state.dataCache.set(id, state.currentData);
  }
  return state.currentData;
}

function renderReader(data, passageNo) {
  const passage = data.passages.find((item) => item.passage_no === passageNo) || data.passages[0];
  const activePassageNo = passage.passage_no;
  const problems = data.problems.find((item) => item.passage_no === activePassageNo);
  const savedSplit = getSavedSplitRatio(data.id, activePassageNo);
  state.lastReaderRoute = { view: "test", id: data.id, passage: activePassageNo };

  app.innerHTML = `
    <div class="reading-module">
      <main class="shell reader-shell">
        <header class="reader-controls">
          <div class="reader-controls-left">
            <select class="field test-picker-compact" id="test-picker" aria-label="切换套题">
              ${state.manifest.items
                .map((item) => {
                  const selected = item.id === data.id ? "selected" : "";
                  return `<option value="${item.id}" ${selected}>${item.id}</option>`;
                })
                .join("")}
            </select>
          </div>
          <nav class="passage-switcher" aria-label="Passage">
            ${data.passages
              .map((item) => {
                const active = item.passage_no === activePassageNo ? "active" : "";
                return `
                  <button class="tab compact-tab ${active}" type="button" data-passage="${item.passage_no}">
                    ${item.passage_no}
                  </button>
                `;
              })
              .join("")}
          </nav>
          <div class="reader-actions">
            <button class="action-button home-button" type="button" id="go-home" aria-label="返回主页" title="返回主页">
              <span class="home-icon" aria-hidden="true"></span>
            </button>
            <button class="action-button answer-button" type="button" id="open-review" aria-label="查看作答汇总" title="查看作答汇总">答</button>
          </div>
        </header>

        <section
          class="split-reader"
          id="split-reader"
          style="--article-size: ${savedSplit}%;"
        >
          <div class="split-pane article-pane">
            ${renderArticle(passage)}
          </div>
          <div
            class="split-resizer"
            id="split-resizer"
            role="separator"
            aria-orientation="horizontal"
            aria-label="调整文章和题目区域比例"
            tabindex="0"
          >
            <span aria-hidden="true"></span>
          </div>
          <div class="split-pane question-pane">
            ${renderQuestions(data.id, activePassageNo, problems)}
          </div>
        </section>
      </main>
    </div>
  `;

  document.querySelector("#test-picker").addEventListener("change", (event) => {
    navigateReading({ view: "test", id: event.target.value, passage: 1 });
  });

  document.querySelectorAll("[data-passage]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateReading({ view: "test", id: data.id, passage: Number(button.dataset.passage) });
    });
  });

  document.querySelectorAll("[data-answer-input]").forEach((input) => {
    input.addEventListener("input", () => {
      localStorage.setItem(input.dataset.answerInput, input.value);
    });
  });
  document.querySelectorAll("[data-choice-input]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) {
        localStorage.setItem(input.dataset.choiceInput, input.value);
      }
    });
  });
  document.querySelectorAll("[data-multi-choice-input]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.multiChoiceInput;
      const maxChoices = Number(input.dataset.maxChoices || 99);
      const groupInputs = Array.from(document.querySelectorAll(`[data-multi-choice-input="${cssEscape(key)}"]`));
      const checkedInputs = groupInputs.filter((item) => item.checked);
      if (checkedInputs.length > maxChoices) {
        input.checked = false;
      }
      const selected = groupInputs
        .filter((item) => item.checked)
        .map((item) => item.value);
      if (selected.length) {
        localStorage.setItem(key, selected.join(","));
      } else {
        localStorage.removeItem(key);
      }
    });
  });

  document.querySelector("#go-home").addEventListener("click", () => {
    navigateReading({ view: "selector" });
  });

  document.querySelector("#open-review").addEventListener("click", () => {
    navigateReading({ view: "workspace" });
  });

  setupSplitResizer(data.id, activePassageNo);
  setupReaderAutoHide();
}

function renderArticle(passage) {
  const qRange = passage.question_range
    ? `Questions ${passage.question_range.start}-${passage.question_range.end}`
    : "";

  return `
    <article class="reader-panel">
      <header class="article-head">
        <p class="eyebrow">Reading Passage ${passage.passage_no}</p>
        <h2>${escapeHtml(passage.title || "Untitled Passage")}</h2>
        ${passage.subtitle ? `<p class="subtitle">${escapeHtml(passage.subtitle)}</p>` : ""}
        <div class="article-meta">
          ${qRange ? `<span class="chip">${escapeHtml(qRange)}</span>` : ""}
          <span class="chip">${passage.paragraphs.length} paragraphs</span>
        </div>
      </header>
      <div class="article-body">
        ${(passage.intro || []).map((line) => `<p class="passage-intro">${escapeHtml(line)}</p>`).join("")}
        ${passage.paragraphs
          .map((paragraph) => {
            const label = paragraph.label
              ? `<span class="para-label">${escapeHtml(paragraph.label)}</span>`
              : "";
            const cls = paragraph.label ? "paragraph" : "paragraph no-label";
            return `
              <section class="${cls}">
                ${label}
                <p>${escapeHtml(paragraph.text)}</p>
              </section>
            `;
          })
          .join("")}
      </div>
    </article>
  `;
}

function renderQuestions(testId, passageNo, problems) {
  const groups = problems?.groups || [];

  return `
    <section class="question-panel">
      <div class="question-head"><h2>Questions</h2></div>
      ${groups.length ? groups.map((group) => renderGroup(testId, passageNo, group)).join("") : `<div class="empty">No questions found.</div>`}
    </section>
  `;
}

function renderGroup(testId, passageNo, group) {
  if (shouldRenderClozeFromRawLines(group)) {
    return renderClozeGroup(testId, passageNo, group);
  }
  const multiSelect = parseMultiSelectGroup(group);
  if (multiSelect) {
    return renderMultiSelectGroup(testId, passageNo, group, multiSelect);
  }
  const multipleChoice = parseMultipleChoiceGroup(group);
  if (multipleChoice) {
    return renderMultipleChoiceGroup(testId, passageNo, group, multipleChoice);
  }

  const instructions = (group.instructions || [])
    .map((line) => `<p class="instruction">${escapeHtml(line)}</p>`)
    .join("");
  const context = (group.context || [])
    .map((line) => `<p class="context-line">${escapeHtml(line)}</p>`)
    .join("");
  const groupOptions = renderOptions(group.options || []);
  const items = (group.items || []).map((item) => renderItem(testId, passageNo, item)).join("");
  const fallback = !items
    ? (group.raw_lines || []).map((line) => `<p class="raw-line">${escapeHtml(line)}</p>`).join("")
    : "";

  return `
    <section class="group">
      <h3>${escapeHtml(group.title)}</h3>
      ${instructions}
      ${context}
      ${groupOptions}
      ${items || fallback}
    </section>
  `;
}

async function renderWorkspace() {
  const sections = await buildWorkspaceSections();
  app.innerHTML = `
    <div class="reading-module">
      <main class="shell review-shell">
        <header class="review-topbar">
          <div class="review-controls workspace-controls">
            <div class="workspace-title">
              <h1>工作区</h1>
              <p>${sections.length ? `${sections.length} 套题有记录` : "还没有记录"}</p>
            </div>
            <div class="review-actions">
              <button class="action-button ghost-action" type="button" id="back-to-reader" aria-label="返回做题" title="返回做题">题</button>
              <button class="action-button clear-button" type="button" id="clear-reading-workspace" aria-label="清空全部记录" title="清空全部记录">×</button>
            </div>
          </div>
        </header>

        <section class="review-panel">
          ${
            sections.length
              ? sections.map((section) => renderWorkspaceSection(section)).join("")
              : `<div class="empty workspace-empty">工作区还是空的。开始作答后，这里会自动出现条目。</div>`
          }
        </section>
      </main>
    </div>
  `;

  document.querySelector("#back-to-reader").addEventListener("click", () => {
    navigateReading(state.lastReaderRoute || { view: "selector" });
  });

  document.querySelector("#clear-reading-workspace").addEventListener("click", () => {
    clearAllWorkspaceRecords();
    renderWorkspace();
  });

  wireWorkspaceInteractions();
}

function renderWorkspaceSection(section) {
  return `
    <section class="workspace-section">
      <div class="workspace-section-head">
        <h2>${escapeHtml(section.id)}</h2>
        <span>${section.passages.length} passages</span>
      </div>
      <div class="workspace-passage-list">
        ${section.passages.map((passage) => renderWorkspacePassageCard(section.id, passage)).join("")}
      </div>
    </section>
  `;
}

function renderWorkspacePassageCard(testId, passage) {
  const doubtKey = passageDoubtStorageKey(testId, passage.passage_no);
  const doubtPanelId = `doubt-panel-${testId}-${passage.passage_no}`;
  const hasDoubt = Boolean(passage.doubt.trim());
  const responsesHtml = passage.responses.length
    ? passage.responses
        .map(
          (response) => `
            <div class="review-response">
              <div class="review-response-head">
                <strong>${escapeHtml(response.label)}</strong>
                ${response.text ? `<span>${escapeHtml(response.text)}</span>` : ""}
              </div>
              <div class="review-response-answer">${escapeHtml(response.answer)}</div>
            </div>
          `,
        )
        .join("")
    : `<p class="review-empty">还没有记录到作答。</p>`;

  return `
    <article class="review-passage-card">
      <div class="review-passage-head">
        <div class="review-passage-meta">
          <button class="review-passage-jump" type="button" data-review-test="${testId}" data-review-passage="${passage.passage_no}">
            Passage ${passage.passage_no}
          </button>
          <div>
            <h2>${escapeHtml(passage.title || `Passage ${passage.passage_no}`)}</h2>
            <p>${passage.responses.length} answered</p>
          </div>
        </div>
        <button
          class="action-button doubt-button ${hasDoubt ? "has-note active" : ""}"
          type="button"
          data-doubt-toggle="${escapeAttr(doubtPanelId)}"
          aria-label="记录疑问"
          title="记录疑问"
        >
          疑
        </button>
      </div>
      <div class="review-response-list">${responsesHtml}</div>
      <div class="doubt-panel ${hasDoubt ? "open" : ""}" id="${escapeAttr(doubtPanelId)}">
        <textarea
          class="doubt-input"
          data-doubt-input="${escapeAttr(doubtKey)}"
          data-doubt-panel="${escapeAttr(doubtPanelId)}"
          placeholder="记录这个 passage 里哪些题有疑问，例如：Q7、Q9-10 为什么这样选？"
        >${escapeHtml(passage.doubt)}</textarea>
      </div>
    </article>
  `;
}

function wireWorkspaceInteractions() {
  document.querySelectorAll("[data-review-passage]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateReading({
        view: "test",
        id: button.dataset.reviewTest,
        passage: Number(button.dataset.reviewPassage),
      });
    });
  });

  document.querySelectorAll("[data-doubt-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = document.querySelector(`#${button.dataset.doubtToggle}`);
      const open = panel.classList.toggle("open");
      button.classList.toggle("active", open);
      if (open) {
        const textarea = panel.querySelector("textarea");
        if (textarea) textarea.focus();
      }
    });
  });

  document.querySelectorAll("[data-doubt-input]").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      writeStoredPassageDoubt(textarea.dataset.doubtInput, textarea.value);
      const toggle = document.querySelector(`[data-doubt-toggle="${textarea.dataset.doubtPanel}"]`);
      if (toggle) {
        toggle.classList.toggle("has-note", Boolean(textarea.value.trim()));
      }
    });
  });
}

function parseMultiSelectGroup(group) {
  const options = group.options || [];
  const instructionText = (group.instructions || []).join(" ");
  const chooseMatch = instructionText.match(/\bChoose\s+(TWO|THREE|FOUR)\s+letters?/i);
  if (!chooseMatch || options.length < 2) return null;

  const questionNumbers = parseQuestionNumbersFromText(group.title);
  if (questionNumbers.length < 2) return null;

  const requiredCount = wordNumberToInteger(chooseMatch[1]);
  return {
    instructions: group.instructions || [],
    prompts: group.context || [],
    options,
    questionNumbers,
    requiredCount,
  };
}

function parseQuestionNumbersFromText(text) {
  return (text.match(/\d{1,2}/g) || []).map(Number);
}

function wordNumberToInteger(word) {
  const lookup = { TWO: 2, THREE: 3, FOUR: 4 };
  return lookup[String(word).toUpperCase()] || 1;
}

function renderMultiSelectGroup(testId, passageNo, group, parsed) {
  const instructions = parsed.instructions
    .map((line) => `<p class="instruction">${renderInlineEmphasis(line)}</p>`)
    .join("");
  const prompts = parsed.prompts
    .map((line) => `<p class="multi-prompt">${escapeHtml(line)}</p>`)
    .join("");
  const key = multiAnswerStorageKey(testId, passageNo, parsed.questionNumbers);
  const selected = new Set(readStoredMultiChoice(key));

  return `
    <section class="group multi-select-group">
      <h3>${escapeHtml(group.title)}</h3>
      ${instructions}
      ${prompts}
      <div class="multi-options" data-max-choices="${parsed.requiredCount}">
        ${parsed.options
          .map((option) => {
            const checked = selected.has(option.label) ? "checked" : "";
            return `
              <label class="multi-option">
                <input
                  type="checkbox"
                  value="${escapeAttr(option.label)}"
                  data-multi-choice-input="${escapeAttr(key)}"
                  data-max-choices="${parsed.requiredCount}"
                  ${checked}
                />
                <span><strong>${escapeHtml(option.label)}</strong> ${escapeHtml(option.text)}</span>
              </label>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function readStoredMultiChoice(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function multiAnswerStorageKey(testId, passageNo, numbers) {
  return `ielts-reader:${testId}:p${passageNo}:q${numbers.join("-")}`;
}

function parseMultipleChoiceGroup(group) {
  const rawLines = group.raw_lines || [];
  const bodyStart = rawLines.findIndex((line) => isNumberedQuestionLine(line));
  if (bodyStart < 0) return null;

  const bodyLines = rawLines.slice(bodyStart);
  const questions = [];
  let current = null;

  for (const rawLine of bodyLines) {
    const line = rawLine.trim();
    const questionMatch = line.match(/^(\d{1,2})(?:[.)]|\s+)(.+)$/);
    if (questionMatch) {
      current = {
        number: Number(questionMatch[1]),
        text: questionMatch[2].trim(),
        options: [],
      };
      questions.push(current);
      continue;
    }

    const optionMatch = line.match(/^([A-J])(?:[.)]|\s+)(.+)$/);
    if (optionMatch && current) {
      current.options.push({
        label: optionMatch[1],
        text: optionMatch[2].trim(),
      });
      continue;
    }

    if (!current) continue;
    if (current.options.length) {
      const option = current.options[current.options.length - 1];
      option.text = `${option.text} ${line}`.trim();
    } else {
      current.text = `${current.text} ${line}`.trim();
    }
  }

  if (!questions.length || questions.some((question) => question.options.length < 2)) {
    return null;
  }
  return { instructions: rawLines.slice(0, bodyStart), questions };
}

function isNumberedQuestionLine(line) {
  return /^\d{1,2}(?:[.)]|\s+)\S/.test(line.trim());
}

function renderMultipleChoiceGroup(testId, passageNo, group, parsed) {
  const instructions = parsed.instructions
    .map((line) => `<p class="instruction">${renderInlineEmphasis(line)}</p>`)
    .join("");
  return `
    <section class="group multiple-choice-group">
      <h3>${escapeHtml(group.title)}</h3>
      ${instructions}
      <div class="mcq-list">
        ${parsed.questions.map((question) => renderMultipleChoiceQuestion(testId, passageNo, question)).join("")}
      </div>
    </section>
  `;
}

function renderMultipleChoiceQuestion(testId, passageNo, question) {
  const key = answerStorageKey(testId, passageNo, question.number);
  const saved = localStorage.getItem(key) || "";
  const name = `${testId}-p${passageNo}-q${question.number}`;
  return `
    <article class="mcq-question">
      <p class="mcq-stem">
        <span class="qnums">${question.number}</span>
        ${escapeHtml(question.text)}
      </p>
      <div class="mcq-options">
        ${question.options
          .map((option) => {
            const checked = saved === option.label ? "checked" : "";
            return `
              <label class="mcq-option">
                <input
                  type="radio"
                  name="${escapeAttr(name)}"
                  value="${escapeAttr(option.label)}"
                  data-choice-input="${escapeAttr(key)}"
                  ${checked}
                />
                <span><strong>${escapeHtml(option.label)}</strong> ${escapeHtml(option.text)}</span>
              </label>
            `;
          })
          .join("")}
      </div>
    </article>
  `;
}

function shouldRenderClozeFromRawLines(group) {
  const items = group.items || [];
  const rawLines = group.raw_lines || [];
  return rawLines.length > 0 && items.some((item) => item.kind === "cloze");
}

function renderClozeGroup(testId, passageNo, group) {
  const rawLines = group.raw_lines || [];
  const splitAt = firstClozeBodyLine(rawLines);
  const instructionLines = rawLines.slice(0, splitAt);
  const bodyLines = rawLines.slice(splitAt);
  const instructions = instructionLines
    .map((line) => `<p class="instruction">${renderInlineEmphasis(line)}</p>`)
    .join("");
  const body = bodyLines
    .map((line, index) => renderClozeBodyLine(testId, passageNo, line, index, bodyLines))
    .join("");

  return `
    <section class="group cloze-group">
      <h3>${escapeHtml(group.title)}</h3>
      ${instructions}
      <div class="cloze-card">${body}</div>
    </section>
  `;
}

function firstClozeBodyLine(lines) {
  const index = lines.findIndex((line) => !isInstructionLine(line));
  return index === -1 ? lines.length : index;
}

function isInstructionLine(line) {
  const text = line.trim();
  return (
    /^(Complete|Choose|Write|Use|Label|Answer|Look at|Do the following|In boxes)\b/i.test(text) ||
    /\b(answer sheet|from the passage|for each answer|below)\b/i.test(text)
  );
}

function renderClozeBodyLine(testId, passageNo, line, index, allLines) {
  const text = line.trim();
  const hasBlank = hasQuestionBlank(text);
  const isBullet = /^[●•-]\s*/.test(text);
  const isWordBank = /^[A-J]\s+\S/.test(text) && !hasBlank;
  const renderedText = renderClozeText(testId, passageNo, text.replace(/^[●•-]\s*/, ""));

  if (!hasBlank && !isBullet && !isWordBank) {
    const className = index === 0 ? "cloze-title" : "cloze-heading";
    return `<p class="${className}">${escapeHtml(text)}</p>`;
  }

  if (isWordBank) {
    return `<p class="word-bank-line">${escapeHtml(text)}</p>`;
  }

  return `
    <div class="cloze-line ${isBullet ? "with-bullet" : ""}">
      ${isBullet ? `<span class="cloze-dot" aria-hidden="true"></span>` : ""}
      <span>${renderedText}</span>
    </div>
  `;
}

function hasQuestionBlank(text) {
  return /\b\d{1,2}\s*(?:[_.…·•]{3,}|-{3,})/.test(text);
}

function renderClozeText(testId, passageNo, text) {
  const escaped = escapeHtml(text);
  return escaped.replace(
    /\(?\b(\d{1,2})\)?\s*(?:[_．.。…·•]{3,}|-{3,})/g,
    (_match, number) => renderInlineAnswerInput(testId, passageNo, Number(number)),
  );
}

function renderInlineAnswerInput(testId, passageNo, number) {
  const key = answerStorageKey(testId, passageNo, number);
  const value = localStorage.getItem(key) || "";
  return `
    <span class="cloze-blank">
      <span class="blank-number">(${number})</span>
      <input
        class="answer-input inline-answer"
        data-answer-input="${escapeAttr(key)}"
        value="${escapeAttr(value)}"
        aria-label="Q${number}"
        autocomplete="off"
      />
    </span>
  `;
}

function renderInlineEmphasis(line) {
  const escaped = escapeHtml(line);
  return escaped
    .replace(/\b(ONE WORD(?: AND\/OR A NUMBER)?|NO MORE THAN [A-Z ]+|TWO WORDS|THREE WORDS)\b/g, "<strong>$1</strong>")
    .replace(/\b(TRUE|FALSE|NOT GIVEN|YES|NO)\b/g, "<strong>$1</strong>");
}

function renderItem(testId, passageNo, item) {
  const numbers = item.question_numbers || [];
  const qText = numbers.length ? numbers.join(", ") : "";
  const choices = renderChoices(testId, passageNo, item);
  const inputs = renderAnswerInputs(testId, passageNo, numbers);

  return `
    <div class="item">
      <div>
        <p class="item-text">
          ${qText ? `<span class="qnums">${escapeHtml(qText)}</span> ` : ""}
          ${escapeHtml(item.text || "")}
        </p>
        ${choices}
      </div>
      ${inputs}
    </div>
  `;
}

function renderChoices(testId, passageNo, item) {
  const options = item.options || [];
  if (!options.length) return "";
  const inputType = (item.question_numbers || []).length > 1 ? "checkbox" : "radio";
  const name = `${testId}-p${passageNo}-q${(item.question_numbers || []).join("-")}`;

  return `
    <div class="choice-list">
      ${options
        .map((option) => {
          const key = `${name}-${option.label}`;
          return `
            <label class="choice">
              <input type="${inputType}" name="${name}" value="${escapeAttr(option.label)}" />
              <span><strong>${escapeHtml(option.label)}</strong> ${escapeHtml(option.text)}</span>
            </label>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderOptions(options) {
  if (!options.length) return "";
  return `
    <div class="options-list">
      ${options
        .map(
          (option) => `
            <div class="option-pill">
              <strong>${escapeHtml(option.label)}</strong> ${escapeHtml(option.text)}
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderAnswerInputs(testId, passageNo, numbers) {
  if (!numbers.length) {
    return `<div class="answer-box"></div>`;
  }
  return `
    <div class="answer-box">
      ${numbers
        .map((number) => {
          const key = answerStorageKey(testId, passageNo, number);
          const value = localStorage.getItem(key) || "";
          return `
            <div class="answer-row">
              <label for="${escapeAttr(key)}">Q${number}</label>
              <input
                class="answer-input"
                id="${escapeAttr(key)}"
                data-answer-input="${escapeAttr(key)}"
                value="${escapeAttr(value)}"
                autocomplete="off"
              />
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderAnswerKey(answerSection) {
  const answers = answerSection?.answers || [];
  if (!answers.length) return "";
  return `
    <div class="answer-key" id="answer-key">
      <div class="answer-grid">
        ${answers
          .map(
            (item) => `
              <div class="answer-cell">
                <strong>${escapeHtml(item.question)}</strong> ${escapeHtml(item.answer)}
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function collectPassageResponses(data, passageNo) {
  const responses = [];
  const passageProblem = data.problems.find((problem) => problem.passage_no === passageNo);
  if (!passageProblem) return responses;

  for (const group of passageProblem.groups || []) {
    const multiSelect = parseMultiSelectGroup(group);
    if (multiSelect) {
      const key = multiAnswerStorageKey(data.id, passageNo, multiSelect.questionNumbers);
      const selected = readStoredMultiChoice(key);
      if (selected.length) {
        responses.push({
          label: `Q${multiSelect.questionNumbers.join("-")}`,
          text: multiSelect.prompts[0] || group.title,
          answer: selected.join(", "),
        });
      }
      continue;
    }

    const multipleChoice = parseMultipleChoiceGroup(group);
    if (multipleChoice) {
      for (const question of multipleChoice.questions) {
        const key = answerStorageKey(data.id, passageNo, question.number);
        const value = localStorage.getItem(key) || "";
        if (value.trim()) {
          responses.push({
            label: `Q${question.number}`,
            text: question.text,
            answer: value.trim(),
          });
        }
      }
      continue;
    }

    for (const item of group.items || []) {
      const numbers = item.question_numbers || [];
      if (!numbers.length) continue;
      if (numbers.length === 1) {
        const key = answerStorageKey(data.id, passageNo, numbers[0]);
        const value = localStorage.getItem(key) || "";
        if (value.trim()) {
          responses.push({
            label: `Q${numbers[0]}`,
            text: item.text,
            answer: value.trim(),
          });
        }
        continue;
      }

      const key = multiAnswerStorageKey(data.id, passageNo, numbers);
      const values = readStoredMultiChoice(key);
      if (values.length) {
        responses.push({
          label: `Q${numbers.join("-")}`,
          text: item.text,
          answer: values.join(", "),
        });
      }
    }
  }

  return responses.sort((a, b) => extractFirstQuestionNumber(a.label) - extractFirstQuestionNumber(b.label));
}

async function buildWorkspaceSections() {
  const testIds = getWorkspaceTestIds();
  const sections = [];
  for (const testId of testIds) {
    const data = await loadTestData(testId);
    const passages = data.passages
      .map((passage) => ({
        ...passage,
        responses: collectPassageResponses(data, passage.passage_no),
        doubt: readStoredPassageDoubt(testId, passage.passage_no),
      }))
      .filter((passage) => passage.responses.length || passage.doubt.trim());
    if (passages.length) {
      sections.push({ id: testId, passages });
    }
  }
  return sections;
}

function getWorkspaceTestIds() {
  const found = new Set();
  const knownIds = new Set((state.manifest?.items || []).map((item) => item.id));
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    const match = key?.match(/^ielts-reader:(\d{2}-\d{2}):p\d+:/);
    if (match && knownIds.has(match[1])) {
      found.add(match[1]);
    }
  }
  return [...found].sort((a, b) => compareTestIds(a, b));
}

function compareTestIds(a, b) {
  const [camA, testA] = a.split("-").map(Number);
  const [camB, testB] = b.split("-").map(Number);
  return camA - camB || testA - testB;
}

function extractFirstQuestionNumber(label) {
  const match = label.match(/\d{1,2}/);
  return match ? Number(match[0]) : 999;
}

function passageDoubtStorageKey(testId, passageNo) {
  return `ielts-reader:${testId}:p${passageNo}:doubt`;
}

function readStoredPassageDoubt(testId, passageNo) {
  return localStorage.getItem(passageDoubtStorageKey(testId, passageNo)) || "";
}

function writeStoredPassageDoubt(key, value) {
  if (value.trim()) {
    localStorage.setItem(key, value);
  } else {
    localStorage.removeItem(key);
  }
}

function clearTestRecords(testId) {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && key.startsWith(`ielts-reader:${testId}:`)) {
      keys.push(key);
    }
  }
  keys.forEach((key) => localStorage.removeItem(key));
}

function clearAllWorkspaceRecords() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && key.startsWith("ielts-reader:")) {
      keys.push(key);
    }
  }
  keys.forEach((key) => localStorage.removeItem(key));
}

function renderError(title, error) {
  app.innerHTML = `
    <div class="reading-module">
      <main class="shell">
        <section class="error-panel">
          <div>
            <div class="mark" aria-hidden="true"><span></span><span></span><span></span></div>
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(error?.message || String(error))}</p>
          </div>
        </section>
      </main>
    </div>
  `;
}

function getSavedSplitRatio(testId, passageNo) {
  void testId;
  void passageNo;
  return 65;
}

function splitStorageKey(testId, passageNo) {
  return `ielts-reader:split-v2:${testId}:p${passageNo}`;
}

function clampRatio(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setupSplitResizer(testId, passageNo) {
  const splitReader = document.querySelector("#split-reader");
  const splitResizer = document.querySelector("#split-resizer");
  if (!splitReader || !splitResizer) return;

  const storageKey = splitStorageKey(testId, passageNo);
  const resizerHeight = splitResizer.getBoundingClientRect().height || 14;

  const ratioBounds = () => {
    const containerHeight = splitReader.getBoundingClientRect().height - resizerHeight;
    const minPanePx = window.innerWidth <= 860 ? 120 : 170;
    if (containerHeight <= 0) {
      return { min: 25, max: 80 };
    }
    const min = Math.max(25, (minPanePx / containerHeight) * 100);
    const max = Math.min(80, 100 - (minPanePx / containerHeight) * 100);
    if (max <= min) {
      return { min: 35, max: 65 };
    }
    return { min, max };
  };

  const setRatio = (ratio, persist = false) => {
    const { min, max } = ratioBounds();
    const next = clampRatio(ratio, min, max);
    splitReader.style.setProperty("--article-size", `${next}%`);
    splitResizer.setAttribute("aria-valuemin", String(Math.round(min)));
    splitResizer.setAttribute("aria-valuemax", String(Math.round(max)));
    splitResizer.setAttribute("aria-valuenow", String(Math.round(next)));
    void persist;
    void storageKey;
  };

  const ratioFromPointer = (clientY) => {
    const rect = splitReader.getBoundingClientRect();
    const usableHeight = rect.height - resizerHeight;
    if (usableHeight <= 0) return 65;
    return ((clientY - rect.top) / usableHeight) * 100;
  };

  const stopDragging = () => {
    document.body.classList.remove("reading-split-dragging");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  const onPointerMove = (event) => {
    event.preventDefault();
    setRatio(ratioFromPointer(event.clientY));
  };

  const onPointerUp = () => {
    const raw = splitReader.style.getPropertyValue("--article-size").replace("%", "");
    setRatio(Number(raw) || 65, true);
    stopDragging();
  };

  splitResizer.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    document.body.classList.add("reading-split-dragging");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });

  splitResizer.addEventListener("keydown", (event) => {
    const current = Number(splitReader.style.getPropertyValue("--article-size").replace("%", "")) || 65;
    const step = event.shiftKey ? 8 : 3;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setRatio(current + step, true);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setRatio(current - step, true);
    }
    if (event.key === "Home") {
      event.preventDefault();
      const { min } = ratioBounds();
      setRatio(min, true);
    }
    if (event.key === "End") {
      event.preventDefault();
      const { max } = ratioBounds();
      setRatio(max, true);
    }
  });

  setRatio(getSavedSplitRatio(testId, passageNo));
}

function setupReaderAutoHide() {
  const readerShell = document.querySelector(".reader-shell");
  const articleScroller = document.querySelector(".article-pane .reader-panel");
  if (!readerShell || !articleScroller) return;

  let lastScrollTop = articleScroller.scrollTop;
  let hidden = false;

  const setHidden = (nextHidden) => {
    if (hidden === nextHidden) return;
    hidden = nextHidden;
    readerShell.classList.toggle("menu-hidden", hidden);
  };

  articleScroller.addEventListener(
    "scroll",
    () => {
      const current = articleScroller.scrollTop;
      const delta = current - lastScrollTop;

      if (current <= 12) {
        setHidden(false);
      } else if (delta > 6) {
        setHidden(true);
      } else if (delta < -6) {
        setHidden(false);
      }

      lastScrollTop = current;
    },
    { passive: true },
  );
}

function answerStorageKey(testId, passageNo, number) {
  return `ielts-reader:${testId}:p${passageNo}:q${number}`;
}

function groupBy(items, getKey) {
  const map = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
