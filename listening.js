const LISTENING_ROOT = new URL("./listening-question-bank/", window.location.href);
const LISTENING_STORAGE_KEY = "personal-listening-answers";
const LISTENING_CONTROLS_HIDE_THRESHOLD = 96;
const LISTENING_CONTROLS_SCROLL_DELTA = 4;

const listeningApp = document.querySelector("#listening-app");

const listeningState = {
  manifest: null,
  route: { view: "library" },
  answerStore: {},
  initialized: false,
  loadingPromise: null,
  activeLoadId: 0,
  lastPartRoute: null,
  selectedDndCard: null,
  pointerDnd: null,
  lastScrollY: 0,
  scrollTicking: false,
  controlsHidden: false,
  scrollBound: false,
};

window.listeningApp = {
  show: initListeningApp,
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initIfListeningVisible);
} else {
  initIfListeningVisible();
}

function initIfListeningVisible() {
  if (document.querySelector("#listening-view:not([hidden])")) {
    initListeningApp();
  }
}

async function initListeningApp() {
  if (!listeningApp) return;
  if (listeningState.initialized) {
    renderListeningRoute();
    return;
  }
  if (listeningState.loadingPromise) {
    await listeningState.loadingPromise;
    return;
  }

  renderListeningLoading();
  bindListeningScroll();
  loadListeningAnswers();
  listeningState.loadingPromise = loadListeningManifest();
  await listeningState.loadingPromise;
}

function bindListeningScroll() {
  if (listeningState.scrollBound) return;
  listeningState.scrollBound = true;
  window.addEventListener("scroll", handleListeningScroll, { passive: true });
}

async function loadListeningManifest() {
  try {
    const manifest = await fetchListeningJson(new URL("manifest.json", LISTENING_ROOT));
    listeningState.manifest = normalizeListeningManifest(manifest);
    listeningState.initialized = true;
    renderListeningRoute();
  } catch (error) {
    renderListeningError("听力题库加载失败", error.message || "请检查 listening-question-bank");
  }
}

function normalizeListeningManifest(manifest) {
  const books = (manifest.books || [])
    .map((book) => ({
      ...book,
      tests: (book.tests || [])
        .map((test) => ({
          ...test,
          parts: (test.parts || []).slice().sort((a, b) => a.part - b.part),
        }))
        .sort((a, b) => a.test - b.test),
    }))
    .sort((a, b) => a.cam - b.cam);

  return {
    ...manifest,
    books,
    totalBooks: books.length,
    totalTests: books.reduce((sum, book) => sum + book.tests.length, 0),
    totalParts: books.reduce((sum, book) => sum + book.tests.reduce((partSum, test) => partSum + test.parts.length, 0), 0),
  };
}

async function fetchListeningJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchListeningText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function navigateListening(route) {
  listeningState.route = route;
  renderListeningRoute();
}

function handleListeningScroll() {
  if (listeningState.scrollTicking) return;

  listeningState.scrollTicking = true;
  window.requestAnimationFrame(() => {
    updateListeningScrollUi();
    listeningState.scrollTicking = false;
  });
}

function updateListeningScrollUi() {
  if (listeningState.route.view !== "part") {
    setListeningControlsHidden(false);
    listeningState.lastScrollY = getListeningScrollY();
    return;
  }

  const scrollY = getListeningScrollY();
  const delta = scrollY - listeningState.lastScrollY;

  if (scrollY <= LISTENING_CONTROLS_HIDE_THRESHOLD || delta < -LISTENING_CONTROLS_SCROLL_DELTA) {
    setListeningControlsHidden(false);
  } else if (delta > LISTENING_CONTROLS_SCROLL_DELTA) {
    setListeningControlsHidden(true);
  }

  listeningState.lastScrollY = scrollY;
}

function setListeningControlsHidden(isHidden) {
  listeningState.controlsHidden = isHidden;
  listeningApp?.querySelector("#listening-reader-controls")?.classList.toggle("is-hidden-on-scroll", isHidden);
}

function getListeningScrollY() {
  return Math.max(window.scrollY || document.documentElement.scrollTop || 0, 0);
}

function renderListeningRoute() {
  emitListeningRouteChange(listeningState.route);
  if (listeningState.route.view === "workspace") {
    renderListeningWorkspace();
    return;
  }
  if (listeningState.route.view === "part") {
    renderListeningPart(listeningState.route);
    return;
  }
  renderListeningLibrary();
}

function emitListeningRouteChange(route = listeningState.route) {
  const outerView = route.view === "part" || route.view === "workspace" ? route.view : "selector";
  window.dispatchEvent(
    new CustomEvent("listening-route-change", {
      detail: { view: outerView },
    }),
  );
}

function renderListeningLoading() {
  listeningApp.innerHTML = `
    <section class="listening-module">
      <main class="listening-shell" aria-live="polite">
        <div class="listening-loading">Loading listening tests...</div>
      </main>
    </section>
  `;
}

