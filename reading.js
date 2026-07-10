const DATA_ROOT = new URL("./reading-question-bank/", window.location.href);
const ZYZ_DATA_ROOT = new URL("./zyz-question-bank/", window.location.href);
const TZX_DATA_ROOT = new URL("./tzx-reading/", window.location.href);
const READING_COLLECTIONS = {
  cambridge: {
    id: "cambridge",
    label: "剑雅",
    root: DATA_ROOT,
  },
  zyz: {
    id: "zyz",
    label: "zyz",
    root: ZYZ_DATA_ROOT,
  },
  tzx: {
    id: "tzx",
    label: "躺着学",
    root: TZX_DATA_ROOT,
  },
};
const ZYZ_CATEGORY_ORDER = [
  "p1-low",
  "p1-medium",
  "p1-high",
  "p2-low",
  "p2-medium",
  "p2-high",
  "p3-low",
  "p3-medium",
  "p3-high",
];
const TZX_CATEGORY_ORDER = ["p1", "p2", "p3"];
const app = document.querySelector("#reading-app");

const state = {
  manifests: {
    cambridge: null,
    zyz: null,
    tzx: null,
  },
  currentData: null,
  dataCache: new Map(),
  lastReaderRoute: null,
  selectionDoubtCleanup: null,
  readerTimerId: null,
  route: { view: "library" },
  initialized: false,
  loadingPromise: null,
};

window.readingApp = {
  show: initReadingApp,
  hide: hideReadingApp,
  openWorkspace: openReadingWorkspace,
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

async function openReadingWorkspace() {
  await initReadingApp();
  navigateReading({ view: "workspace" });
}

function hideReadingApp() {
  teardownArticleDoubtSelection();
  teardownReaderTimer();
}

async function loadReadingManifest() {
  try {
    const [cambridgeManifest, zyzManifest, tzxManifest] = await Promise.all([
      fetchJson(new URL("manifest.json", DATA_ROOT)),
      fetchJson(new URL("manifest.json", ZYZ_DATA_ROOT)),
      fetchJson(new URL("manifest.json", TZX_DATA_ROOT)),
    ]);
    state.manifests.cambridge = normalizeCambridgeManifest(cambridgeManifest);
    state.manifests.zyz = normalizeZyzManifest(zyzManifest);
    state.manifests.tzx = normalizeTzxManifest(tzxManifest);
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

function normalizeCambridgeManifest(manifest) {
  const items = (manifest.items || [])
    .filter((item) => item.status === "ok" || item.status === "warning")
    .map((item) => {
      const [cam, test] = item.id.split("-").map(Number);
      return { ...item, cam, test };
    })
    .sort((a, b) => a.cam - b.cam || a.test - b.test);
  return { ...manifest, items };
}

function normalizeZyzManifest(manifest) {
  const categories = (manifest.categories || [])
    .map((category) => ({
      ...category,
      sortIndex: ZYZ_CATEGORY_ORDER.indexOf(category.id),
    }))
    .sort((a, b) => a.sortIndex - b.sortIndex);
  const items = (manifest.items || [])
    .filter((item) => item.status === "ok")
    .map((item) => ({
      ...item,
      sortIndex: ZYZ_CATEGORY_ORDER.indexOf(item.group),
    }))
    .sort((a, b) => a.sortIndex - b.sortIndex || a.order - b.order || a.id.localeCompare(b.id));
  return { ...manifest, categories, items };
}

function normalizeTzxManifest(manifest) {
  const categories = (manifest.categories || [])
    .map((category) => ({
      ...category,
      sortIndex: TZX_CATEGORY_ORDER.indexOf(category.id),
    }))
    .sort((a, b) => a.sortIndex - b.sortIndex);
  const items = (manifest.items || [])
    .filter((item) => item.status === "ok")
    .map((item) => ({
      ...item,
      sortIndex: TZX_CATEGORY_ORDER.indexOf(item.group),
    }))
    .sort((a, b) => a.sortIndex - b.sortIndex || a.order - b.order || a.id.localeCompare(b.id));
  return { ...manifest, categories, items };
}

function parseRoute() {
  return state.route;
}

function navigateReading(route) {
  state.route = route;
  window.scrollTo({ top: 0, behavior: "auto" });
  renderRoute();
}

function emitReadingRouteChange(route = state.route) {
  const outerView = route.view === "test" || route.view === "workspace" ? route.view : "selector";
  window.dispatchEvent(
    new CustomEvent("reading-route-change", {
      detail: { view: outerView },
    }),
  );
}

async function renderRoute() {
  const route = parseRoute();
  teardownArticleDoubtSelection();
  teardownReaderTimer();
  emitReadingRouteChange(route);
  if (route.view === "test") {
    await renderTest(route.id, route.passage, route.collection || "cambridge");
  } else if (route.view === "workspace") {
    await renderWorkspace();
  } else if (route.view === "cambridge-selector") {
    state.currentData = null;
    renderCambridgeSelector();
  } else if (route.view === "zyz-categories") {
    state.currentData = null;
    renderZyzCategories();
  } else if (route.view === "zyz-list") {
    state.currentData = null;
    renderZyzList(route.group);
  } else if (route.view === "tzx-categories") {
    state.currentData = null;
    renderTzxCategories();
  } else if (route.view === "tzx-list") {
    state.currentData = null;
    renderTzxList(route.group);
  } else {
    state.currentData = null;
    renderLibrarySelector();
  }
}

function renderLibrarySelector() {
  const cambridgeCount = state.manifests.cambridge?.items?.length || 0;
  const zyzCount = state.manifests.zyz?.items?.length || 0;
  const tzxCount = state.manifests.tzx?.items?.length || 0;

  app.innerHTML = `
    <div class="reading-module">
      <main class="shell">
        <header class="topbar library-topbar">
          <div class="brand">
            <div class="mark" aria-hidden="true"><span></span><span></span><span></span></div>
            <div>
              <h1>IELTS Reading Practice</h1>
              <p>选择题库</p>
            </div>
          </div>
        </header>
        <section class="library-panel" aria-label="题库选择">
          <button class="library-card" type="button" data-library="cambridge">
            <strong>剑雅</strong>
            <span>${cambridgeCount} tests</span>
          </button>
          <button class="library-card" type="button" data-library="zyz">
            <strong>zyz</strong>
            <span>${zyzCount} passages</span>
          </button>
          <button class="library-card" type="button" data-library="tzx">
            <strong>躺着学阅读</strong>
            <span>${tzxCount} passages</span>
          </button>
        </section>
      </main>
    </div>
  `;

  document.querySelectorAll("[data-library]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.library === "zyz") {
        navigateReading({ view: "zyz-categories" });
      } else if (button.dataset.library === "tzx") {
        navigateReading({ view: "tzx-categories" });
      } else {
        navigateReading({ view: "cambridge-selector" });
      }
    });
  });
}

