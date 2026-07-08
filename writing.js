const WRITING_SOURCES = [
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

const writingApp = document.querySelector("#writing-app");

const writingState = {
  route: { view: "sources" },
  initialized: false,
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

function initWritingApp() {
  if (!writingApp) return;
  if (!writingState.initialized) {
    writingState.initialized = true;
  }
  renderWritingRoute();
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

  writingApp.innerHTML = `
    <section class="writing-shell">
      <header class="writing-head">
        <div>
          <h2>${escapeWritingHtml(source.title)}</h2>
          <p>${escapeWritingHtml(source.subtitle)}</p>
        </div>
        <button class="writing-button" type="button" id="back-to-writing-sources">资源</button>
      </header>
      <div class="writing-resource-grid">
        ${source.resources.map((resource) => renderWritingResourceCard(source.id, resource)).join("")}
      </div>
    </section>
  `;

  writingApp.querySelector("#back-to-writing-sources").addEventListener("click", () => {
    navigateWriting({ view: "sources" });
  });
  writingApp.querySelectorAll("[data-writing-resource]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateWriting({
        view: "reader",
        source: source.id,
        resource: button.dataset.writingResource,
      });
    });
  });
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