function renderListeningLibrary() {
  setListeningControlsHidden(false);
  const manifest = listeningState.manifest;
  const books = manifest.books;

  listeningApp.innerHTML = `
    <section class="listening-module">
      <main class="listening-shell">
        <header class="listening-topbar listening-library-topbar">
          <div>
            <h2>随身听力</h2>
            <p>Cambridge IELTS ${books[0]?.cam}-${books[books.length - 1]?.cam} · ${manifest.totalTests} tests · ${manifest.totalParts} parts</p>
          </div>
          <div class="listening-toolbar">
            <select class="listening-field" id="listening-book-filter" aria-label="选择剑桥雅思册数">
              <option value="all">全部册数</option>
              ${books.map((book) => `<option value="${escapeListeningAttr(book.id)}">${escapeListeningHtml(book.shortLabel)}</option>`).join("")}
            </select>
            <input class="listening-field" id="listening-search" type="search" placeholder="搜索 21-01" aria-label="搜索套题">
          </div>
        </header>
        <section class="listening-test-grid" id="listening-test-grid" aria-live="polite"></section>
      </main>
    </section>
  `;

  const bookFilter = listeningApp.querySelector("#listening-book-filter");
  const search = listeningApp.querySelector("#listening-search");
  const grid = listeningApp.querySelector("#listening-test-grid");

  const draw = () => {
    const selectedBook = bookFilter.value;
    const keyword = search.value.trim().toLowerCase();
    const tests = collectListeningTests()
      .filter((entry) => selectedBook === "all" || entry.book.id === selectedBook)
      .filter((entry) => {
        if (!keyword) return true;
        const haystack = [
          entry.book.label,
          entry.book.shortLabel,
          entry.test.label,
          entry.test.id,
          `${entry.book.cam}-${entry.test.test}`,
          `${String(entry.book.cam).padStart(2, "0")}-${String(entry.test.test).padStart(2, "0")}`,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(keyword);
      });

    grid.innerHTML = tests.length
      ? tests.map(renderListeningTestCard).join("")
      : `<div class="listening-empty">没有匹配的听力题目</div>`;

    grid.querySelectorAll("[data-listening-part]").forEach((button) => {
      button.addEventListener("click", () => {
        navigateListening({
          view: "part",
          bookId: button.dataset.listeningBook,
          testId: button.dataset.listeningTest,
          part: Number(button.dataset.listeningPart),
        });
      });
    });
  };

  bookFilter.addEventListener("change", draw);
  search.addEventListener("input", draw);
  draw();
}

function collectListeningTests() {
  return listeningState.manifest.books.flatMap((book) => book.tests.map((test) => ({ book, test })));
}

function renderListeningTestCard({ book, test }) {
  return `
    <article class="listening-test-card">
      <div class="listening-test-card-head">
        <strong>${escapeListeningHtml(book.label)}</strong>
        <span>${escapeListeningHtml(test.label)}</span>
      </div>
      <div class="listening-part-grid">
        ${test.parts.map((part) => renderListeningPartButton(book, test, part)).join("")}
      </div>
    </article>
  `;
}

function renderListeningPartButton(book, test, part) {
  return `
    <button
      class="listening-part-button"
      type="button"
      data-listening-book="${escapeListeningAttr(book.id)}"
      data-listening-test="${escapeListeningAttr(test.id)}"
      data-listening-part="${part.part}"
    >
      <span>${escapeListeningHtml(part.label)}</span>
      <small>${escapeListeningHtml(part.questions || "Questions")}</small>
    </button>
  `;
}

function renderListeningPart(route) {
  const context = findListeningContext(route.bookId, route.testId, route.part);
  if (!context) {
    renderListeningError("听力题目不存在", "请回到题库重新选择。");
    return;
  }

  const { book, test, part } = context;
  listeningState.lastPartRoute = { view: "part", bookId: book.id, testId: test.id, part: part.part };
  const loadId = listeningState.activeLoadId + 1;
  listeningState.activeLoadId = loadId;
  listeningState.lastScrollY = getListeningScrollY();
  listeningState.controlsHidden = false;

  listeningApp.innerHTML = `
    <section class="listening-module">
      <main class="listening-shell listening-reader-shell">
        <div class="listening-reader-controls" id="listening-reader-controls">
          <div class="listening-toolbar listening-reader-toolbar">
            <button class="listening-button" type="button" id="back-to-listening-library">题库</button>
            <select class="listening-field" id="listening-book-select" aria-label="选择剑桥雅思册数">
              ${listeningState.manifest.books.map((item) => `<option value="${escapeListeningAttr(item.id)}"${item.id === book.id ? " selected" : ""}>${escapeListeningHtml(item.shortLabel)}</option>`).join("")}
            </select>
            <select class="listening-field" id="listening-test-select" aria-label="选择 Test">
              ${book.tests.map((item) => `<option value="${escapeListeningAttr(item.id)}"${item.id === test.id ? " selected" : ""}>${escapeListeningHtml(item.label)}</option>`).join("")}
            </select>
            <div class="listening-part-tabs" aria-label="选择 Part">
              ${test.parts.map((item) => `
                <button class="listening-tab${item.part === part.part ? " is-active" : ""}" type="button" data-part-tab="${item.part}">
                  ${item.part}
                </button>
              `).join("")}
            </div>
            <button class="listening-button answer-button" type="button" id="open-listening-workspace">答</button>
            <button class="listening-button danger" type="button" id="clear-listening-answers">清空</button>
          </div>
        </div>
        <header class="listening-reader-titlebar">
          <div class="listening-reader-title">
            <h2>${escapeListeningHtml(book.label)} ${escapeListeningHtml(test.label)} · ${escapeListeningHtml(part.label)}</h2>
            <p>${escapeListeningHtml(part.questions || part.title)}</p>
          </div>
        </header>
        <section class="listening-part-panel">
          <div id="listening-part-content" class="listening-part-content" aria-live="polite">
            <div class="listening-loading">Loading part...</div>
          </div>
        </section>
      </main>
    </section>
  `;

  bindListeningReaderControls(context);
  updateListeningScrollUi();
  loadListeningPartContent(context, loadId);
}

function bindListeningReaderControls(context) {
  const { book, test, part } = context;
  const back = listeningApp.querySelector("#back-to-listening-library");
  const bookSelect = listeningApp.querySelector("#listening-book-select");
  const testSelect = listeningApp.querySelector("#listening-test-select");
  const workspaceButton = listeningApp.querySelector("#open-listening-workspace");
  const clearButton = listeningApp.querySelector("#clear-listening-answers");

  back.addEventListener("click", () => navigateListening({ view: "library" }));

  bookSelect.addEventListener("change", () => {
    const nextBook = listeningState.manifest.books.find((item) => item.id === bookSelect.value);
    const nextTest = nextBook?.tests.find((item) => item.test === test.test) || nextBook?.tests[0];
    const nextPart = nextTest?.parts.find((item) => item.part === part.part) || nextTest?.parts[0];
    if (nextBook && nextTest && nextPart) {
      navigateListening({ view: "part", bookId: nextBook.id, testId: nextTest.id, part: nextPart.part });
    }
  });

  testSelect.addEventListener("change", () => {
    const nextTest = book.tests.find((item) => item.id === testSelect.value);
    const nextPart = nextTest?.parts.find((item) => item.part === part.part) || nextTest?.parts[0];
    if (nextTest && nextPart) {
      navigateListening({ view: "part", bookId: book.id, testId: nextTest.id, part: nextPart.part });
    }
  });

  listeningApp.querySelectorAll("[data-part-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateListening({ view: "part", bookId: book.id, testId: test.id, part: Number(button.dataset.partTab) });
    });
  });

  workspaceButton.addEventListener("click", () => {
    navigateListening({ view: "workspace" });
  });

  clearButton.addEventListener("click", () => {
    clearListeningAnswers(context.part.id);
    const content = listeningApp.querySelector("#listening-part-content");
    if (content) {
      clearListeningInputs(content);
      persistListeningAnswers();
    }
  });
}