function renderCambridgeSelector() {
  const items = state.manifests.cambridge.items;
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
            <button class="button ghost-button" type="button" id="back-to-library">题库</button>
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
  document.querySelector("#back-to-library").addEventListener("click", () => navigateReading({ view: "library" }));

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
    navigateReading({ view: "test", collection: "cambridge", id: button.dataset.readingTest, passage: 1 });
  });

  camFilter.addEventListener("change", draw);
  search.addEventListener("input", draw);
  draw();
}

function renderZyzCategories() {
  const manifest = state.manifests.zyz;
  app.innerHTML = `
    <div class="reading-module">
      <main class="shell">
        <header class="topbar">
          <div class="brand">
            <div class="mark" aria-hidden="true"><span></span><span></span><span></span></div>
            <div>
              <h1>zyz Reading</h1>
              <p>${manifest.items.length} passages · 9 groups</p>
            </div>
          </div>
          <div class="toolbar">
            <button class="button ghost-button" type="button" id="back-to-library">题库</button>
          </div>
        </header>
        <section class="selector-panel">
          <div class="test-grid zyz-category-grid">
            ${manifest.categories
              .map(
                (category) => `
                  <button class="test-card zyz-category-card" type="button" data-zyz-group="${escapeAttr(category.id)}">
                    <strong>${escapeHtml(category.label)}</strong>
                    <span>${category.count} passages</span>
                  </button>
                `,
              )
              .join("")}
          </div>
        </section>
      </main>
    </div>
  `;

  document.querySelector("#back-to-library").addEventListener("click", () => navigateReading({ view: "library" }));
  document.querySelectorAll("[data-zyz-group]").forEach((button) => {
    button.addEventListener("click", () => navigateReading({ view: "zyz-list", group: button.dataset.zyzGroup }));
  });
}

function renderZyzList(groupId) {
  const manifest = state.manifests.zyz;
  const group = manifest.categories.find((item) => item.id === groupId) || manifest.categories[0];
  const items = manifest.items.filter((item) => item.group === group.id);

  app.innerHTML = `
    <div class="reading-module">
      <main class="shell">
        <header class="topbar">
          <div class="brand">
            <div class="mark" aria-hidden="true"><span></span><span></span><span></span></div>
            <div>
              <h1>${escapeHtml(group.label)}</h1>
              <p>${items.length} passages</p>
            </div>
          </div>
          <div class="toolbar">
            <button class="button ghost-button" type="button" id="back-to-zyz-categories">分类</button>
            <input class="field" id="zyz-search" type="search" placeholder="搜索题目" aria-label="搜索 zyz 题目" />
          </div>
        </header>
        <section class="selector-panel" id="zyz-list"></section>
      </main>
    </div>
  `;

  const list = document.querySelector("#zyz-list");
  const search = document.querySelector("#zyz-search");
  const draw = () => {
    const keyword = search.value.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const text = `${item.id} ${item.title} ${item.pdfFilename || ""}`.toLowerCase();
      return !keyword || text.includes(keyword);
    });
    list.innerHTML = renderZyzTestGrid(filtered);
  };

  document.querySelector("#back-to-zyz-categories").addEventListener("click", () => navigateReading({ view: "zyz-categories" }));
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-zyz-test]");
    if (!button) return;
    navigateReading({
      view: "test",
      collection: "zyz",
      id: button.dataset.zyzTest,
      passage: Number(button.dataset.passage || 1),
      group: group.id,
    });
  });
  search.addEventListener("input", draw);
  draw();
}

function renderTzxCategories() {
  const manifest = state.manifests.tzx;
  app.innerHTML = `
    <div class="reading-module">
      <main class="shell">
        <header class="topbar">
          <div class="brand">
            <div class="mark" aria-hidden="true"><span></span><span></span><span></span></div>
            <div>
              <h1>躺着学阅读</h1>
              <p>${manifest.items.length} passages · ${manifest.categories.length} groups</p>
            </div>
          </div>
          <div class="toolbar">
            <button class="button ghost-button" type="button" id="back-to-library">题库</button>
          </div>
        </header>
        <section class="selector-panel">
          <div class="test-grid zyz-category-grid">
            ${manifest.categories
              .map(
                (category) => `
                  <button class="test-card zyz-category-card" type="button" data-tzx-group="${escapeAttr(category.id)}">
                    <strong>${escapeHtml(category.label)}</strong>
                    <span>${category.count} passages</span>
                  </button>
                `,
              )
              .join("")}
          </div>
        </section>
      </main>
    </div>
  `;

  document.querySelector("#back-to-library").addEventListener("click", () => navigateReading({ view: "library" }));
  document.querySelectorAll("[data-tzx-group]").forEach((button) => {
    button.addEventListener("click", () => navigateReading({ view: "tzx-list", group: button.dataset.tzxGroup }));
  });
}

