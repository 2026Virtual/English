const TZX_WRITING_MANIFEST_URL = "./writing-resources/tzx-writing-manifest.json";

const BASE_WRITING_SOURCES = [
  {
    id: "simon",
    title: "simon",
    subtitle: "Task 1 / Task 2 写作资料",
    icon: "S",
    resources: [
      {
        id: "simon-task1",
        title: "Simon Task 1",
        subtitle: "图表写作笔记",
        url: "./writing-resources/simon/simon_task1_article.html",
      },
      {
        id: "simon-task2",
        title: "Simon Task 2",
        subtitle: "大作文写作笔记",
        url: "./writing-resources/simon/simon_task2_article.html",
      },
    ],
  },
  {
    id: "ielts-fast",
    title: "雅思作文10小时速成秘籍",
    subtitle: "合集资料",
    icon: "10",
    directOpen: true,
    resources: [
      {
        id: "ielts-fast-collection",
        title: "雅思作文10小时速成秘籍（合集）",
        subtitle: "PDF转HTML，可能存在问题，260708版本",
        url: "./writing-resources/ielts_fast.html",
      },
    ],
  },
];

let WRITING_SOURCES = [...BASE_WRITING_SOURCES];

const writingApp = document.querySelector("#writing-app");

const writingState = {
  route: { view: "sources" },
  sourceFilters: {},
  initialized: false,
  loadingPromise: null,
};

window.writingApp = {
  show: initWritingApp,
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initIfWritingVisible);
} else {
  initIfWritingVisible();
}

function initIfWritingVisible() {
  if (document.querySelector("#writing-view:not([hidden])")) {
    initWritingApp();
  }
}

async function initWritingApp() {
  if (!writingApp) return;
  if (!writingState.initialized) {
    writingState.initialized = true;
  }
  if (!writingState.loadingPromise) {
    writingState.loadingPromise = loadWritingSources();
  }
  await writingState.loadingPromise;
  renderWritingRoute();
}

async function loadWritingSources() {
  try {
    const response = await fetch(TZX_WRITING_MANIFEST_URL);
    if (!response.ok) return;
    const manifest = await response.json();
    mergeTzxWritingSources(manifest);
  } catch (error) {
    console.warn("躺着学写作资料加载失败", error);
  }
}

function mergeTzxWritingSources(manifest) {
  const groups = Array.isArray(manifest?.groups) ? manifest.groups : [];
  const importedSources = groups
    .filter((group) => Array.isArray(group.resources) && group.resources.length)
    .map((group) => ({
      id: group.id,
      title: group.title,
      subtitle: group.subtitle,
      icon: group.icon,
      tags: group.tags || [],
      resources: group.resources,
    }));
  if (!importedSources.length) return;

  const importedIds = new Set(importedSources.map((source) => source.id));
  WRITING_SOURCES = [...BASE_WRITING_SOURCES.filter((source) => !importedIds.has(source.id)), ...importedSources];
}

function navigateWriting(route) {
  writingState.route = route;
  renderWritingRoute();
}

function renderWritingRoute() {
  const route = writingState.route;
  if (route.view === "source") {
    renderWritingSource(route.source);
    return;
  }
  if (route.view === "reader") {
    renderWritingReader(route.source, route.resource);
    return;
  }
  renderWritingSources();
}

function renderWritingSources() {
  writingApp.innerHTML = `
    <section class="writing-shell">
      <header class="writing-head">
        <div>
          <h2>写作积累</h2>
          <p>选择资料来源</p>
        </div>
      </header>
      <div class="writing-source-grid">
        ${WRITING_SOURCES.map(renderWritingSourceCard).join("")}
      </div>
    </section>
  `;

  writingApp.querySelectorAll("[data-writing-source]").forEach((button) => {
    button.addEventListener("click", () => {
      const source = findWritingSource(button.dataset.writingSource);
      if (source?.directOpen && source.resources.length === 1) {
        window.location.href = source.resources[0].url;
        return;
      }
      navigateWriting({ view: "source", source: button.dataset.writingSource });
    });
  });
}

function renderWritingSourceCard(source) {
  return `
    <button class="writing-card writing-source-card" type="button" data-writing-source="${escapeWritingAttr(source.id)}">
      <span class="writing-card-icon" aria-hidden="true">${escapeWritingHtml(source.icon ?? source.title.slice(0, 1).toUpperCase())}</span>
      <span>
        <strong>${escapeWritingHtml(source.title)}</strong>
        <small>${escapeWritingHtml(source.subtitle)}</small>
      </span>
    </button>
  `;
}