async function renderListeningWorkspace() {
  setListeningControlsHidden(false);
  listeningApp.innerHTML = `
    <section class="listening-module">
      <main class="listening-shell listening-workspace-shell">
        <header class="listening-topbar listening-workspace-topbar">
          <div>
            <h2>听力答题情况</h2>
            <p>正在读取记录</p>
          </div>
          <div class="listening-toolbar">
            <button class="listening-button" type="button" id="back-to-listening-part">题目</button>
            <button class="listening-button export-button" type="button" id="export-listening-workspace" disabled>导出</button>
            <button class="listening-button danger" type="button" id="clear-listening-workspace">清空</button>
          </div>
        </header>
        <section class="listening-workspace-panel" id="listening-workspace-panel">
          <div class="listening-loading">Loading listening answers...</div>
        </section>
      </main>
    </section>
  `;

  try {
    const sections = await buildListeningWorkspaceSections();
    if (listeningState.route.view !== "workspace") return;

    const answeredParts = sections.reduce((sum, section) => sum + section.parts.length, 0);
    const answeredQuestions = sections.reduce(
      (sum, section) => sum + section.parts.reduce((partSum, part) => partSum + part.responses.length, 0),
      0,
    );
    const titleMeta = listeningApp.querySelector(".listening-workspace-topbar p");
    const panel = listeningApp.querySelector("#listening-workspace-panel");
    const exportButton = listeningApp.querySelector("#export-listening-workspace");
    if (titleMeta) {
      titleMeta.textContent = sections.length
        ? `${sections.length} 套题 · ${answeredParts} 个 Part · ${answeredQuestions} 条答案`
        : "还没有记录";
    }
    if (panel) {
      panel.innerHTML = sections.length
        ? sections.map(renderListeningWorkspaceSection).join("")
        : `<div class="listening-empty listening-workspace-empty">开始作答后，这里会自动出现听力答案。</div>`;
    }
    if (exportButton) exportButton.disabled = !sections.length;
    bindListeningWorkspaceActions(sections);
  } catch (error) {
    const panel = listeningApp.querySelector("#listening-workspace-panel");
    if (panel) {
      panel.innerHTML = `
        <div class="listening-empty">
          <strong>答题情况加载失败</strong>
          <span>${escapeListeningHtml(error.message || "无法读取听力记录")}</span>
        </div>
      `;
    }
  }
}