function renderTzxList(groupId) {
  const manifest = state.manifests.tzx;
  const group = manifest.categories.find((item) => item.id === groupId) || manifest.categories[0];
  const items = manifest.items.filter((item) => item.group === group.id);

  app.innerHTML = `
    <div class="reading-module">
      <main class="shell">
        <header class="topbar">
          <div class="brand">
            <div class="mark" aria-hidden="true"><span></span><span></span><span></span></div>
            <div>
              <h1>躺着学阅读 · ${escapeHtml(group.label)}</h1>
              <p>${items.length} passages</p>
            </div>
          </div>
          <div class="toolbar">
            <button class="button ghost-button" type="button" id="back-to-tzx-categories">分类</button>
            <input class="field" id="tzx-search" type="search" placeholder="搜索题目" aria-label="搜索躺着学题目" />
          </div>
        </header>
        <section class="selector-panel" id="tzx-list"></section>
      </main>
    </div>
  `;

  const list = document.querySelector("#tzx-list");
  const search = document.querySelector("#tzx-search");
  const draw = () => {
    const keyword = search.value.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const text = `${item.id} ${item.title} ${item.originalFilename || ""}`.toLowerCase();
      return !keyword || text.includes(keyword);
    });
    list.innerHTML = renderTzxTestGrid(filtered);
  };

  document.querySelector("#back-to-tzx-categories").addEventListener("click", () => navigateReading({ view: "tzx-categories" }));
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tzx-test]");
    if (!button) return;
    navigateReading({
      view: "test",
      collection: "tzx",
      id: button.dataset.tzxTest,
      passage: Number(button.dataset.passage || 1),
      group: group.id,
    });
  });
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