function renderWritingSource(sourceId) {
  const source = findWritingSource(sourceId);
  if (!source) {
    renderWritingError("资料不存在");
    return;
  }

  const hasFilters = source.resources.length > 20;
  const filters = getWritingSourceFilters(source.id);
  const filteredResources = filterWritingResources(source, filters);

  writingApp.innerHTML = `
    <section class="writing-shell">
      <header class="writing-head">
        <div>
          <h2>${escapeWritingHtml(source.title)}</h2>
          <p>${escapeWritingHtml(source.subtitle)}</p>
        </div>
        <button class="writing-button" type="button" id="back-to-writing-sources">资源</button>
      </header>
      ${
        hasFilters
          ? `<div class="writing-resource-controls">
              <input
                class="writing-filter-input"
                id="writing-resource-search"
                type="search"
                placeholder="搜索题目 / ID / 类型"
                value="${escapeWritingAttr(filters.keyword)}"
                aria-label="搜索写作资料"
              />
              <select class="writing-filter-select" id="writing-resource-tag" aria-label="筛选写作类型">
                ${renderWritingTagOptions(source, filters.tag)}
              </select>
              <span class="writing-resource-count" id="writing-resource-count">${filteredResources.length}/${source.resources.length}</span>
            </div>`
          : ""
      }
      <div class="writing-resource-grid" id="writing-resource-grid">
        ${renderWritingResourceGrid(source.id, filteredResources)}
      </div>
    </section>
  `;

  writingApp.querySelector("#back-to-writing-sources").addEventListener("click", () => {
    navigateWriting({ view: "sources" });
  });

  const search = writingApp.querySelector("#writing-resource-search");
  const tag = writingApp.querySelector("#writing-resource-tag");
  if (search) {
    search.addEventListener("input", () => {
      updateWritingSourceFilter(source.id, { keyword: search.value });
      drawWritingResourceGrid(source);
    });
  }
  if (tag) {
    tag.addEventListener("change", () => {
      updateWritingSourceFilter(source.id, { tag: tag.value });
      drawWritingResourceGrid(source);
    });
  }

  bindWritingResourceCards(source.id);
}

function renderWritingResourceCard(sourceId, resource) {
  return `
    <button
      class="writing-card writing-resource-card"
      type="button"
      data-writing-source="${escapeWritingAttr(sourceId)}"
      data-writing-resource="${escapeWritingAttr(resource.id)}"
    >
      <span>
        <strong>${escapeWritingHtml(resource.title)}</strong>
        <small>${escapeWritingHtml(resource.subtitle)}</small>
      </span>
    </button>
  `;
}

function renderWritingResourceGrid(sourceId, resources) {
  if (!resources.length) {
    return `<div class="empty-state">没有匹配的资料</div>`;
  }
  return resources.map((resource) => renderWritingResourceCard(sourceId, resource)).join("");
}

function bindWritingResourceCards(sourceId) {
  writingApp.querySelectorAll("[data-writing-resource]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateWriting({
        view: "reader",
        source: sourceId,
        resource: button.dataset.writingResource,
      });
    });
  });
}

function drawWritingResourceGrid(source) {
  const grid = writingApp.querySelector("#writing-resource-grid");
  const count = writingApp.querySelector("#writing-resource-count");
  if (!grid) return;

  const filters = getWritingSourceFilters(source.id);
  const filteredResources = filterWritingResources(source, filters);
  grid.innerHTML = renderWritingResourceGrid(source.id, filteredResources);
  if (count) {
    count.textContent = `${filteredResources.length}/${source.resources.length}`;
  }
  bindWritingResourceCards(source.id);
}

function getWritingSourceFilters(sourceId) {
  const current = writingState.sourceFilters[sourceId] || {};
  return {
    keyword: current.keyword || "",
    tag: current.tag || "all",
  };
}

function updateWritingSourceFilter(sourceId, nextFilter) {
  writingState.sourceFilters[sourceId] = {
    ...getWritingSourceFilters(sourceId),
    ...nextFilter,
  };
}

function filterWritingResources(source, filters) {
  const keyword = filters.keyword.trim().toLowerCase();
  return source.resources.filter((resource) => {
    const tagOk = filters.tag === "all" || resource.tag === filters.tag;
    const text = `${resource.id} ${resource.title} ${resource.subtitle} ${resource.tag || ""}`.toLowerCase();
    const keywordOk = !keyword || text.includes(keyword);
    return tagOk && keywordOk;
  });
}

function renderWritingTagOptions(source, selectedTag) {
  const counts = new Map();
  for (const resource of source.resources) {
    if (!resource.tag) continue;
    counts.set(resource.tag, (counts.get(resource.tag) || 0) + 1);
  }
  const tags = source.tags?.length
    ? source.tags.map((item) => [item.tag, item.count])
    : [...counts.entries()];
  const options = [`<option value="all"${selectedTag === "all" ? " selected" : ""}>全部类型</option>`];
  for (const [tag, count] of tags) {
    options.push(
      `<option value="${escapeWritingAttr(tag)}"${selectedTag === tag ? " selected" : ""}>${escapeWritingHtml(tag)} · ${count}</option>`,
    );
  }
  return options.join("");
}

function renderWritingReader(sourceId, resourceId) {
  const source = findWritingSource(sourceId);
  const resource = source?.resources.find((item) => item.id === resourceId);
  if (!source || !resource) {
    renderWritingError("资料不存在");
    return;
  }

  window.location.href = resource.url;
}

function renderWritingError(message) {
  writingApp.innerHTML = `
    <section class="writing-shell">
      <div class="empty-state">${escapeWritingHtml(message)}</div>
    </section>
  `;
}

function findWritingSource(sourceId) {
  return WRITING_SOURCES.find((source) => source.id === sourceId);
}

function escapeWritingHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeWritingAttr(value) {
  return escapeWritingHtml(value).replaceAll("`", "&#096;");
}