function bindListeningWorkspaceActions(sections) {
  const backButton = listeningApp.querySelector("#back-to-listening-part");
  const exportButton = listeningApp.querySelector("#export-listening-workspace");
  const clearButton = listeningApp.querySelector("#clear-listening-workspace");

  backButton?.addEventListener("click", () => {
    navigateListening(listeningState.lastPartRoute || { view: "library" });
  });
  exportButton?.addEventListener("click", () => exportListeningWorkspace(sections));
  clearButton?.addEventListener("click", () => {
    clearAllListeningWorkspaceRecords();
    renderListeningWorkspace();
  });

  listeningApp.querySelectorAll("[data-listening-review-part]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateListening({
        view: "part",
        bookId: button.dataset.listeningReviewBook,
        testId: button.dataset.listeningReviewTest,
        part: Number(button.dataset.listeningReviewPart),
      });
    });
  });
}

function renderListeningWorkspaceSection(section) {
  const total = section.parts.reduce((sum, part) => sum + part.responses.length, 0);
  return `
    <section class="listening-workspace-section">
      <div class="listening-workspace-section-head">
        <div>
          <h3>${escapeListeningHtml(section.title)}</h3>
          <span>${section.parts.length} parts · ${total} answers</span>
        </div>
      </div>
      <div class="listening-workspace-part-list">
        ${section.parts.map((part) => renderListeningWorkspacePart(section, part)).join("")}
      </div>
    </section>
  `;
}

function renderListeningWorkspacePart(section, part) {
  return `
    <article class="listening-workspace-part-card">
      <div class="listening-workspace-part-head">
        <button
          class="listening-workspace-jump"
          type="button"
          data-listening-review-part="${part.part}"
          data-listening-review-book="${escapeListeningAttr(section.bookId)}"
          data-listening-review-test="${escapeListeningAttr(section.testId)}"
        >
          Part ${part.part}
        </button>
        <div>
          <h4>${escapeListeningHtml(part.questions || `Part ${part.part}`)}</h4>
          <p>${part.responses.length} answered</p>
        </div>
      </div>
      <div class="listening-workspace-response-list">
        ${part.responses.map(renderListeningWorkspaceResponse).join("")}
      </div>
    </article>
  `;
}

function renderListeningWorkspaceResponse(response) {
  return `
    <div class="listening-workspace-response">
      <div class="listening-workspace-response-head">
        <strong>${escapeListeningHtml(response.label)}</strong>
        ${response.text ? `<span>${escapeListeningHtml(response.text)}</span>` : ""}
      </div>
      <div class="listening-workspace-answer">${escapeListeningHtml(response.answer)}</div>
    </div>
  `;
}

async function buildListeningWorkspaceSections() {
  const sections = [];

  for (const book of listeningState.manifest.books) {
    for (const test of book.tests) {
      const parts = [];
      for (const part of test.parts) {
        const stored = listeningState.answerStore[part.id];
        if (!hasListeningAnswerData(stored)) continue;

        const responses = await collectListeningPartResponses(part, stored);
        if (responses.length) {
          parts.push({
            part: part.part,
            id: part.id,
            questions: part.questions,
            responses,
          });
        }
      }
      if (parts.length) {
        sections.push({
          bookId: book.id,
          testId: test.id,
          title: `${book.label} ${test.label}`,
          parts,
        });
      }
    }
  }

  return sections;
}

async function collectListeningPartResponses(part, stored) {
  const html = await fetchListeningText(new URL(part.path, LISTENING_ROOT));
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.querySelector(".ielts-listening-question-section") || doc.body;
  const responses = [];
  const seen = new Set();

  root.querySelectorAll("input").forEach((input) => {
    if (!input.name || seen.has(input.name)) return;
    seen.add(input.name);

    const value = stored[input.name];
    if (!hasListeningAnswerValue(value)) return;

    const meta = getListeningQuestionMeta(input);
    const answer = formatListeningStoredAnswer(root, input, value);
    if (!answer) return;

    responses.push({
      label: meta.label,
      text: meta.text,
      answer,
      sort: meta.sort,
    });
  });

  return responses.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
}

function getListeningQuestionMeta(input) {
  const item = input.closest(".ielts-listening-question-item");
  const numbers = extractListeningQuestionNumbers(item || input.closest("td, li, p") || input);
  const label = numbers.length ? formatListeningQuestionLabel(numbers) : "Answer";
  const text = extractListeningPromptText(item, input);
  return {
    label,
    text,
    sort: numbers[0] || 999,
  };
}