function renderZyzTestGrid(items) {
  if (!items.length) {
    return `<div class="empty">没有匹配的题目</div>`;
  }

  return `
    <div class="test-grid zyz-test-grid">
      ${items
        .map(
          (item) => `
            <button
              class="test-card zyz-test-card"
              type="button"
              data-zyz-test="${escapeAttr(item.id)}"
              data-passage="${escapeAttr(item.passage_no || 1)}"
            >
              <strong>${escapeHtml(item.title || item.id)}</strong>
              <span>${escapeHtml(item.id)} · ${escapeHtml(item.pdfFilename || "")}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTzxTestGrid(items) {
  if (!items.length) {
    return `<div class="empty">没有匹配的题目</div>`;
  }

  return `
    <div class="test-grid zyz-test-grid">
      ${items
        .map(
          (item) => `
            <button
              class="test-card zyz-test-card"
              type="button"
              data-tzx-test="${escapeAttr(item.id)}"
              data-passage="${escapeAttr(item.passage_no || 1)}"
            >
              <strong>${escapeHtml(item.title || item.id)}</strong>
              <span>${escapeHtml(item.id)} · ${escapeHtml(item.originalFilename || "")}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

async function renderTest(id, passageNo, collection = "cambridge") {
  try {
    renderReader(await loadTestData(id, collection), passageNo, collection);
  } catch (error) {
    renderError(`无法加载 ${id}`, error);
  }
}

async function loadTestData(id, collection = "cambridge") {
  const cacheKey = `${collection}:${id}`;
  if (state.dataCache.has(cacheKey)) {
    const cached = state.dataCache.get(cacheKey);
    state.currentData = cached;
    return cached;
  }
  if (!state.currentData || state.currentData.id !== id || state.currentData.collection !== collection) {
    const root = READING_COLLECTIONS[collection]?.root || DATA_ROOT;
    const data = await fetchJson(new URL(`${id}.json`, root));
    state.currentData = { ...data, id, collection };
    state.dataCache.set(cacheKey, state.currentData);
  }
  return state.currentData;
}

function renderReader(data, passageNo, collection = data.collection || "cambridge") {
  const passage = data.passages.find((item) => item.passage_no === passageNo) || data.passages[0];
  const activePassageNo = passage.passage_no;
  const problems = data.problems.find((item) => item.passage_no === activePassageNo);
  const savedSplit = getSavedSplitRatio(data.id, activePassageNo);
  const isHtmlSource = isHtmlReadingSource(collection, data);
  const hasAnswerComparison = hasComparableAnswerKey(data, activePassageNo, collection);
  state.lastReaderRoute = {
    view: "test",
    collection,
    id: data.id,
    passage: activePassageNo,
    group: data.group,
  };

  app.innerHTML = `
    <div class="reading-module">
      <main class="shell reader-shell">
        <header class="reader-controls ${isHtmlSource ? "zyz-reader-controls" : ""}">
          ${
            isHtmlSource
              ? `<div class="reader-controls-left zyz-reader-title">
                  <strong>${escapeHtml(data.title || data.id)}</strong>
                  <span>${escapeHtml(htmlSourceSubtitle(collection, data))}</span>
                </div>`
              : `<div class="reader-controls-left">
                  <select class="field test-picker-compact" id="test-picker" aria-label="切换套题">
                    ${state.manifests.cambridge.items
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
                </nav>`
          }
          <div class="reader-actions">
            <div class="reader-timer" aria-label="用时 0分0秒">
              <span class="reader-timer-icon" aria-hidden="true"></span>
              <span id="reader-timer">0:00</span>
            </div>
            ${
              hasAnswerComparison
                ? `<button
                    class="action-button answer-key-button"
                    type="button"
                    id="open-answer-compare"
                    aria-label="核对答案"
                    title="核对答案"
                  >A</button>`
                : ""
            }
            <button class="action-button home-button" type="button" id="go-home" aria-label="返回主页" title="返回主页">
              <span class="home-icon" aria-hidden="true"></span>
            </button>
            <button class="action-button answer-button" type="button" id="open-review" aria-label="查看工作区" title="查看工作区">答</button>
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
            ${renderQuestions(data, activePassageNo, problems)}
          </div>
        </section>
        <div class="selection-doubt-menu" id="selection-doubt-menu" hidden>
          <button type="button" id="add-selection-doubt" aria-label="加入疑难" title="加入疑难">
            <span aria-hidden="true">+</span>
          </button>
        </div>
        <div class="answer-compare-backdrop" id="answer-compare-backdrop" hidden>
          <section
            class="answer-compare-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="answer-compare-title"
          >
            <header class="answer-compare-head">
              <div>
                <p class="eyebrow">Answer Check</p>
                <h2 id="answer-compare-title">答案核对</h2>
                <p id="answer-compare-subtitle"></p>
              </div>
              <button
                class="action-button answer-compare-close"
                type="button"
                aria-label="关闭答案核对"
                title="关闭"
                data-answer-compare-close
              >×</button>
            </header>
            <div class="answer-compare-summary" id="answer-compare-summary"></div>
            <div class="answer-compare-list" id="answer-compare-list"></div>
          </section>
        </div>
      </main>
    </div>
  `;

  const testPicker = document.querySelector("#test-picker");
  if (testPicker) {
    testPicker.addEventListener("change", (event) => {
      navigateReading({ view: "test", collection: "cambridge", id: event.target.value, passage: 1 });
    });
  }

  document.querySelectorAll("[data-passage]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateReading({ view: "test", collection, id: data.id, passage: Number(button.dataset.passage) });
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
    if (isHtmlSource) {
      navigateReading({ view: `${collection}-list`, group: data.group });
    } else {
      navigateReading({ view: "cambridge-selector" });
    }
  });

  const reviewButton = document.querySelector("#open-review");
  if (reviewButton) {
    reviewButton.addEventListener("click", () => {
      navigateReading({ view: "workspace" });
    });
  }

  const answerCompareButton = document.querySelector("#open-answer-compare");
  if (answerCompareButton) {
    answerCompareButton.addEventListener("click", () => {
      openAnswerComparePanel(data, activePassageNo, collection);
    });
  }
  setupAnswerComparePanel();
  setupReaderTimer();

  if (isHtmlSource) {
    setupZyzAnswers(data, activePassageNo);
    setupHtmlSourceControls();
  }
  setupSplitResizer(data.id, activePassageNo);
  setupReaderAutoHide();
  setupArticleDoubtSelection(data.id, activePassageNo);
}

function renderArticle(passage) {
  const qRange = passage.question_range
    ? `Questions ${passage.question_range.start}-${passage.question_range.end}`
    : "";
  const paragraphCount = passage.paragraphs?.length || 0;

  return `
    <article class="reader-panel">
      <header class="article-head">
        <p class="eyebrow">Reading Passage ${passage.passage_no}</p>
        <h2>${escapeHtml(passage.title || "Untitled Passage")}</h2>
        ${passage.subtitle ? `<p class="subtitle">${escapeHtml(passage.subtitle)}</p>` : ""}
        <div class="article-meta">
          ${qRange ? `<span class="chip">${escapeHtml(qRange)}</span>` : ""}
          <span class="chip">${paragraphCount} paragraphs</span>
        </div>
      </header>
      <div class="article-body">
        ${(passage.intro || []).map((line) => `<p class="passage-intro">${escapeHtml(line)}</p>`).join("")}
        ${
          paragraphCount
            ? passage.paragraphs
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
                .join("")
            : `<div class="zyz-raw-article">${passage.source_html || ""}</div>`
        }
      </div>
    </article>
  `;
}

function renderQuestions(data, passageNo, problems) {
  const groups = problems?.groups || [];

  return `
    <section class="question-panel">
      <div class="question-head"><h2>Questions</h2></div>
      ${groups.length ? groups.map((group) => renderGroup(data.id, passageNo, group)).join("") : `<div class="empty">No questions found.</div>`}
    </section>
  `;
}

function renderGroup(testId, passageNo, group) {
  if (isHtmlSourceGroup(group) && group.source_html) {
    return renderZyzHtmlGroup(group);
  }
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

function renderZyzHtmlGroup(group) {
  return `
    <section class="group zyz-html-group" data-zyz-group>
      ${group.source_html}
    </section>
  `;
}

function isHtmlReadingSource(collection, data = {}) {
  return collection === "zyz" || collection === "tzx" || data.source === "zyz" || data.source === "tzx";
}

function isHtmlSourceGroup(group) {
  return group.source_kind === "zyz-html" || group.source_kind === "tzx-html";
}

function htmlSourceSubtitle(collection, data) {
  const label = READING_COLLECTIONS[collection]?.label || data.source || collection;
  return [label, data.group || data.category].filter(Boolean).join(" · ");
}

function setupHtmlSourceControls() {
  document.querySelectorAll(".question-pane .zyz-html-group .btn-toggle").forEach((button) => {
    button.addEventListener("click", () => toggleHtmlAnswerBox(button));
  });

  document.querySelectorAll(".question-pane .zyz-html-group .mini-btn").forEach((button) => {
    button.addEventListener("click", () => toggleHtmlMatrixAnswer(button));
  });

  document.querySelectorAll(".question-pane .zyz-html-group .radio-cell").forEach((cell) => {
    cell.addEventListener("click", (event) => {
      if (event.target.matches("input")) return;
      const input = cell.querySelector("input");
      if (!input) return;
      input.click();
    });
  });
}

function toggleHtmlAnswerBox(button) {
  const box = button.nextElementSibling;
  if (!box) return;
  const shouldOpen = box.style.display === "none" || box.hidden;
  box.hidden = false;
  box.style.display = shouldOpen ? "block" : "none";
  button.textContent = shouldOpen ? "收起解析" : "显示解析";
  button.classList.toggle("active", shouldOpen);
}

function toggleHtmlMatrixAnswer(button) {
  const row = button.closest("tr")?.nextElementSibling;
  if (!row) return;
  const shouldOpen = row.style.display === "none" || row.hidden;
  row.hidden = false;
  row.style.display = shouldOpen ? "table-row" : "none";
  button.textContent = shouldOpen ? "×" : "析";
  button.classList.toggle("active", shouldOpen);
}

function setupZyzAnswers(data, passageNo) {
  document.querySelectorAll(".question-pane [data-question]").forEach((target) => {
    if (target.querySelector("input, textarea, select")) return;
    const qid = normalizeZyzQuestionId(target.dataset.question);
    const number = zyzDisplayNumber(data, qid);
    if (!number) return;
    const input = document.createElement("input");
    input.className = "answer-input zyz-drop-input";
    input.dataset.zyzQuestion = qid;
    input.setAttribute("aria-label", `Q${number}`);
    input.placeholder = `Q${number}`;
    input.autocomplete = "off";
    target.append(input);
  });

  document.querySelectorAll(".question-pane .zyz-html-group input, .question-pane .zyz-html-group textarea, .question-pane .zyz-html-group select").forEach((input) => {
    const info = getZyzInputInfo(input, data, passageNo);
    if (!info) return;

    if (info.kind === "multi") {
      const selected = new Set(readStoredMultiChoice(info.key));
      input.checked = selected.has(input.value);
      input.addEventListener("change", () => {
        const groupInputs = Array.from(document.querySelectorAll(`[data-zyz-multi-key="${cssEscape(info.key)}"]`));
        const checkedInputs = groupInputs.filter((item) => item.checked);
        if (checkedInputs.length > info.maxChoices) {
          input.checked = false;
        }
        const values = groupInputs.filter((item) => item.checked).map((item) => item.value);
        if (values.length) {
          localStorage.setItem(info.key, values.join(","));
        } else {
          localStorage.removeItem(info.key);
        }
      });
      input.dataset.zyzMultiKey = info.key;
      return;
    }

    const saved = localStorage.getItem(info.key) || "";
    if (info.kind === "checkbox-single") {
      input.checked = saved === input.value;
      input.addEventListener("change", () => {
        const groupInputs = Array.from(document.querySelectorAll(`[data-zyz-checkbox-key="${cssEscape(info.key)}"]`));
        if (input.checked) {
          groupInputs.forEach((item) => {
            if (item !== input) item.checked = false;
          });
          localStorage.setItem(info.key, input.value);
        } else if (!groupInputs.some((item) => item.checked)) {
          localStorage.removeItem(info.key);
        }
      });
      input.dataset.zyzCheckboxKey = info.key;
      return;
    }

    if (input.type === "radio") {
      input.checked = saved === input.value;
      input.addEventListener("change", () => {
        if (input.checked) {
          localStorage.setItem(info.key, input.value);
        }
      });
      return;
    }

    input.value = saved;
    input.addEventListener("input", () => {
      if (input.value.trim()) {
        localStorage.setItem(info.key, input.value);
      } else {
        localStorage.removeItem(info.key);
      }
    });
    input.addEventListener("change", () => {
      if (input.value.trim()) {
        localStorage.setItem(info.key, input.value);
      } else {
        localStorage.removeItem(info.key);
      }
    });
  });
}

function getZyzInputInfo(input, data, passageNo) {
  const rawName = input.dataset.zyzQuestion || input.name || input.id || "";
  const qids = zyzQuestionIdsFromName(rawName);
  if (!qids.length) return null;

  const numbers = qids.map((qid) => zyzDisplayNumber(data, qid)).filter(Boolean);
  if (!numbers.length) return null;

  if (input.type === "checkbox" && numbers.length > 1) {
    return {
      kind: "multi",
      key: multiAnswerStorageKey(data.id, passageNo, numbers),
      maxChoices: numbers.length,
    };
  }

  if (input.type === "checkbox") {
    return {
      kind: "checkbox-single",
      key: answerStorageKey(data.id, passageNo, numbers[0]),
    };
  }

  return {
    kind: "single",
    key: answerStorageKey(data.id, passageNo, numbers[0]),
  };
}

function zyzQuestionIdsFromName(value) {
  const text = String(value || "");
  const range = text.match(/q(\d+)\s*[-–]\s*(\d+)/i);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return Array.from({ length: end - start + 1 }, (_item, index) => `q${start + index}`);
    }
  }
  return [...new Set(text.match(/q\d+/gi) || [])].map(normalizeZyzQuestionId);
}

function normalizeZyzQuestionId(value) {
  const match = String(value || "").match(/q(\d+)/i);
  return match ? `q${Number(match[1])}` : "";
}

function zyzDisplayNumber(data, qid) {
  const mapped = Number(data.question_display_map?.[qid]);
  if (Number.isFinite(mapped) && mapped > 0) return mapped;
  const fallback = Number(String(qid || "").replace(/\D/g, ""));
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
}

function setupArticleDoubtSelection(testId, passageNo) {
  teardownArticleDoubtSelection();

  const articlePanel = document.querySelector(".article-pane .reader-panel");
  const menu = document.querySelector("#selection-doubt-menu");
  const addButton = document.querySelector("#add-selection-doubt");
  if (!articlePanel || !menu || !addButton) return;

  let selectedText = "";
  let pendingFrame = 0;

  const hideMenu = () => {
    menu.hidden = true;
    selectedText = "";
  };

  const readArticleSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    if (!articlePanel.contains(selection.anchorNode) || !articlePanel.contains(selection.focusNode)) return null;

    const text = normalizeDoubtSelectionText(selection.toString());
    if (!text) return null;

    const range = selection.getRangeAt(0);
    const rect = getSelectionMenuRect(range);
    if (!rect) return null;

    return { text, rect };
  };

  const positionMenu = ({ text, rect }) => {
    selectedText = text;
    menu.hidden = false;

    const menuRect = menu.getBoundingClientRect();
    const maxLeft = Math.max(12, window.innerWidth - menuRect.width - 12);
    const left = clampRatio(rect.left + rect.width / 2 - menuRect.width / 2, 12, maxLeft);
    const preferredTop = rect.top - menuRect.height - 10;
    const top = preferredTop >= 12 ? preferredTop : rect.bottom + 10;
    const maxTop = Math.max(12, window.innerHeight - menuRect.height - 12);

    menu.style.left = `${left}px`;
    menu.style.top = `${clampRatio(top, 12, maxTop)}px`;
  };

  const scheduleSelectionCheck = () => {
    if (pendingFrame) {
      window.cancelAnimationFrame(pendingFrame);
    }
    pendingFrame = window.requestAnimationFrame(() => {
      pendingFrame = 0;
      const selectionInfo = readArticleSelection();
      if (selectionInfo) {
        positionMenu(selectionInfo);
      } else {
        hideMenu();
      }
    });
  };

  const handleDocumentPointerDown = (event) => {
    if (menu.contains(event.target)) return;
    if (!articlePanel.contains(event.target)) {
      hideMenu();
    }
  };

  const handleAddSelection = () => {
    const selectionInfo = selectedText ? { text: selectedText } : readArticleSelection();
    const text = selectionInfo?.text || "";
    if (!text) {
      hideMenu();
      return;
    }

    appendPassageDoubt(testId, passageNo, text);
    window.getSelection()?.removeAllRanges();
    hideMenu();
    notifyReadingWorkspace("已加入疑");
  };

  document.addEventListener("selectionchange", scheduleSelectionCheck);
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  articlePanel.addEventListener("mouseup", scheduleSelectionCheck);
  articlePanel.addEventListener("keyup", scheduleSelectionCheck);
  articlePanel.addEventListener("scroll", hideMenu, { passive: true });
  window.addEventListener("resize", hideMenu);
  menu.addEventListener("mousedown", (event) => event.preventDefault());
  addButton.addEventListener("click", handleAddSelection);

  state.selectionDoubtCleanup = () => {
    if (pendingFrame) {
      window.cancelAnimationFrame(pendingFrame);
      pendingFrame = 0;
    }
    document.removeEventListener("selectionchange", scheduleSelectionCheck);
    document.removeEventListener("pointerdown", handleDocumentPointerDown);
    articlePanel.removeEventListener("mouseup", scheduleSelectionCheck);
    articlePanel.removeEventListener("keyup", scheduleSelectionCheck);
    articlePanel.removeEventListener("scroll", hideMenu);
    window.removeEventListener("resize", hideMenu);
    hideMenu();
  };
}