function extractListeningQuestionNumbers(source) {
  const numbers = Array.from(source?.querySelectorAll?.(".ielts-listening-question-number") || [])
    .map((item) => Number(item.textContent.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (numbers.length) return [...new Set(numbers)];

  const label = source?.getAttribute?.("aria-label") || "";
  const match = label.match(/\d{1,2}/);
  return match ? [Number(match[0])] : [];
}

function formatListeningQuestionLabel(numbers) {
  if (!numbers.length) return "Answer";
  if (numbers.length === 1) return `Q${numbers[0]}`;
  const sorted = [...numbers].sort((a, b) => a - b);
  const consecutive = sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
  return consecutive ? `Q${sorted[0]}-${sorted[sorted.length - 1]}` : `Q${sorted.join(",")}`;
}

function extractListeningPromptText(item, input) {
  const source = item || input.closest("td, li, p");
  if (!source) return "";

  const clone = source.cloneNode(true);
  clone.querySelectorAll(".ielts-listening-option, .options-drop-zone, .ielts-listening-question-number, input, button").forEach((node) => node.remove());
  return cleanListeningText(clone.textContent);
}

function formatListeningStoredAnswer(root, input, value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => String(item || "").trim())
      .map((item) => formatListeningChoiceAnswer(root, input, item))
      .join(", ");
  }

  const answer = String(value || "").trim();
  if (!answer) return "";
  if (input.type === "radio" || input.type === "checkbox") {
    return formatListeningChoiceAnswer(root, input, answer);
  }
  if (input.type === "hidden") {
    return formatListeningDndAnswer(root, input, answer);
  }
  return answer;
}

function formatListeningChoiceAnswer(root, input, value) {
  const item = input.closest(".ielts-listening-question-item") || root;
  const option = Array.from(item.querySelectorAll(".ielts-listening-option")).find((candidate) => {
    return candidate.querySelector("input")?.value === value;
  });
  const text = cleanListeningText(option?.querySelector("span:last-child")?.textContent || "");
  return text ? `${value}. ${text}` : value;
}

function formatListeningDndAnswer(root, input, value) {
  const group = input.closest(".dnd-zone")?.dataset.dndGroup || "";
  const panel = Array.from(root.querySelectorAll(".options-dnd-panel")).find((item) => item.dataset.dndGroup === group);
  const card = Array.from(panel?.querySelectorAll(".dnd-card") || []).find((item) => item.dataset.value === value);
  return card?.dataset.text || cleanListeningText(card?.textContent || "") || value;
}

function hasListeningAnswerData(data) {
  if (!data || typeof data !== "object") return false;
  return Object.values(data).some(hasListeningAnswerValue);
}

function hasListeningAnswerValue(value) {
  if (Array.isArray(value)) return value.some((item) => String(item || "").trim());
  return Boolean(String(value || "").trim());
}

function clearAllListeningWorkspaceRecords() {
  listeningState.answerStore = {};
  persistListeningAnswers();
}

function exportListeningWorkspace(sections) {
  if (!sections.length) {
    notifyListeningWorkspace("听力工作区为空", true);
    return;
  }

  const stamp = formatListeningExportStamp(new Date());
  const markdown = buildListeningWorkspaceMarkdown(sections, stamp.title);
  downloadListeningMarkdown(`随身听力${stamp.filename}.md`, markdown);
  notifyListeningWorkspace("听力记录已导出");
}

function buildListeningWorkspaceMarkdown(sections, datePart) {
  const lines = [`# 随身听力${datePart}`, "", "## 答题情况", ""];
  sections.forEach((section) => {
    lines.push(`### ${cleanListeningMarkdownInline(section.title)}`, "");
    section.parts.forEach((part) => {
      lines.push(`#### Part ${part.part}${part.questions ? ` · ${cleanListeningMarkdownInline(part.questions)}` : ""}`, "");
      part.responses.forEach((response) => {
        lines.push(`- ${cleanListeningMarkdownInline(response.label)}：${cleanListeningMarkdownInline(response.answer)}`);
      });
      lines.push("");
    });
  });
  return `${lines.join("\n").trim()}\n`;
}

function downloadListeningMarkdown(filename, markdown) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function notifyListeningWorkspace(message, isError = false) {
  const toast = document.getElementById("toast");
  if (!toast) {
    window.alert(message);
    return;
  }
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  window.clearTimeout(notifyListeningWorkspace.timer);
  notifyListeningWorkspace.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function formatListeningExportStamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return {
    filename: `${month}-${day}-${hour}${minute}`,
    title: `${year}-${month}-${day}-${hour}${minute}`,
  };
}

function cleanListeningText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanListeningMarkdownInline(value) {
  return cleanListeningText(value).replace(/\|/g, "\\|");
}