function teardownArticleDoubtSelection() {
  if (!state.selectionDoubtCleanup) return;
  state.selectionDoubtCleanup();
  state.selectionDoubtCleanup = null;
}

function getSelectionMenuRect(range) {
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  const rect = rects[rects.length - 1] || range.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) return null;
  return rect;
}

function normalizeDoubtSelectionText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function appendPassageDoubt(testId, passageNo, text) {
  const key = passageDoubtStorageKey(testId, passageNo);
  const existing = localStorage.getItem(key) || "";
  const next = existing.trim() ? `${existing.trim()}\n\n${text}` : text;
  writeStoredPassageDoubt(key, next);
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
              <p>${sections.length ? `${sections.length} 个条目有记录` : "还没有记录"}</p>
            </div>
            <div class="review-actions">
              <button class="action-button ghost-action" type="button" id="back-to-reader" aria-label="返回做题" title="返回做题">题</button>
              <button class="action-button export-button" type="button" id="export-reading-workspace" aria-label="导出 Markdown" title="导出 Markdown" ${sections.length ? "" : "disabled"}>导</button>
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

  document.querySelector("#export-reading-workspace").addEventListener("click", exportReadingWorkspace);

  document.querySelector("#clear-reading-workspace").addEventListener("click", () => {
    clearAllWorkspaceRecords();
    renderWorkspace();
  });

  wireWorkspaceInteractions();
}