async function loadListeningPartContent(context, loadId) {
  const content = listeningApp.querySelector("#listening-part-content");
  if (!content) return;

  try {
    const html = await fetchListeningText(new URL(context.part.path, LISTENING_ROOT));
    if (loadId !== listeningState.activeLoadId) return;
    content.innerHTML = extractListeningPartHtml(html);
    enhanceListeningPart(content, context.part.id);
  } catch (error) {
    if (loadId !== listeningState.activeLoadId) return;
    content.innerHTML = `
      <div class="listening-empty">
        <strong>Part 加载失败</strong>
        <span>${escapeListeningHtml(error.message || "无法读取 HTML")}</span>
      </div>
    `;
  }
}

function extractListeningPartHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const main = doc.querySelector("main");
  if (!main) return html;

  main.querySelector("h1")?.remove();
  main.querySelector(".meta")?.remove();
  const section = main.querySelector(".ielts-listening-question-section");
  return section ? section.outerHTML : main.innerHTML;
}

function enhanceListeningPart(root, partId) {
  listeningState.selectedDndCard = null;
  restoreListeningAnswers(root, partId);
  initListeningOptionControls(root, partId);
  initListeningDragDrop(root, partId);
  updateListeningOptionStates(root);
  saveListeningAnswers(root, partId);
}

function initListeningOptionControls(root, partId) {
  root.addEventListener("click", (event) => {
    const option = event.target.closest(".ielts-listening-option");
    if (!option || !root.contains(option) || event.target.matches("input, label")) return;

    const input = option.querySelector("input");
    if (!input || input.disabled) return;

    if (input.type === "radio") {
      input.checked = true;
    } else if (input.type === "checkbox") {
      input.checked = !input.checked;
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  root.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.type === "checkbox") enforceCheckboxLimit(root, input);
    updateListeningOptionStates(root);
    saveListeningAnswers(root, partId);
  });

  root.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.type === "text") saveListeningAnswers(root, partId);
  });
}

function initListeningDragDrop(root, partId) {
  const cards = Array.from(root.querySelectorAll(".dnd-card"));
  const zones = Array.from(root.querySelectorAll(".dnd-zone"));

  cards.forEach((card, index) => {
    const group = getDndCardGroup(card);
    card.id ||= `listening-dnd-card-${partId}-${index}`;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-pressed", "false");
    card.dataset.group = group;

    card.addEventListener("dragstart", (event) => {
      if (card.classList.contains("is-used")) {
        event.preventDefault();
        return;
      }
      const data = getDndCardData(card);
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/json", JSON.stringify(data));
      event.dataTransfer.setData("text/plain", data.text);
      selectDndCard(root, card);
    });

    card.addEventListener("click", () => {
      if (card.dataset.justDragged === "true") return;
      if (!card.classList.contains("is-used")) selectDndCard(root, card);
    });

    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!card.classList.contains("is-used")) selectDndCard(root, card);
    });

    card.addEventListener("pointerdown", (event) => {
      if ((event.pointerType === "mouse" && event.button !== 0) || card.classList.contains("is-used")) return;
      beginManualDnd(root, partId, card, event.clientX, event.clientY);
      card.setPointerCapture?.(event.pointerId);
    });

    card.addEventListener("pointermove", (event) => {
      moveManualDnd(event, card);
    });

    card.addEventListener("pointerup", (event) => {
      finishPointerDnd(event, card);
    });

    card.addEventListener("pointercancel", (event) => {
      finishPointerDnd(event, card, { cancel: true });
    });

    card.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || card.classList.contains("is-used")) return;
      beginManualDnd(root, partId, card, event.clientX, event.clientY);

      const handleMouseMove = (moveEvent) => moveManualDnd(moveEvent, card);
      const handleMouseUp = (upEvent) => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        finishPointerDnd(upEvent, card);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      event.preventDefault();
    });
  });

  zones.forEach((zone) => {
    zone.tabIndex = 0;
    zone.setAttribute("role", "button");
    ensureDndClearButton(zone, root, partId);

    zone.addEventListener("dragover", (event) => {
      if (canDropOnZone(event, zone)) {
        event.preventDefault();
        zone.classList.add("is-drag-over");
      }
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("is-drag-over");
    });

    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("is-drag-over");
      const data = readDndData(event);
      if (!data || data.group !== zone.dataset.dndGroup) return;
      fillDndZone(root, zone, data, partId);
    });

    zone.addEventListener("click", (event) => {
      if (event.target.closest(".dnd-clear-zone")) return;
      const selected = listeningState.selectedDndCard;
      if (!selected || selected.dataset.group !== zone.dataset.dndGroup || selected.classList.contains("is-used")) return;
      fillDndZone(root, zone, getDndCardData(selected), partId);
    });

    zone.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const selected = listeningState.selectedDndCard;
      if (!selected || selected.dataset.group !== zone.dataset.dndGroup || selected.classList.contains("is-used")) return;
      fillDndZone(root, zone, getDndCardData(selected), partId);
    });
  });

  restoreDndVisuals(root);
  syncAllDndGroups(root);
}

function beginManualDnd(root, partId, card, clientX, clientY) {
  listeningState.pointerDnd = {
    card,
    data: getDndCardData(card),
    partId,
    root,
    startX: clientX,
    startY: clientY,
    moved: false,
  };
}

function moveManualDnd(event, card) {
  const drag = listeningState.pointerDnd;
  if (!drag || drag.card !== card) return;
  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (distance < 8) return;
  drag.moved = true;
  selectDndCard(drag.root, card);
  card.classList.add("is-pointer-dragging");
  event.preventDefault();
}

function finishPointerDnd(event, card, options = {}) {
  const drag = listeningState.pointerDnd;
  if (!drag || drag.card !== card) return;

  listeningState.pointerDnd = null;
  card.classList.remove("is-pointer-dragging");

  if (options.cancel || !drag.moved) return;

  const target = document.elementFromPoint(event.clientX, event.clientY);
  const zone = target?.closest?.(".dnd-zone");
  if (zone && drag.root.contains(zone) && zone.dataset.dndGroup === drag.data.group) {
    fillDndZone(drag.root, zone, drag.data, drag.partId);
  }

  card.dataset.justDragged = "true";
  window.setTimeout(() => {
    delete card.dataset.justDragged;
  }, 120);
  event.preventDefault();
}

function getDndCardGroup(card) {
  return card.closest(".options-dnd-panel")?.dataset.dndGroup || "";
}

function getDndCardData(card) {
  return {
    group: card.dataset.group || getDndCardGroup(card),
    value: card.dataset.value || card.textContent.trim(),
    text: card.dataset.text || card.textContent.trim(),
  };
}

function selectDndCard(root, card) {
  root.querySelectorAll(".dnd-card.is-selected").forEach((item) => {
    item.classList.remove("is-selected");
    item.setAttribute("aria-pressed", "false");
  });
  listeningState.selectedDndCard = card;
  card.classList.add("is-selected");
  card.setAttribute("aria-pressed", "true");
}

function canDropOnZone(event, zone) {
  const data = readDndData(event);
  return !data || data.group === zone.dataset.dndGroup;
}

function readDndData(event) {
  const rawJson = event.dataTransfer?.getData("application/json");
  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch {
      return null;
    }
  }
  const selected = listeningState.selectedDndCard;
  return selected ? getDndCardData(selected) : null;
}

function fillDndZone(root, zone, data, partId) {
  const input = zone.querySelector("input[type='hidden']");
  const placeholder = zone.querySelector(".dnd-drop-placeholder");
  if (!input || !placeholder) return;

  input.value = data.value;
  zone.dataset.value = data.value;
  zone.classList.add("has-value");
  placeholder.textContent = data.text;
  placeholder.classList.add("dnd-drop-value");
  ensureDndClearButton(zone, root, partId).hidden = false;
  syncDndGroup(root, data.group);
  saveListeningAnswers(root, partId);
}

function clearDndZone(root, zone, partId, options = {}) {
  const input = zone.querySelector("input[type='hidden']");
  const placeholder = zone.querySelector(".dnd-drop-placeholder");
  if (!input || !placeholder) return;

  const group = zone.dataset.dndGroup;
  input.value = "";
  delete zone.dataset.value;
  zone.classList.remove("has-value", "is-drag-over");
  placeholder.textContent = "Drop answer here";
  placeholder.classList.remove("dnd-drop-value");
  const clearButton = zone.querySelector(".dnd-clear-zone");
  if (clearButton) clearButton.hidden = true;
  syncDndGroup(root, group);
  if (options.persist !== false) saveListeningAnswers(root, partId);
}

function ensureDndClearButton(zone, root, partId) {
  let button = zone.querySelector(".dnd-clear-zone");
  if (button) return button;

  button = document.createElement("button");
  button.className = "dnd-clear-zone";
  button.type = "button";
  button.textContent = "x";
  button.setAttribute("aria-label", "清除答案");
  button.hidden = true;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    clearDndZone(root, zone, partId);
  });
  zone.append(button);
  return button;
}

function restoreDndVisuals(root) {
  root.querySelectorAll(".dnd-zone").forEach((zone) => {
    const input = zone.querySelector("input[type='hidden']");
    if (!input?.value) {
      clearDndZone(root, zone, "", { persist: false });
      return;
    }
    const card = findDndCardByValue(root, zone.dataset.dndGroup, input.value);
    const data = card ? getDndCardData(card) : { group: zone.dataset.dndGroup, value: input.value, text: input.value };
    fillDndZone(root, zone, data, "");
  });
}

function findDndCardByValue(root, group, value) {
  return Array.from(root.querySelectorAll(".dnd-card")).find((card) => {
    return (card.dataset.group || getDndCardGroup(card)) === group && (card.dataset.value || card.textContent.trim()) === value;
  });
}