function renderWorkspaceSection(section) {
  const collectionLabel = READING_COLLECTIONS[section.collection]?.label || section.collection || "题库";
  const meta = [collectionLabel, section.group, `${section.passages.length} passages`].filter(Boolean).join(" · ");

  return `
    <section class="workspace-section">
      <div class="workspace-section-head">
        <h2>${escapeHtml(section.id)}</h2>
        <span>${escapeHtml(meta)}</span>
      </div>
      <div class="workspace-passage-list">
        ${section.passages.map((passage) => renderWorkspacePassageCard(section, passage)).join("")}
      </div>
    </section>
  `;
}

function renderWorkspacePassageCard(section, passage) {
  const testId = section.id;
  const doubtKey = passageDoubtStorageKey(testId, passage.passage_no);
  const doubtPanelId = `doubt-panel-${section.collection}-${testId}-${passage.passage_no}`;
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
          <button
            class="review-passage-jump"
            type="button"
            data-review-collection="${escapeAttr(section.collection)}"
            data-review-test="${escapeAttr(testId)}"
            data-review-passage="${escapeAttr(passage.passage_no)}"
            ${section.group ? `data-review-group="${escapeAttr(section.group)}"` : ""}
          >
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
        collection: button.dataset.reviewCollection || "cambridge",
        id: button.dataset.reviewTest,
        passage: Number(button.dataset.reviewPassage),
        group: button.dataset.reviewGroup,
      });
    });
  });

  document.querySelectorAll("[data-doubt-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = document.getElementById(button.dataset.doubtToggle);
      if (!panel) return;
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

function hasComparableAnswerKey(data, passageNo, collection = data.collection || "cambridge") {
  return getComparableAnswerRows(data, passageNo, collection).length > 0;
}

function openAnswerComparePanel(data, passageNo, collection = data.collection || "cambridge") {
  const backdrop = document.querySelector("#answer-compare-backdrop");
  const subtitle = document.querySelector("#answer-compare-subtitle");
  const summary = document.querySelector("#answer-compare-summary");
  const list = document.querySelector("#answer-compare-list");
  if (!backdrop || !subtitle || !summary || !list) return;

  const rows = buildAnswerComparisonRows(data, passageNo, collection);
  if (!rows.length) {
    notifyReadingWorkspace("当前题源没有可核对的答案", true);
    return;
  }

  const answered = rows.filter((row) => row.status !== "blank").length;
  const correct = rows.filter((row) => row.status === "correct").length;
  const wrong = rows.filter((row) => row.status === "wrong").length;
  const collectionLabel = READING_COLLECTIONS[collection]?.label || data.source || collection || "题库";

  subtitle.textContent = `${collectionLabel} · ${data.id || data.title || ""} · Passage ${passageNo}`;
  summary.innerHTML = `
    <span><strong>${correct}</strong> 正确</span>
    <span><strong>${wrong}</strong> 错误</span>
    <span><strong>${answered}/${rows.length}</strong> 已作答</span>
  `;
  list.innerHTML = renderAnswerComparisonRows(rows);
  backdrop.hidden = false;
  backdrop.querySelector("[data-answer-compare-close]")?.focus();
}

function setupAnswerComparePanel() {
  const backdrop = document.querySelector("#answer-compare-backdrop");
  if (!backdrop) return;

  const close = () => {
    backdrop.hidden = true;
  };

  backdrop.querySelectorAll("[data-answer-compare-close]").forEach((button) => {
    button.addEventListener("click", close);
  });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  backdrop.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

function buildAnswerComparisonRows(data, passageNo, collection = data.collection || "cambridge") {
  return getComparableAnswerRows(data, passageNo, collection).map((row) => {
    const userAnswer = readStoredAnswerForQuestion(data.id, passageNo, row.number);
    const status = compareAnswer(userAnswer, row.correctAnswer);
    return {
      ...row,
      userAnswer,
      status,
    };
  });
}

function renderAnswerComparisonRows(rows) {
  return rows
    .map((row) => {
      const userAnswer = row.userAnswer || "未作答";
      return `
        <article class="answer-compare-row ${row.status}">
          <div class="answer-compare-question">
            <strong>${escapeHtml(row.label)}</strong>
          </div>
          <div class="answer-compare-values">
            <div>
              <span>我的答案</span>
              <b>${escapeHtml(userAnswer)}</b>
            </div>
            <div>
              <span>正确答案</span>
              <b>${escapeHtml(row.correctAnswer)}</b>
            </div>
          </div>
          <span class="answer-compare-status">${escapeHtml(answerCompareStatusLabel(row.status))}</span>
        </article>
      `;
    })
    .join("");
}

function getComparableAnswerRows(data, passageNo, collection = data.collection || "cambridge") {
  if (!data?.answer_key) return [];
  if (collection === "tzx" || data.source === "tzx") return [];

  if (Array.isArray(data.answer_key)) {
    const answerSection = data.answer_key.find((item) => Number(item.passage_no) === Number(passageNo));
    const answers = answerSection?.answers || [];
    return answers
      .map((item) => {
        const number = Number(String(item.question || "").match(/\d+/)?.[0]);
        if (!Number.isFinite(number) || number <= 0) return null;
        return {
          number,
          label: `Q${item.question}`,
          correctAnswer: formatAnswerValue(item.answer),
        };
      })
      .filter((item) => item && item.correctAnswer)
      .sort((a, b) => a.number - b.number);
  }

  if (collection !== "zyz" && data.source !== "zyz") return [];
  const answerEntries = data.answer_key && typeof data.answer_key === "object" ? data.answer_key : {};
  const orderedIds = (data.question_order?.length ? data.question_order : Object.keys(answerEntries))
    .map(normalizeZyzQuestionId)
    .filter(Boolean);

  return [...new Set(orderedIds)]
    .map((qid) => {
      const correctAnswer = formatAnswerValue(answerEntries[qid]);
      const number = zyzDisplayNumber(data, qid);
      if (!correctAnswer || !number) return null;
      return {
        number,
        label: `Q${number}`,
        correctAnswer,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);
}

function readStoredAnswerForQuestion(testId, passageNo, number) {
  const direct = (localStorage.getItem(answerStorageKey(testId, passageNo, number)) || "").trim();
  if (direct) return direct;

  const prefix = `ielts-reader:${testId}:p${passageNo}:q`;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const numbers = key
      .slice(prefix.length)
      .split("-")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!numbers.includes(number)) continue;
    const value = (localStorage.getItem(key) || "").trim();
    if (value) return value;
  }

  return "";
}

function compareAnswer(userAnswer, correctAnswer) {
  const normalizedUser = normalizeAnswerForCompare(userAnswer);
  if (!normalizedUser) return "blank";

  const userItems = splitAnswerList(userAnswer).map(normalizeAnswerForCompare).filter(Boolean);
  const correctItems = splitAnswerList(correctAnswer).map(normalizeAnswerForCompare).filter(Boolean);
  if (userItems.length > 1 && correctItems.length > 1 && sameAnswerSet(userItems, correctItems)) {
    return "correct";
  }

  const alternatives = answerAlternatives(correctAnswer).map(normalizeAnswerForCompare).filter(Boolean);
  if (alternatives.includes(normalizedUser)) return "correct";
  if (userItems.length > 1 && alternatives.some((item) => userItems.includes(item))) return "correct";
  return "wrong";
}

function answerAlternatives(answer) {
  return String(answer ?? "")
    .split(/\s*(?:\/|;|\bor\b)\s*/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitAnswerList(answer) {
  return String(answer ?? "")
    .split(/\s*,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sameAnswerSet(left, right) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

function normalizeAnswerForCompare(answer) {
  return String(answer ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/\s*([,;:/])\s*/g, "$1");
}

function formatAnswerValue(answer) {
  if (Array.isArray(answer)) return answer.map(formatAnswerValue).filter(Boolean).join(", ");
  return String(answer ?? "").trim();
}

function answerCompareStatusLabel(status) {
  if (status === "correct") return "正确";
  if (status === "wrong") return "错误";
  return "未作答";
}

function setupReaderTimer() {
  const timer = document.querySelector("#reader-timer");
  const timerWrap = timer?.closest(".reader-timer");
  if (!timer || !timerWrap) return;

  const startedAt = Date.now();
  const update = () => {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    timer.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
    timerWrap.setAttribute("aria-label", `用时 ${minutes}分${seconds}秒`);
  };

  update();
  state.readerTimerId = window.setInterval(update, 1000);
}

function teardownReaderTimer() {
  if (!state.readerTimerId) return;
  window.clearInterval(state.readerTimerId);
  state.readerTimerId = null;
}

function collectPassageResponses(data, passageNo, collection = data.collection || "cambridge") {
  if (isHtmlReadingSource(collection, data)) {
    return collectZyzPassageResponses(data, passageNo);
  }

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

function collectZyzPassageResponses(data, passageNo) {
  const responses = [];
  const prefix = `ielts-reader:${data.id}:p${passageNo}:q`;

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;

    const answer = (localStorage.getItem(key) || "").trim();
    if (!answer) continue;

    const rawNumbers = key.slice(prefix.length);
    const numbers = rawNumbers
      .split("-")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!numbers.length) continue;

    responses.push({
      label: `Q${numbers.join("-")}`,
      text: "",
      answer,
    });
  }

  return responses.sort((a, b) => extractFirstQuestionNumber(a.label) - extractFirstQuestionNumber(b.label));
}

async function exportReadingWorkspace() {
  try {
    const sections = await buildWorkspaceSections();
    if (!sections.length) {
      notifyReadingWorkspace("阅读工作区为空", true);
      return;
    }

    const exportStamp = formatReadingExportStamp(new Date());
    const markdown = buildReadingWorkspaceMarkdown(sections, exportStamp.title);
    downloadMarkdown(`快速阅读${exportStamp.filename}.md`, markdown);
    notifyReadingWorkspace("阅读记录已导出");
  } catch (error) {
    notifyReadingWorkspace(error?.message || "阅读记录导出失败", true);
  }
}

function buildReadingWorkspaceMarkdown(sections, datePart) {
  const lines = [`# 快速阅读${datePart}`, "", "## 答题情况", ""];
  const hasResponses = sections.some((section) =>
    section.passages.some((passage) => passage.responses.length),
  );

  if (!hasResponses) {
    lines.push("无", "");
  } else {
    appendMarkdownResponseSections(lines, sections);
  }

  lines.push("## 疑难问题", "");
  const hasDoubts = sections.some((section) =>
    section.passages.some((passage) => passage.doubt.trim()),
  );

  if (!hasDoubts) {
    lines.push("无", "");
  } else {
    appendMarkdownDoubtSections(lines, sections);
  }

  return `${lines.join("\n").trim()}\n`;
}

function appendMarkdownResponseSections(lines, sections) {
  sections.forEach((section) => {
    const passages = section.passages.filter((passage) => passage.responses.length);
    if (!passages.length) return;

    lines.push(`### ${cleanMarkdownInline(section.id)}`, "");
    passages.forEach((passage) => {
      lines.push(formatPassageHeading(passage), "");
      passage.responses.forEach((response) => {
        lines.push(`- ${cleanMarkdownInline(response.label)}：${cleanMarkdownInline(response.answer)}`);
      });
      lines.push("");
    });
  });
}

function appendMarkdownDoubtSections(lines, sections) {
  sections.forEach((section) => {
    const passages = section.passages.filter((passage) => passage.doubt.trim());
    if (!passages.length) return;

    lines.push(`### ${cleanMarkdownInline(section.id)}`, "");
    passages.forEach((passage) => {
      lines.push(formatPassageHeading(passage), "");
      appendMarkdownQuote(lines, passage.doubt);
      lines.push("");
    });
  });
}

function formatPassageHeading(passage) {
  const title = cleanMarkdownInline(passage.title || "");
  return title ? `#### Passage ${passage.passage_no}：${title}` : `#### Passage ${passage.passage_no}`;
}

function appendMarkdownQuote(lines, value) {
  String(value || "")
    .trim()
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((line) => {
      lines.push(line.trim() ? `> ${line.trim()}` : ">");
    });
}

function cleanMarkdownInline(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function downloadMarkdown(filename, markdown) {
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

function notifyReadingWorkspace(message, isError = false) {
  if (typeof window.showToast === "function") {
    window.showToast(message, isError);
    return;
  }
  window.alert(message);
}

function formatReadingExportStamp(date) {
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

async function buildWorkspaceSections() {
  const entries = getWorkspaceEntries();
  const sections = [];
  for (const entry of entries) {
    const data = await loadTestData(entry.id, entry.collection);
    const passages = data.passages
      .map((passage) => ({
        ...passage,
        responses: collectPassageResponses(data, passage.passage_no, entry.collection),
        doubt: readStoredPassageDoubt(entry.id, passage.passage_no),
      }))
      .filter((passage) => passage.responses.length || passage.doubt.trim());
    if (passages.length) {
      sections.push({
        id: entry.id,
        collection: entry.collection,
        group: data.group || entry.item?.group || "",
        passages,
      });
    }
  }
  return sections;
}

function getWorkspaceEntries() {
  const knownEntries = new Map();
  (state.manifests.cambridge?.items || []).forEach((item) => {
    knownEntries.set(item.id, { id: item.id, collection: "cambridge", item });
  });
  (state.manifests.zyz?.items || []).forEach((item) => {
    knownEntries.set(item.id, { id: item.id, collection: "zyz", item });
  });
  (state.manifests.tzx?.items || []).forEach((item) => {
    knownEntries.set(item.id, { id: item.id, collection: "tzx", item });
  });

  const found = new Map();
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    const match = key?.match(/^ielts-reader:([^:]+):p\d+:(?:q[\d-]+|doubt)$/);
    if (!match) continue;

    const entry = knownEntries.get(match[1]);
    if (entry) {
      found.set(`${entry.collection}:${entry.id}`, entry);
    }
  }
  return [...found.values()].sort(compareWorkspaceEntries);
}

function compareWorkspaceEntries(a, b) {
  const collectionOrder = { cambridge: 0, zyz: 1, tzx: 2 };
  const collectionDiff = (collectionOrder[a.collection] ?? 99) - (collectionOrder[b.collection] ?? 99);
  if (collectionDiff) return collectionDiff;

  if (a.collection === "cambridge") {
    return compareTestIds(a.id, b.id);
  }

  const groupDiff = categorySortIndex(a.collection, a.item?.group) - categorySortIndex(b.collection, b.item?.group);
  if (groupDiff) return groupDiff;
  return Number(a.item?.order || 0) - Number(b.item?.order || 0) || a.id.localeCompare(b.id);
}

function categorySortIndex(collection, group) {
  if (collection === "tzx") return tzxCategorySortIndex(group);
  return zyzCategorySortIndex(group);
}

function zyzCategorySortIndex(group) {
  const index = ZYZ_CATEGORY_ORDER.indexOf(group);
  return index === -1 ? 999 : index;
}

function tzxCategorySortIndex(group) {
  const index = TZX_CATEGORY_ORDER.indexOf(group);
  return index === -1 ? 999 : index;
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