function syncAllDndGroups(root) {
  const groups = new Set(Array.from(root.querySelectorAll(".dnd-zone")).map((zone) => zone.dataset.dndGroup).filter(Boolean));
  groups.forEach((group) => syncDndGroup(root, group));
}

function syncDndGroup(root, group) {
  const panel = Array.from(root.querySelectorAll(".options-dnd-panel")).find((item) => item.dataset.dndGroup === group);
  if (!panel) return;

  const allowDuplicates = panel.dataset.allowDuplicates === "true";
  const usedValues = new Set(
    Array.from(root.querySelectorAll(".dnd-zone"))
      .filter((zone) => zone.dataset.dndGroup === group)
      .map((zone) => zone.dataset.value)
      .filter(Boolean),
  );

  panel.querySelectorAll(".dnd-card").forEach((card) => {
    const isUsed = !allowDuplicates && usedValues.has(card.dataset.value || card.textContent.trim());
    card.classList.toggle("is-used", isUsed);
    card.setAttribute("aria-disabled", isUsed ? "true" : "false");
    card.draggable = !isUsed;
    if (isUsed && listeningState.selectedDndCard === card) {
      listeningState.selectedDndCard = null;
      card.classList.remove("is-selected");
      card.setAttribute("aria-pressed", "false");
    }
  });
}

function enforceCheckboxLimit(root, input) {
  const limit = Number(input.dataset.limit || 0);
  if (!limit || !input.checked) return;

  const group = Array.from(root.querySelectorAll("input[type='checkbox']")).filter((item) => item.name === input.name);
  const checked = group.filter((item) => item.checked);
  if (checked.length <= limit) return;

  input.checked = false;
  const question = input.closest(".ielts-listening-question-item") || input.closest(".ielts-listening-questions");
  question?.classList.add("is-limit-hit");
  window.setTimeout(() => question?.classList.remove("is-limit-hit"), 650);
}

function updateListeningOptionStates(root) {
  root.querySelectorAll(".ielts-listening-option").forEach((option) => {
    const input = option.querySelector("input");
    option.classList.toggle("is-selected", Boolean(input?.checked));
  });
}

function saveListeningAnswers(root, partId) {
  if (!partId) return;
  listeningState.answerStore[partId] = serializeListeningAnswers(root);
  persistListeningAnswers();
}

function serializeListeningAnswers(root) {
  const data = {};
  root.querySelectorAll("input").forEach((input) => {
    if (!input.name) return;
    if (input.type === "radio") {
      if (input.checked) data[input.name] = input.value;
      return;
    }
    if (input.type === "checkbox") {
      if (!Array.isArray(data[input.name])) data[input.name] = [];
      if (input.checked) data[input.name].push(input.value);
      return;
    }
    data[input.name] = input.value;
  });
  return data;
}

function restoreListeningAnswers(root, partId) {
  const data = listeningState.answerStore[partId] || {};
  root.querySelectorAll("input").forEach((input) => {
    if (!input.name || !(input.name in data)) return;
    if (input.type === "radio") {
      input.checked = data[input.name] === input.value;
      return;
    }
    if (input.type === "checkbox") {
      input.checked = Array.isArray(data[input.name]) && data[input.name].includes(input.value);
      return;
    }
    input.value = data[input.name] || "";
  });
}

function clearListeningInputs(root) {
  root.querySelectorAll("input").forEach((input) => {
    if (input.type === "radio" || input.type === "checkbox") {
      input.checked = false;
    } else {
      input.value = "";
    }
  });
  root.querySelectorAll(".dnd-zone").forEach((zone) => clearDndZone(root, zone, "", { persist: false }));
  updateListeningOptionStates(root);
  syncAllDndGroups(root);
}

function loadListeningAnswers() {
  try {
    listeningState.answerStore = JSON.parse(localStorage.getItem(LISTENING_STORAGE_KEY) || "{}");
  } catch {
    listeningState.answerStore = {};
  }
}

function persistListeningAnswers() {
  localStorage.setItem(LISTENING_STORAGE_KEY, JSON.stringify(listeningState.answerStore));
}

function clearListeningAnswers(partId) {
  delete listeningState.answerStore[partId];
}

function findListeningContext(bookId, testId, partNumber) {
  const book = listeningState.manifest?.books.find((item) => item.id === bookId);
  const test = book?.tests.find((item) => item.id === testId);
  const part = test?.parts.find((item) => item.part === Number(partNumber));
  return book && test && part ? { book, test, part } : null;
}

function renderListeningError(title, detail = "") {
  listeningApp.innerHTML = `
    <section class="listening-module">
      <main class="listening-shell">
        <div class="listening-empty">
          <strong>${escapeListeningHtml(title)}</strong>
          <span>${escapeListeningHtml(detail)}</span>
        </div>
      </main>
    </section>
  `;
}

function escapeListeningHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeListeningAttr(value) {
  return escapeListeningHtml(value).replaceAll("`", "&#096;");
}
