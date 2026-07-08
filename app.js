const DEFAULT_API_ENDPOINT = "";
const DEFAULT_MODEL = "ecnu-max";
const GROUP_COLORS = ["#ef4444", "#0f766e", "#2563eb", "#d97706", "#7c3aed", "#0891b2"];
const API_SETTINGS_STORAGE_KEY = "personal-vocab-supabase-settings";
const WORKSPACE_STORAGE_KEY = "personal-vocab-workspace";
const CLOUD_SETTINGS_STORAGE_KEY = "personal-vocab-cloud-settings";
const CLOUD_SESSION_STORAGE_KEY = "personal-vocab-cloud-session";
const CLOUD_CACHE_STORAGE_KEY = "personal-vocab-cloud-cache";
const CLOUD_TABLE_NAME = "vocabulary_mistakes";
const PREWARM_INTERVAL_MS = 10 * 60 * 1000;
const SCROLL_TOP_THRESHOLD = 280;
const HEADER_HIDE_THRESHOLD = 120;
const HEADER_SCROLL_DELTA = 3;
const MEANING_PEEK_DELAY_MS = 1000;
const CLOUD_TOOLS_HIDE_THRESHOLD = 36;
const CLOUD_TOOLS_SCROLL_DELTA = 3;
const CLOUD_TOOLS_TOGGLE_LOCK_MS = 450;
const CLOUD_FETCH_PAGE_SIZE = 1000;
const PAGE_TITLES = {
  home: "英语速提升系统",
  vocabulary: "个人背单词",
  reading: "阅读提升",
  listening: "随身听力",
  writing: "写作积累",
};
const PAGE_COPY = {
  home: "个人学习入口",
  vocabulary: "逻辑词群记忆",
  reading: "雅思阅读训练",
  listening: "剑桥雅思听力真题",
  writing: "雅思写作素材",
};

const state = {
  activePage: "home",
  chapters: [],
  chapterIndex: 0,
  searchText: "",
  notes: [],
  mnemonics: new Map(),
  readingSubView: "selector",
  listeningSubView: "selector",
  api: {
    endpoint: DEFAULT_API_ENDPOINT,
    model: DEFAULT_MODEL,
    key: "",
  },
  cloud: {
    url: "",
    anonKey: "",
    email: "",
    session: null,
    notes: [],
    workspace: [],
    selectedNotebook: "",
    lastScrollTop: 0,
    toolsHidden: false,
    toolsToggleLockedUntil: 0,
    loaded: false,
    busy: false,
  },
  voices: [],
  pendingMnemonic: null,
  prewarmTimer: null,
  currentAudio: null,
  meaningHidden: false,
  lastScrollY: 0,
  scrollTicking: false,
  headerHiddenByScroll: false,
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  switchPage(pageFromHash(), { updateHash: false });
  loadApiSettings();
  loadCloudSettings();
  loadCloudSession();
  loadCloudCache();
  loadWorkspace();
  updateApiState();
  updateMeaningModeUi();
  renderCloudNotebook();
  startPrewarmLoop();
  initVoices();
  loadData();
});

function cacheElements() {
  els.toast = document.getElementById("toast");
  els.appHeader = document.querySelector(".app-header");
  els.title = document.getElementById("app-title");
  els.subtitle = document.getElementById("app-subtitle");
  els.homeView = document.getElementById("home-view");
  els.homeButton = document.getElementById("home-button");
  els.openReadingWorkspace = document.getElementById("open-reading-workspace");
  els.homeMenuButtons = Array.from(document.querySelectorAll(".home-menu-button"));
  els.vocabularyView = document.getElementById("vocabulary-view");
  els.readingView = document.getElementById("reading-view");
  els.listeningView = document.getElementById("listening-view");
  els.writingView = document.getElementById("writing-view");
  els.scrollTop = document.getElementById("scroll-top");
  els.vocabActions = document.getElementById("vocab-actions");
  els.chapterSelect = document.getElementById("chapter-select");
  els.searchInput = document.getElementById("search-input");
  els.wordList = document.getElementById("word-list");
  els.chapterTitle = document.getElementById("chapter-title");
  els.chapterMeta = document.getElementById("chapter-meta");
  els.noteCount = document.getElementById("note-count");
  els.toggleMeaning = document.getElementById("toggle-meaning");
  els.cloudNoteCount = document.getElementById("cloud-note-count");
  els.cloudWorkspaceCount = document.getElementById("cloud-workspace-count");
  els.cloudMainWorkspaceCount = document.getElementById("cloud-main-workspace-count");
  els.exportNotes = document.getElementById("export-notes");
  els.openWorkspace = document.getElementById("open-workspace");
  els.openCloudNotebook = document.getElementById("open-cloud-notebook");
  els.closeWorkspace = document.getElementById("close-workspace");
  els.closeCloudNotebook = document.getElementById("close-cloud-notebook");
  els.clearWorkspace = document.getElementById("clear-workspace");
  els.workspacePanel = document.getElementById("workspace-panel");
  els.workspaceList = document.getElementById("workspace-list");
  els.workspaceMeta = document.getElementById("workspace-meta");
  els.cloudPanel = document.getElementById("cloud-panel");
  els.cloudMeta = document.getElementById("cloud-meta");
  els.cloudList = document.getElementById("cloud-list");
  els.cloudConfig = document.getElementById("cloud-config");
  els.cloudToggleMeaning = document.getElementById("cloud-toggle-meaning");
  els.cloudSync = document.getElementById("cloud-sync");
  els.cloudImport = document.getElementById("cloud-import");
  els.cloudSaveWorkspace = document.getElementById("cloud-save-workspace");
  els.cloudClearWorkspace = document.getElementById("cloud-clear-workspace");
  els.cloudSaveMainWorkspace = document.getElementById("cloud-save-main-workspace");
  els.cloudDownload = document.getElementById("cloud-download");
  els.cloudDeleteNotebook = document.getElementById("cloud-delete-notebook");
  els.cloudSignout = document.getElementById("cloud-signout");
  els.cloudNotebookSelect = document.getElementById("cloud-notebook-select");
  els.cloudNotebookPicker = document.getElementById("cloud-notebook-picker");
  els.cloudFileInput = document.getElementById("cloud-file-input");
  els.panelBackdrop = document.getElementById("panel-backdrop");
  els.apiState = document.getElementById("api-state");
  els.apiSettings = document.getElementById("api-settings");
  els.apiDialog = document.getElementById("api-dialog");
  els.apiForm = document.getElementById("api-form");
  els.apiEndpoint = document.getElementById("api-endpoint");
  els.apiModel = document.getElementById("api-model");
  els.apiKey = document.getElementById("api-key");
  els.clearApi = document.getElementById("clear-api");
  els.closeApiDialog = document.getElementById("close-api-dialog");
  els.cloudDialog = document.getElementById("cloud-dialog");
  els.cloudForm = document.getElementById("cloud-form");
  els.cloudUrl = document.getElementById("cloud-url");
  els.cloudAnonKey = document.getElementById("cloud-anon-key");
  els.cloudEmail = document.getElementById("cloud-email");
  els.cloudPassword = document.getElementById("cloud-password");
  els.cloudSignup = document.getElementById("cloud-signup");
  els.clearCloudSettings = document.getElementById("clear-cloud-settings");
  els.closeCloudDialog = document.getElementById("close-cloud-dialog");
}

function bindEvents() {
  els.homeButton.addEventListener("click", () => switchPage("home"));
  els.openReadingWorkspace.addEventListener("click", openReadingWorkspace);

  els.homeMenuButtons.forEach((button) => {
    button.addEventListener("click", () => switchPage(button.dataset.page));
  });

  window.addEventListener("hashchange", () => {
    switchPage(pageFromHash(), { updateHash: false });
  });

  window.addEventListener("reading-route-change", (event) => {
    state.readingSubView = event.detail?.view || "selector";
    syncAppHeaderVisibility();
  });

  window.addEventListener("listening-route-change", (event) => {
    state.listeningSubView = event.detail?.view || "selector";
    syncAppHeaderVisibility();
  });

  window.addEventListener("scroll", handleScroll, { passive: true });
  els.scrollTop.addEventListener("click", scrollToTop);

  els.chapterSelect.addEventListener("change", (event) => {
    state.chapterIndex = Number(event.target.value);
    renderWords();
  });

  els.searchInput.addEventListener("input", (event) => {
    state.searchText = event.target.value.trim().toLowerCase();
    renderWords();
  });

  els.exportNotes.addEventListener("click", exportNotes);
  els.openWorkspace.addEventListener("click", openWorkspace);
  els.openCloudNotebook.addEventListener("click", openCloudNotebook);
  els.closeWorkspace.addEventListener("click", closeWorkspace);
  els.closeCloudNotebook.addEventListener("click", closeCloudNotebook);
  els.cloudList.addEventListener("scroll", handleCloudListScroll, { passive: true });
  els.panelBackdrop.addEventListener("click", closeSidePanels);
  els.clearWorkspace.addEventListener("click", clearWorkspace);
  els.toggleMeaning.addEventListener("click", toggleMeaningMode);
  els.apiSettings.addEventListener("click", () => openApiDialog());
  els.closeApiDialog.addEventListener("click", closeApiDialog);
  els.clearApi.addEventListener("click", clearApiSettings);
  els.cloudConfig.addEventListener("click", openCloudDialog);
  els.cloudToggleMeaning.addEventListener("click", toggleMeaningMode);
  els.cloudSync.addEventListener("click", () => syncCloudNotes());
  els.cloudImport.addEventListener("click", () => handleCloudImportClick());
  els.cloudSaveWorkspace.addEventListener("click", () => saveWorkspaceToCloud());
  els.cloudClearWorkspace.addEventListener("click", clearCloudWorkspace);
  els.cloudSaveMainWorkspace.addEventListener("click", () => saveMainWorkspaceToCloud());
  els.cloudDownload.addEventListener("click", downloadSelectedCloudNotebook);
  els.cloudDeleteNotebook.addEventListener("click", deleteSelectedCloudNotebook);
  els.cloudSignout.addEventListener("click", signOutCloud);
  els.cloudNotebookSelect.addEventListener("change", () => {
    state.cloud.selectedNotebook = els.cloudNotebookSelect.value;
    persistCloudCache();
    resetCloudToolsAutoHide();
    renderCloudNotebook();
  });
  els.cloudFileInput.addEventListener("change", importCloudFiles);
  els.closeCloudDialog.addEventListener("click", closeCloudDialog);
  els.clearCloudSettings.addEventListener("click", clearCloudSettings);
  els.cloudSignup.addEventListener("click", () => signUpCloud());

  els.apiForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveApiSettings();
  });

  els.cloudForm.addEventListener("submit", (event) => {
    event.preventDefault();
    signInCloud();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSidePanels();
      closeApiDialog();
      closeCloudDialog();
    }
  });
}

function pageFromHash() {
  if (window.location.hash === "#vocabulary") return "vocabulary";
  if (window.location.hash === "#reading") return "reading";
  if (window.location.hash === "#listening") return "listening";
  if (window.location.hash === "#writing") return "writing";
  return "home";
}

function switchPage(page, options = {}) {
  const nextPage = page === "vocabulary" || page === "reading" || page === "listening" || page === "writing" ? page : "home";
  const updateHash = options.updateHash !== false;
  const isHome = nextPage === "home";
  const previousPage = state.activePage;

  state.activePage = nextPage;
  document.body.classList.toggle("is-home", isHome);
  document.body.classList.toggle("is-reading", nextPage === "reading");
  document.body.classList.toggle("is-listening", nextPage === "listening");
  if (nextPage !== "reading") {
    state.readingSubView = "selector";
    window.readingApp?.hide?.();
  }
  if (nextPage !== "listening") {
    state.listeningSubView = "selector";
  }
  syncAppHeaderVisibility();
  els.homeView.hidden = !isHome;
  els.vocabularyView.hidden = nextPage !== "vocabulary";
  els.readingView.hidden = nextPage !== "reading";
  els.listeningView.hidden = nextPage !== "listening";
  els.writingView.hidden = nextPage !== "writing";
  els.vocabActions.classList.toggle("is-hidden", nextPage !== "vocabulary");
  els.openReadingWorkspace.hidden = nextPage !== "reading";
  document.title = PAGE_TITLES[nextPage];
  els.title.textContent = PAGE_TITLES[nextPage];
  els.subtitle.textContent = getPageSubtitle(nextPage);
  setHeaderHiddenByScroll(false);

  if (previousPage !== nextPage) {
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  if (isHome || nextPage !== "vocabulary") {
    closeSidePanels();
    closeApiDialog();
    closeCloudDialog();
  }

  if (nextPage === "reading" && window.readingApp) {
    window.readingApp.show();
  }
  if (nextPage === "listening" && window.listeningApp) {
    window.listeningApp.show();
  }
  if (nextPage === "writing" && window.writingApp) {
    window.writingApp.show();
  }

  if (updateHash) {
    const nextUrl = isHome
      ? `${window.location.pathname}${window.location.search}`
      : `#${nextPage}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }

  refreshIcons();
  updateScrollUi();
}

function syncAppHeaderVisibility() {
  const isHome = state.activePage === "home";
  const isReadingInnerPage = state.activePage === "reading" && state.readingSubView !== "selector";
  const isListeningInnerPage = state.activePage === "listening" && state.listeningSubView !== "selector";
  els.appHeader.hidden = isHome || isReadingInnerPage || isListeningInnerPage;
}

function openReadingWorkspace() {
  if (state.activePage !== "reading") return;
  if (window.readingApp?.openWorkspace) {
    window.readingApp.openWorkspace();
  }
}

function getPageSubtitle(page) {
  if (page === "vocabulary" && state.chapters.length) {
    return `${state.chapters.length} 个章节`;
  }
  return PAGE_COPY[page] || PAGE_COPY.vocabulary;
}

function handleScroll() {
  if (state.scrollTicking) return;

  state.scrollTicking = true;
  window.requestAnimationFrame(() => {
    updateScrollUi();
    state.scrollTicking = false;
  });
}

function updateScrollUi() {
  const scrollY = getScrollY();
  const pageHasScrollTools = state.activePage === "vocabulary" || state.activePage === "reading" || state.activePage === "listening" || state.activePage === "writing";
  const shouldShowScrollTop = pageHasScrollTools && scrollY > SCROLL_TOP_THRESHOLD;
  const delta = scrollY - state.lastScrollY;

  els.scrollTop.classList.toggle("is-visible", shouldShowScrollTop);
  els.scrollTop.setAttribute("aria-hidden", shouldShowScrollTop ? "false" : "true");
  els.scrollTop.tabIndex = shouldShowScrollTop ? 0 : -1;

  if (!pageHasScrollTools || scrollY <= HEADER_HIDE_THRESHOLD || delta < -HEADER_SCROLL_DELTA) {
    setHeaderHiddenByScroll(false);
  } else if (delta > HEADER_SCROLL_DELTA) {
    setHeaderHiddenByScroll(true);
  }

  state.lastScrollY = scrollY;
}

function getScrollY() {
  return Math.max(window.scrollY || document.documentElement.scrollTop || 0, 0);
}

function setHeaderHiddenByScroll(isHidden) {
  if (state.headerHiddenByScroll === isHidden) return;
  state.headerHiddenByScroll = isHidden;
  els.appHeader.classList.toggle("is-hidden-on-scroll", isHidden);
}

function scrollToTop() {
  setHeaderHiddenByScroll(false);
  window.scrollTo({ top: 0, behavior: "smooth" });
  updateScrollUi();
}

async function loadData() {
  try {
    const [vocabularyText, mnemonicsData] = await Promise.all([
      fetchText("./vocabulary.txt"),
      fetchJson("./mnemonics.json", {}),
    ]);

    Object.entries(mnemonicsData).forEach(([word, text]) => {
      state.mnemonics.set(normalizeWordKey(word), text);
    });

    state.chapters = parseVocabulary(vocabularyText);
    if (!state.chapters.length) {
      throw new Error("词表为空");
    }

    fillChapterSelect();
    renderWords();
    renderWorkspace();
    refreshIcons();
  } catch (error) {
    els.chapterTitle.textContent = "词表加载失败";
    els.chapterMeta.textContent = error.message || "请检查 vocabulary.txt";
    showToast("词表加载失败", true);
  }
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.text();
}

async function fetchJson(url, fallback) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return fallback;
    return response.json();
  } catch {
    return fallback;
  }
}

function parseVocabulary(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const chapters = [];
  let currentChapter = null;
  let currentGroup = [];

  const flushGroup = () => {
    if (currentChapter && currentGroup.length) {
      currentChapter.groups.push(currentGroup);
      currentGroup = [];
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line === "+++") {
      flushGroup();
      currentChapter = { name: findChapterName(lines, index, chapters.length), groups: [] };
      chapters.push(currentChapter);
      continue;
    }

    if (line === "---" || line === "===") {
      flushGroup();
      continue;
    }

    if (!currentChapter || !line.includes("|")) {
      continue;
    }

    const parts = line.split("|").map((part) => part.trim());
    const word = parts[0];
    if (!word) continue;

    currentGroup.push({
      word,
      pos: parts[1] || "",
      meaning: parts[2] || "",
      sentence: parts[3] || "",
      extra: parts.slice(4).filter(Boolean).join(" | "),
      mnemonic: state.mnemonics.get(normalizeWordKey(word)) || "",
    });
  }

  flushGroup();
  return chapters.filter((chapter) => chapter.groups.length);
}

function findChapterName(lines, markerIndex, fallbackIndex) {
  for (let index = markerIndex - 1; index >= 0; index -= 1) {
    const candidate = lines[index];
    if (candidate && candidate !== "---" && candidate !== "===" && !candidate.includes("|")) {
      return candidate;
    }
  }
  return `Chapter ${fallbackIndex + 1}`;
}

function fillChapterSelect() {
  els.chapterSelect.innerHTML = "";
  state.chapters.forEach((chapter, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = chapter.name;
    els.chapterSelect.append(option);
  });
}

function renderWords() {
  const query = state.searchText;
  const entries = query ? collectSearchEntries(query) : collectChapterEntries(state.chapterIndex);
  const chapter = state.chapters[state.chapterIndex];
  const totalWords = countWords(chapter);

  els.wordList.innerHTML = "";
  entries.forEach((entry) => {
    els.wordList.append(createWordCard(entry));
  });

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = query ? "没有匹配的单词" : "这个章节没有单词";
    els.wordList.append(empty);
  }

  els.chapterTitle.textContent = query ? "搜索结果" : chapter.name;
  els.chapterMeta.textContent = query
    ? `${entries.length} 个匹配结果`
    : `${chapter.groups.length} 个词群 · ${totalWords} 个单词`;
  els.subtitle.textContent = getPageSubtitle(state.activePage);
  refreshIcons();
}

function collectChapterEntries(chapterIndex) {
  const chapter = state.chapters[chapterIndex];
  const entries = [];
  let number = 1;

  chapter.groups.forEach((group, groupIndex) => {
    group.forEach((item, itemIndex) => {
      entries.push({
        item,
        number,
        chapterName: chapter.name,
        chapterIndex,
        groupIndex,
        itemIndex,
        color: GROUP_COLORS[groupIndex % GROUP_COLORS.length],
      });
      number += 1;
    });
  });

  return entries;
}

function collectSearchEntries(query) {
  const entries = [];
  state.chapters.forEach((chapter, chapterIndex) => {
    let number = 1;
    chapter.groups.forEach((group, groupIndex) => {
      group.forEach((item, itemIndex) => {
        const haystack = [item.word, item.pos, item.meaning, item.sentence, item.extra, item.mnemonic]
          .join(" ")
          .toLowerCase();
        if (haystack.includes(query)) {
          entries.push({
            item,
            number,
            chapterName: chapter.name,
            chapterIndex,
            groupIndex,
            itemIndex,
            color: GROUP_COLORS[groupIndex % GROUP_COLORS.length],
          });
        }
        number += 1;
      });
    });
  });
  return entries;
}

function createWordCard(entry) {
  const { item } = entry;
  const article = document.createElement("article");
  article.className = "word-card";
  article.style.setProperty("--group-color", entry.color);
  bindMeaningPeek(article);

  const groupRail = document.createElement("div");
  groupRail.className = "group-rail";
  article.append(groupRail);

  const content = document.createElement("div");
  content.className = "word-content";

  const top = document.createElement("div");
  top.className = "word-top";

  const identity = document.createElement("div");
  identity.className = "word-identity";

  const meta = document.createElement("div");
  meta.className = "word-meta";
  meta.textContent = `#${entry.number} · ${entry.chapterName}`;

  const wordLine = document.createElement("div");
  wordLine.className = "word-line";

  const wordTitle = document.createElement("h3");
  wordTitle.className = "word-title";
  wordTitle.textContent = item.word;

  const pos = document.createElement("span");
  pos.className = "pos";
  pos.textContent = item.pos || " ";

  wordLine.append(wordTitle, pos);
  identity.append(meta, wordLine);

  const speakButton = createIconButton("volume-2", "播放发音", "speak-button", () => speakWord(item.word));
  top.append(identity, speakButton);

  const meaning = document.createElement("p");
  meaning.className = "meaning";
  meaning.textContent = item.meaning;

  const sentence = document.createElement("p");
  sentence.className = "sentence";
  sentence.textContent = item.sentence;

  content.append(top, meaning, sentence);

  if (item.extra) {
    const extra = document.createElement("p");
    extra.className = "extra";
    extra.textContent = item.extra;
    content.append(extra);
  }

  const actions = document.createElement("div");
  actions.className = "actions";

  actions.append(
    createActionButton("bookmark-plus", "A类", "note-a", () => addNote(item, "A", entry.chapterName)),
    createActionButton("bookmark", "B类", "note-b", () => addNote(item, "B", entry.chapterName)),
    createActionButton("lightbulb", "助记", "mnemonic", () => handleMnemonic(item, mnemonicBox, mnemonicButton)),
    createActionButton("keyboard", "默写", "dictation", () => startDictation(article, item.word)),
  );

  const mnemonicButton = actions.querySelector(".mnemonic");
  const mnemonicBox = document.createElement("div");
  mnemonicBox.className = `mnemonic-box${item.mnemonic ? " is-visible" : ""}`;
  mnemonicBox.textContent = item.mnemonic;

  content.append(actions, mnemonicBox);
  article.append(content);
  return article;
}

function createActionButton(iconName, label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `action-button ${className}`;
  button.addEventListener("click", onClick);
  button.append(createIcon(iconName), createSpan(label));
  return button;
}

function createIconButton(iconName, label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-button ${className || ""}`;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.addEventListener("click", onClick);
  button.append(createIcon(iconName));
  return button;
}

function createIcon(iconName) {
  const icon = document.createElement("i");
  icon.setAttribute("data-lucide", iconName);
  return icon;
}

function createSpan(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function toggleMeaningMode() {
  state.meaningHidden = !state.meaningHidden;
  updateMeaningModeUi();
  showToast(state.meaningHidden ? "已隐藏中文意思" : "已显示中文意思");
}

function updateMeaningModeUi() {
  document.body.classList.toggle("is-meaning-hidden", state.meaningHidden);
  syncMeaningToggleButton(els.toggleMeaning);
  syncMeaningToggleButton(els.cloudToggleMeaning, true);
}

function syncMeaningToggleButton(button) {
  if (!button) return;
  const label = state.meaningHidden ? "显示中文意思" : "隐藏中文意思";
  button.classList.toggle("is-active", state.meaningHidden);
  button.setAttribute("aria-pressed", state.meaningHidden ? "true" : "false");
  button.setAttribute("aria-label", label);
  button.title = label;

  const text = button.querySelector("span:last-child");
  if (text) text.textContent = state.meaningHidden ? "显示中文" : "隐藏中文";
}

function bindMeaningPeek(element) {
  let peekTimer = null;

  const clearPeek = () => {
    window.clearTimeout(peekTimer);
    peekTimer = null;
    element.classList.remove("is-meaning-peek");
  };

  element.addEventListener("pointerdown", (event) => {
    if (!state.meaningHidden || event.button > 0) return;
    if (event.target?.closest?.("button, input, select, textarea, a")) return;
    window.clearTimeout(peekTimer);
    peekTimer = window.setTimeout(() => {
      element.classList.add("is-meaning-peek");
    }, MEANING_PEEK_DELAY_MS);
  });

  element.addEventListener("pointerup", clearPeek);
  element.addEventListener("pointercancel", clearPeek);
  element.addEventListener("pointerleave", clearPeek);
  element.addEventListener("lostpointercapture", clearPeek);
  element.addEventListener("contextmenu", (event) => {
    if (state.meaningHidden) event.preventDefault();
  });
}

function addNote(item, type, chapterName) {
  const wordKey = normalizeWordKey(item.word);
  const existingNote = state.notes.find((note) => note.key === wordKey);
  if (existingNote) {
    showToast(`${item.word} 已在 ${existingNote.type}类本，未重复添加`, true);
    return;
  }

  state.notes.push({
    key: wordKey,
    type,
    word: item.word,
    pos: item.pos,
    meaning: item.meaning,
    sentence: item.sentence,
    mnemonic: getMnemonicForWord(item.word),
    chapterName,
    time: new Date(),
  });

  persistWorkspace();
  renderWorkspace();
  showToast(`已加入 ${type} 类本：${item.word}`);
}

function renderWorkspace() {
  els.noteCount.textContent = String(state.notes.length);
  els.workspaceMeta.textContent = `本次访问 ${state.notes.length} 条`;
  els.workspaceList.innerHTML = "";
  els.exportNotes.disabled = state.notes.length === 0;
  syncCloudMainWorkspaceUi();

  if (!state.notes.length) {
    const empty = document.createElement("li");
    empty.className = "workspace-empty";
    empty.textContent = "工作区为空";
    els.workspaceList.append(empty);
    return;
  }

  state.notes.slice().reverse().forEach((note) => {
    const item = document.createElement("li");
    item.className = `workspace-item type-${note.type.toLowerCase()}`;

    const copy = document.createElement("div");
    copy.className = "workspace-copy";

    const title = document.createElement("strong");
    title.textContent = `${note.type}类 · ${note.word}`;

    const meaning = document.createElement("span");
    meaning.textContent = note.meaning;

    const chapter = document.createElement("small");
    chapter.textContent = note.chapterName;

    const removeButton = createIconButton("x", `从工作区删除 ${note.word}`, "workspace-remove", () => {
      removeNote(note.key);
    });

    copy.append(title, meaning, chapter);
    item.append(copy, removeButton);
    els.workspaceList.append(item);
  });

  refreshIcons();
}

function exportNotes() {
  if (!state.notes.length) {
    showToast("工作区为空", true);
    return;
  }

  const datePart = formatDateForNoteTitle(new Date());
  const markdown = buildNotesMarkdown(datePart);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `词汇笔记${datePart}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
  showToast("笔记已导出");
}

function buildNotesMarkdown(datePart) {
  const groups = {
    A: state.notes.filter((note) => note.type === "A"),
    B: state.notes.filter((note) => note.type === "B"),
  };

  const lines = [`# 词汇笔记${datePart}`, ""];

  ["A", "B"].forEach((type) => {
    lines.push(`## ${type}类本`, "");
    if (!groups[type].length) {
      lines.push("无", "");
      return;
    }

    groups[type].forEach((note) => {
      lines.push(
        [
          cleanNoteField(note.word),
          cleanNoteField(note.pos),
          cleanNoteField(note.meaning),
          cleanNoteField(note.sentence),
          cleanNoteField(getMnemonicForWord(note.word) || note.mnemonic),
        ].join(" ｜"),
      );
    });
    lines.push("");
  });

  return `${lines.join("\n").trim()}\n`;
}

function clearWorkspace() {
  if (!state.notes.length) {
    showToast("工作区已经为空");
    return;
  }
  state.notes = [];
  clearPersistedWorkspace();
  renderWorkspace();
  showToast("工作区已清空");
}

function removeNote(noteKey) {
  const note = state.notes.find((item) => item.key === noteKey);
  state.notes = state.notes.filter((item) => item.key !== noteKey);
  persistWorkspace();
  renderWorkspace();
  showToast(note ? `已移除 ${note.word}` : "已移除");
}

function loadWorkspace() {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return;

    state.notes = saved
      .filter((note) => note && typeof note.word === "string" && typeof note.type === "string")
      .map((note) => ({
        key: normalizeWordKey(note.word),
        type: note.type === "B" ? "B" : "A",
        word: note.word,
        pos: note.pos || "",
        meaning: note.meaning || "",
        sentence: note.sentence || "",
        mnemonic: note.mnemonic || "",
        chapterName: note.chapterName || "",
        time: note.time ? new Date(note.time) : new Date(),
      }));
  } catch {
    clearPersistedWorkspace();
  }
}

function persistWorkspace() {
  try {
    localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify(
        state.notes.map((note) => ({
          key: note.key,
          type: note.type,
          word: note.word,
          pos: note.pos,
          meaning: note.meaning,
          sentence: note.sentence,
          mnemonic: getMnemonicForWord(note.word) || note.mnemonic,
          chapterName: note.chapterName,
          time: note.time instanceof Date ? note.time.toISOString() : note.time,
        })),
      ),
    );
  } catch {
    showToast("浏览器无法保存工作区", true);
  }
}

function clearPersistedWorkspace() {
  try {
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

function getMnemonicForWord(word) {
  return state.mnemonics.get(normalizeWordKey(word)) || "";
}

function cleanNoteField(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function openWorkspace() {
  closeCloudNotebook();
  els.workspacePanel.classList.add("is-open");
  els.workspacePanel.setAttribute("aria-hidden", "false");
  syncPanelBackdrop();
}

function closeWorkspace() {
  els.workspacePanel.classList.remove("is-open");
  els.workspacePanel.setAttribute("aria-hidden", "true");
  syncPanelBackdrop();
}

function openCloudNotebook() {
  closeWorkspace();
  els.cloudPanel.classList.add("is-open");
  els.cloudPanel.setAttribute("aria-hidden", "false");
  resetCloudToolsAutoHide();
  syncPanelBackdrop();
  renderCloudNotebook();
}

function closeCloudNotebook() {
  els.cloudPanel.classList.remove("is-open");
  els.cloudPanel.setAttribute("aria-hidden", "true");
  resetCloudToolsAutoHide();
  syncPanelBackdrop();
}

function closeSidePanels() {
  els.workspacePanel.classList.remove("is-open");
  els.workspacePanel.setAttribute("aria-hidden", "true");
  els.cloudPanel.classList.remove("is-open");
  els.cloudPanel.setAttribute("aria-hidden", "true");
  resetCloudToolsAutoHide();
  syncPanelBackdrop();
}

function syncPanelBackdrop() {
  const hasOpenPanel = els.workspacePanel.classList.contains("is-open") || els.cloudPanel.classList.contains("is-open");
  els.panelBackdrop.hidden = !hasOpenPanel;
}

function handleCloudListScroll() {
  const now = Date.now();
  const scrollTop = Math.max(els.cloudList.scrollTop || 0, 0);
  const delta = scrollTop - state.cloud.lastScrollTop;

  if (!state.cloud.selectedNotebook) {
    setCloudToolsHidden(false);
    state.cloud.lastScrollTop = scrollTop;
    return;
  }

  if (now < state.cloud.toolsToggleLockedUntil) {
    state.cloud.lastScrollTop = scrollTop;
    return;
  }

  if (state.cloud.toolsHidden) {
    if (delta < -CLOUD_TOOLS_SCROLL_DELTA) {
      setCloudToolsHidden(false);
    }
  } else if (scrollTop > CLOUD_TOOLS_HIDE_THRESHOLD && delta > CLOUD_TOOLS_SCROLL_DELTA) {
    setCloudToolsHidden(true);
  }

  state.cloud.lastScrollTop = scrollTop;
}

function setCloudToolsHidden(isHidden) {
  if (state.cloud.toolsHidden === isHidden) return;
  state.cloud.toolsHidden = isHidden;
  state.cloud.toolsToggleLockedUntil = Date.now() + CLOUD_TOOLS_TOGGLE_LOCK_MS;
  els.cloudPanel.classList.toggle("is-cloud-tools-hidden", isHidden);
}

function resetCloudToolsAutoHide() {
  state.cloud.lastScrollTop = 0;
  state.cloud.toolsToggleLockedUntil = 0;
  setCloudToolsHidden(false);
  if (els.cloudList) {
    els.cloudList.scrollTop = 0;
  }
}

function renderCloudNotebook() {
  resetCloudToolsAutoHide();
  const hasSettings = canUseCloud();
  const signedIn = Boolean(state.cloud.session?.access_token);
  const email = state.cloud.session?.user?.email || state.cloud.email;
  const totalCount = state.cloud.notes.length;
  const notebooks = getCloudNotebooks();
  const selectedExists = notebooks.some((notebook) => notebook.title === state.cloud.selectedNotebook);
  if (!selectedExists) {
    state.cloud.selectedNotebook = "";
  }
  const selectedNotes = state.cloud.selectedNotebook ? getCloudNotesForNotebook(state.cloud.selectedNotebook) : [];
  const selectedCount = selectedNotes.length;

  syncCloudNoteBadge(selectedCount);
  syncCloudWorkspaceUi();
  syncCloudMainWorkspaceUi();
  els.cloudMeta.textContent = signedIn
    ? `${email || "已登录"} · ${notebooks.length} 本 · ${totalCount} 条`
    : hasSettings
      ? "已配置，未登录"
      : "未连接 Supabase";

  els.cloudSync.disabled = state.cloud.busy || !hasSettings || !signedIn;
  els.cloudImport.disabled = state.cloud.busy || !hasSettings || !signedIn;
  els.cloudSaveWorkspace.disabled = state.cloud.busy || !hasSettings || !signedIn || state.cloud.workspace.length === 0;
  els.cloudClearWorkspace.disabled = state.cloud.busy || state.cloud.workspace.length === 0;
  els.cloudSaveMainWorkspace.disabled = state.cloud.busy || !hasSettings || !signedIn || state.notes.length === 0;
  els.cloudDownload.disabled = state.cloud.busy || !state.cloud.selectedNotebook;
  els.cloudDeleteNotebook.disabled = state.cloud.busy || !state.cloud.selectedNotebook;
  els.cloudSignout.disabled = state.cloud.busy || !signedIn;
  renderCloudNotebookPicker(notebooks);

  els.cloudList.innerHTML = "";
  const empty = document.createElement("li");
  empty.className = "workspace-empty";

  if (state.cloud.busy) {
    empty.textContent = "正在处理云端笔记本";
    els.cloudList.append(empty);
    refreshIcons();
    return;
  }

  if (!hasSettings) {
    empty.textContent = "先配置 Supabase Project URL 和 anon key";
    els.cloudList.append(empty);
    refreshIcons();
    return;
  }

  if (!signedIn) {
    empty.textContent = "登录后可以同步、导入 Markdown 笔记";
    els.cloudList.append(empty);
    refreshIcons();
    return;
  }

  if (!state.cloud.loaded) {
    empty.textContent = "点击同步读取云端笔记本，或直接导入 Markdown 笔记生成新整理";
    els.cloudList.append(empty);
    refreshIcons();
    return;
  }

  if (!totalCount) {
    empty.textContent = "云端笔记本为空";
    els.cloudList.append(empty);
    refreshIcons();
    return;
  }

  if (!state.cloud.selectedNotebook) {
    notebooks.forEach((notebook) => {
      els.cloudList.append(createCloudNotebookItem(notebook));
    });
    refreshIcons();
    return;
  }

  renderCloudNoteGroup("A", selectedNotes);
  renderCloudNoteGroup("B", selectedNotes);
  refreshIcons();
}

function syncCloudNoteBadge(count) {
  const hasSelectedNotebook = Boolean(state.cloud.selectedNotebook);
  if (els.cloudNoteCount) {
    els.cloudNoteCount.hidden = !hasSelectedNotebook;
    els.cloudNoteCount.textContent = hasSelectedNotebook ? String(count) : "";
  }
  if (els.openCloudNotebook) {
    const label = hasSelectedNotebook ? `笔记本，当前选中 ${count} 条` : "笔记本";
    els.openCloudNotebook.setAttribute("aria-label", label);
    els.openCloudNotebook.title = label;
  }
}

function renderCloudNotebookPicker(notebooks) {
  els.cloudNotebookPicker.hidden = !state.cloud.loaded || notebooks.length === 0;
  if (els.cloudNotebookPicker.hidden) {
    els.cloudNotebookSelect.innerHTML = "";
    return;
  }

  els.cloudNotebookSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "选择笔记本";
  els.cloudNotebookSelect.append(placeholder);

  notebooks.forEach((notebook) => {
    const option = document.createElement("option");
    option.value = notebook.title;
    option.textContent = `${notebook.title}（${notebook.count}）`;
    els.cloudNotebookSelect.append(option);
  });
  els.cloudNotebookSelect.value = state.cloud.selectedNotebook;
}

function createCloudNotebookItem(notebook) {
  const item = document.createElement("li");
  item.className = "workspace-item cloud-notebook-item";

  const copy = document.createElement("div");
  copy.className = "workspace-copy";

  const title = document.createElement("strong");
  title.textContent = notebook.title;

  const summary = document.createElement("span");
  summary.textContent = `${notebook.count} 条 · A类 ${notebook.typeCounts.A} · B类 ${notebook.typeCounts.B}`;

  const updated = document.createElement("small");
  updated.textContent = notebook.updatedAt ? `更新于 ${formatCloudDateTime(notebook.updatedAt)}` : "未记录更新时间";

  const openButton = createIconButton("chevron-right", `打开 ${notebook.title}`, "cloud-open-notebook", () => {
    state.cloud.selectedNotebook = notebook.title;
    persistCloudCache();
    renderCloudNotebook();
  });

  copy.append(title, summary, updated);
  item.append(copy, openButton);
  return item;
}

function renderCloudNoteGroup(type, notes) {
  const groupNotes = notes
    .filter((note) => (note.note_type === "B" ? "B" : "A") === type)
    .sort(compareCloudNotesByOrder);

  const header = document.createElement("li");
  header.className = "cloud-section-title";
  header.textContent = `${type}类本 · ${groupNotes.length}`;
  els.cloudList.append(header);

  if (!groupNotes.length) {
    const empty = document.createElement("li");
    empty.className = "workspace-empty";
    empty.textContent = "无";
    els.cloudList.append(empty);
    return;
  }

  groupNotes.forEach((note) => {
    els.cloudList.append(createCloudNoteItem(note));
  });
}

function createCloudNoteItem(note) {
  const item = document.createElement("li");
  const type = note.note_type === "B" ? "B" : "A";
  item.className = `workspace-item cloud-note-item type-${type.toLowerCase()}`;
  bindMeaningPeek(item);

  const copy = document.createElement("div");
  copy.className = "workspace-copy";

  const title = document.createElement("strong");
  title.textContent = `${type}类 · ${note.word || note.word_key}`;

  const meaning = document.createElement("span");
  meaning.className = "cloud-note-meaning";
  meaning.textContent = note.meaning || note.sentence || "无释义";

  const meta = document.createElement("small");
  meta.textContent = cleanNoteField(note.sentence) || "暂无例句";

  const addButton = createCloudWorkspaceButton(note);
  const removeButton = createIconButton("trash-2", `从云端笔记本删除 ${note.word}`, "workspace-remove", () => {
    deleteCloudNote(note);
  });
  const actions = document.createElement("div");
  actions.className = "cloud-note-actions";
  actions.append(addButton, removeButton);

  copy.append(title, meaning, meta);
  item.append(copy, actions);
  return item;
}

function createCloudWorkspaceButton(note) {
  const button = createIconButton("plus", `加入云端工作区 ${note.word || note.word_key}`, "cloud-workspace-add", () => {
    toggleCloudWorkspaceNote(note, button);
  });
  syncCloudWorkspaceActionButton(button, note, { refresh: false });
  return button;
}

function toggleCloudWorkspaceNote(note, button) {
  const key = getCloudNoteWorkspaceKey(note);
  const existingIndex = state.cloud.workspace.findIndex((item) => item.key === key);
  const wasAdded = existingIndex >= 0;

  if (wasAdded) {
    state.cloud.workspace.splice(existingIndex, 1);
    showToast("已从云端工作区移除");
  } else {
    state.cloud.workspace.push(cloudNoteToWorkspaceEntry(note));
    showToast("已加入云端工作区");
  }

  syncCloudWorkspaceUi();
  persistCloudCache();
  syncCloudWorkspaceActionButton(button, note);
}

function syncCloudWorkspaceActionButton(button, note, options = {}) {
  const isAdded = isCloudNoteInWorkspace(note);
  const word = note.word || note.word_key || "词条";
  button.classList.toggle("is-added", isAdded);
  button.setAttribute("aria-label", isAdded ? `从云端工作区移除 ${word}` : `加入云端工作区 ${word}`);
  button.title = isAdded ? "已加入工作区，点击移除" : "加入云端工作区";
  button.innerHTML = "";
  button.append(createIcon(isAdded ? "check" : "plus"));
  if (options.refresh !== false) refreshIcons();
}

function syncCloudWorkspaceUi() {
  const count = state.cloud.workspace.length;
  if (els.cloudWorkspaceCount) {
    els.cloudWorkspaceCount.hidden = count === 0;
    els.cloudWorkspaceCount.textContent = count ? String(count) : "";
  }
  if (els.cloudSaveWorkspace) {
    const label = count ? `上传专属区，当前 ${count} 个词` : "上传专属区";
    els.cloudSaveWorkspace.setAttribute("aria-label", label);
    els.cloudSaveWorkspace.title = label;
    els.cloudSaveWorkspace.disabled =
      state.cloud.busy || !canUseCloud() || !state.cloud.session?.access_token || count === 0;
  }
  if (els.cloudClearWorkspace) {
    const label = count ? `清除专属区，当前 ${count} 个词` : "清除专属区";
    els.cloudClearWorkspace.setAttribute("aria-label", label);
    els.cloudClearWorkspace.title = label;
    els.cloudClearWorkspace.disabled = state.cloud.busy || count === 0;
  }
}

function clearCloudWorkspace() {
  if (!state.cloud.workspace.length) return;
  state.cloud.workspace = [];
  syncCloudWorkspaceUi();
  persistCloudCache();
  renderCloudNotebook();
  showToast("已清除专属区");
}

function syncCloudMainWorkspaceUi() {
  const count = state.notes.length;
  if (els.cloudMainWorkspaceCount) {
    els.cloudMainWorkspaceCount.hidden = count === 0;
    els.cloudMainWorkspaceCount.textContent = count ? String(count) : "";
  }
  if (els.cloudSaveMainWorkspace) {
    const label = count ? `上传外层区，当前 ${count} 个词` : "上传外层区";
    els.cloudSaveMainWorkspace.setAttribute("aria-label", label);
    els.cloudSaveMainWorkspace.title = label;
    els.cloudSaveMainWorkspace.disabled =
      state.cloud.busy || !canUseCloud() || !state.cloud.session?.access_token || count === 0;
  }
}

function isCloudNoteInWorkspace(note) {
  const key = getCloudNoteWorkspaceKey(note);
  return state.cloud.workspace.some((item) => item.key === key);
}

function getCloudNoteWorkspaceKey(note) {
  return normalizeWordKey(note.word_key || note.word || "");
}

function cloudNoteToWorkspaceEntry(note) {
  return {
    key: getCloudNoteWorkspaceKey(note),
    type: note.note_type === "B" ? "B" : "A",
    word: note.word || note.word_key || "",
    pos: note.pos || "",
    meaning: note.meaning || "",
    sentence: note.sentence || "",
    mnemonic: note.mnemonic || "",
    chapterName: note.chapter_name || "",
    sourceFile: getCloudNotebookTitle(note),
  };
}

function openCloudDialog() {
  els.cloudUrl.value = state.cloud.url;
  els.cloudAnonKey.value = state.cloud.anonKey;
  els.cloudEmail.value = state.cloud.session?.user?.email || state.cloud.email;
  els.cloudPassword.value = "";
  if (typeof els.cloudDialog.showModal === "function") {
    els.cloudDialog.showModal();
  } else {
    els.cloudDialog.setAttribute("open", "");
  }
}

function closeCloudDialog() {
  if (els.cloudDialog.open) {
    els.cloudDialog.close();
  }
}

function saveCloudSettingsFromForm() {
  state.cloud.url = normalizeCloudUrl(els.cloudUrl.value);
  state.cloud.anonKey = els.cloudAnonKey.value.trim();
  state.cloud.email = els.cloudEmail.value.trim();
  persistCloudSettings();
}

async function signInCloud() {
  if (!els.cloudForm.reportValidity()) return;

  saveCloudSettingsFromForm();
  setCloudBusy(true);
  try {
    const data = await cloudAuthRequest("/auth/v1/token?grant_type=password", {
      email: state.cloud.email,
      password: els.cloudPassword.value,
    });
    saveCloudSession(data);
    els.cloudPassword.value = "";
    closeCloudDialog();
    showToast("云端笔记本已登录");
    await fetchCloudNotes();
  } catch (error) {
    showToast(error.message || "登录失败", true);
  } finally {
    setCloudBusy(false);
  }
}

async function signUpCloud() {
  if (!els.cloudForm.reportValidity()) return;

  saveCloudSettingsFromForm();
  setCloudBusy(true);
  try {
    const data = await cloudAuthRequest("/auth/v1/signup", {
      email: state.cloud.email,
      password: els.cloudPassword.value,
    });
    if (data?.session?.access_token || data?.access_token) {
      saveCloudSession(data.session || data);
      els.cloudPassword.value = "";
      closeCloudDialog();
      showToast("注册并登录成功");
      await fetchCloudNotes();
    } else {
      showToast("注册成功，请先完成邮箱确认再登录");
    }
  } catch (error) {
    showToast(error.message || "注册失败", true);
  } finally {
    setCloudBusy(false);
  }
}

async function signOutCloud() {
  if (state.cloud.session?.access_token && canUseCloud()) {
    try {
      await fetch(`${state.cloud.url}/auth/v1/logout`, {
        method: "POST",
        headers: buildCloudHeaders(state.cloud.session),
      });
    } catch {
      // Local session cleanup is enough for this static app.
    }
  }

  clearCloudSession();
  clearCloudCache();
  state.cloud.notes = [];
  state.cloud.workspace = [];
  state.cloud.selectedNotebook = "";
  state.cloud.loaded = false;
  closeCloudDialog();
  renderCloudNotebook();
  showToast("已退出云端笔记本");
}

function clearCloudSettings() {
  state.cloud = {
    ...state.cloud,
    url: "",
    anonKey: "",
    email: "",
    session: null,
    notes: [],
    workspace: [],
    selectedNotebook: "",
    loaded: false,
    busy: false,
  };
  clearCloudSession();
  clearCloudCache();
  localStorage.removeItem(CLOUD_SETTINGS_STORAGE_KEY);
  els.cloudUrl.value = "";
  els.cloudAnonKey.value = "";
  els.cloudEmail.value = "";
  els.cloudPassword.value = "";
  renderCloudNotebook();
  showToast("云端配置已清除");
}

function handleCloudImportClick() {
  if (!canUseCloud()) {
    openCloudDialog();
    showToast("请先配置 Supabase", true);
    return;
  }
  if (!state.cloud.session?.access_token) {
    openCloudDialog();
    showToast("请先登录云端笔记本", true);
    return;
  }
  els.cloudFileInput.click();
}

async function importCloudFiles(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (!files.length) return;

  setCloudBusy(true);
  try {
    await requireCloudSession();
    const imported = [];
    const notebookTitle = formatCloudNotebookTitle(new Date());
    const sortedFiles = files.slice().sort(compareCloudImportFiles);
    let sortOrder = 1;
    for (const file of sortedFiles) {
      const text = await file.text();
      const fileNotes = parseNotesMarkdown(text, file.name, notebookTitle);
      fileNotes.forEach((note) => {
        note.sortOrder = sortOrder;
        sortOrder += 1;
      });
      imported.push(...fileNotes);
    }

    const notes = dedupeCloudNotes(imported);
    if (!notes.length) {
      showToast("没有解析到可导入的笔记", true);
      return;
    }

    await upsertCloudNotes(notes);
    state.cloud.selectedNotebook = notebookTitle;
    await fetchCloudNotes();
    showToast(`已生成 ${notebookTitle}`);
  } catch (error) {
    showToast(error.message || "导入失败", true);
  } finally {
    setCloudBusy(false);
  }
}

async function saveWorkspaceToCloud() {
  if (!state.cloud.workspace.length) {
    showToast("专属区为空", true);
    return;
  }

  await saveEntriesToCloud(state.cloud.workspace, {
    sourceFile: "云端专属区",
    clearCloudWorkspace: true,
    errorMessage: "上传专属区失败",
  });
}

async function saveMainWorkspaceToCloud() {
  if (!state.notes.length) {
    showToast("外层工作区为空", true);
    return;
  }

  await saveEntriesToCloud(state.notes, {
    sourceFile: "外层工作区",
    errorMessage: "上传外层区失败",
  });
}

async function saveEntriesToCloud(entries, options = {}) {
  setCloudBusy(true);
  try {
    await requireCloudSession();
    const sourceLabel = formatCloudNotebookTitle(new Date());
    const notes = entries.map((note, index) => ({
      key: note.key || normalizeWordKey(note.word),
      type: note.type === "B" ? "B" : "A",
      word: note.word,
      pos: note.pos || "",
      meaning: note.meaning || "",
      sentence: note.sentence || "",
      mnemonic: note.mnemonic || getMnemonicForWord(note.word) || "",
      chapterName: note.chapterName || "",
      sourceFile: options.sourceFile || "工作区",
      sourceLabel,
      sortOrder: index + 1,
    }));

    await upsertCloudNotes(notes);
    if (options.clearCloudWorkspace) {
      state.cloud.workspace = [];
    }
    state.cloud.selectedNotebook = sourceLabel;
    persistCloudCache();
    await fetchCloudNotes();
    showToast(`已生成 ${sourceLabel}`);
  } catch (error) {
    showToast(error.message || options.errorMessage || "上传失败", true);
  } finally {
    setCloudBusy(false);
  }
}

async function syncCloudNotes(options = {}) {
  const showSuccess = options.showSuccess !== false;
  setCloudBusy(true);
  try {
    await requireCloudSession();
    await fetchCloudNotes();
    if (showSuccess) showToast("云端笔记本已同步");
  } catch (error) {
    showToast(error.message || "同步失败", true);
  } finally {
    setCloudBusy(false);
  }
}

async function fetchCloudNotes() {
  const columns = [
    "id",
    "user_id",
    "word_key",
    "note_type",
    "word",
    "pos",
    "meaning",
    "sentence",
    "mnemonic",
    "chapter_name",
    "sort_order",
    "source_file",
    "source_label",
    "created_at",
    "updated_at",
  ].join(",");
  const notes = [];
  let offset = 0;

  while (true) {
    const data = await cloudRestRequest(
      `/rest/v1/${CLOUD_TABLE_NAME}?select=${columns}&order=source_label.asc,sort_order.asc,id.asc&limit=${CLOUD_FETCH_PAGE_SIZE}&offset=${offset}`,
    );
    const batch = Array.isArray(data) ? data : [];
    notes.push(...batch);
    if (batch.length < CLOUD_FETCH_PAGE_SIZE) break;
    offset += batch.length;
  }

  state.cloud.notes = notes;
  state.cloud.loaded = true;
  persistCloudCache();
  renderCloudNotebook();
}

async function upsertCloudNotes(notes) {
  const session = await requireCloudSession();
  const now = new Date().toISOString();
  const payload = notes.map((note) => ({
    user_id: session.user.id,
    word_key: note.key || normalizeWordKey(note.word),
    note_type: note.type === "B" ? "B" : "A",
    word: note.word,
    pos: note.pos || "",
    meaning: note.meaning || "",
    sentence: note.sentence || "",
    mnemonic: note.mnemonic || "",
    chapter_name: note.chapterName || "",
    sort_order: Number.isFinite(Number(note.sortOrder)) ? Number(note.sortOrder) : 0,
    source_file: note.sourceFile || "",
    source_label: note.sourceLabel || formatCloudNotebookTitle(new Date()),
    updated_at: now,
  }));

  for (const batch of chunkArray(payload, 200)) {
    await cloudRestRequest(`/rest/v1/${CLOUD_TABLE_NAME}?on_conflict=user_id,source_label,word_key`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(batch),
    });
  }
}

async function deleteCloudNote(note) {
  if (!note?.id) return;
  const confirmed = window.confirm(`从云端笔记本删除 ${note.word || note.word_key}？`);
  if (!confirmed) return;

  setCloudBusy(true);
  try {
    await requireCloudSession();
    await cloudRestRequest(`/rest/v1/${CLOUD_TABLE_NAME}?id=eq.${encodeURIComponent(note.id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    state.cloud.notes = state.cloud.notes.filter((item) => item.id !== note.id);
    persistCloudCache();
    renderCloudNotebook();
    showToast("已从云端删除");
  } catch (error) {
    showToast(error.message || "删除失败", true);
  } finally {
    setCloudBusy(false);
  }
}

function downloadSelectedCloudNotebook() {
  if (!state.cloud.selectedNotebook) {
    showToast("请先选择笔记本", true);
    return;
  }

  const notes = getCloudNotesForNotebook(state.cloud.selectedNotebook);
  if (!notes.length) {
    showToast("当前笔记本为空", true);
    return;
  }

  const markdown = buildCloudNotebookMarkdown(state.cloud.selectedNotebook, notes);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFileName(state.cloud.selectedNotebook)}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
  showToast("笔记本已下载");
}

async function deleteSelectedCloudNotebook() {
  const notebookTitle = state.cloud.selectedNotebook;
  if (!notebookTitle) {
    showToast("请先选择笔记本", true);
    return;
  }

  const notes = getCloudNotesForNotebook(notebookTitle);
  const confirmed = window.confirm(`删除「${notebookTitle}」及其中 ${notes.length} 条词汇笔记？此操作会从云端删除。`);
  if (!confirmed) return;

  setCloudBusy(true);
  try {
    await requireCloudSession();
    await cloudRestRequest(`/rest/v1/${CLOUD_TABLE_NAME}?source_label=eq.${encodeURIComponent(notebookTitle)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    state.cloud.selectedNotebook = "";
    await fetchCloudNotes();
    showToast("笔记本已删除");
  } catch (error) {
    showToast(error.message || "删除笔记本失败", true);
  } finally {
    setCloudBusy(false);
  }
}

function parseNotesMarkdown(text, fileName, targetNotebookTitle = "") {
  const lines = String(text || "").split(/\r?\n/);
  let currentType = "";
  let sourceLabel = targetNotebookTitle || fileName;
  const notes = [];

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const titleMatch = line.match(/^#\s+(.+)$/);
    if (titleMatch) {
      if (!targetNotebookTitle) {
        sourceLabel = titleMatch[1].trim() || fileName;
      }
      return;
    }

    const typeMatch = line.match(/^##\s*([AB])类本/);
    if (typeMatch) {
      currentType = typeMatch[1];
      return;
    }

    if (!currentType || line.startsWith("#") || line === "无") return;

    const normalizedLine = line.replace(/^[-*]\s+/, "");
    const parts = normalizedLine.split(/[｜|]/).map(cleanNoteField);
    const word = parts[0] || "";
    if (!word) return;

    notes.push({
      key: normalizeWordKey(word),
      type: currentType,
      word,
      pos: parts[1] || "",
      meaning: parts[2] || "",
      sentence: parts[3] || "",
      mnemonic: parts.slice(4).filter(Boolean).join(" ｜ "),
      chapterName: "",
      sourceFile: fileName,
      sourceLabel: sourceLabel || formatCloudNotebookTitle(new Date()),
    });
  });

  return notes;
}

function dedupeCloudNotes(notes) {
  const map = new Map();
  notes.forEach((note) => {
    if (!note.key || !note.word) return;
    const notebookTitle = note.sourceLabel || formatCloudNotebookTitle(new Date());
    const mapKey = `${notebookTitle}\n${note.key}`;
    const existing = map.get(mapKey) || {};
    const nextValues = Object.fromEntries(
      Object.entries(note).filter(([, value]) => value !== "" && value !== null && value !== undefined),
    );
    map.set(mapKey, {
      ...existing,
      sourceLabel: notebookTitle,
      ...nextValues,
    });
  });
  return Array.from(map.values());
}

function compareCloudImportFiles(left, right) {
  return String(left.name || "").localeCompare(String(right.name || ""), "zh-Hans", {
    numeric: true,
    sensitivity: "base",
  });
}

function getCloudNotebooks() {
  const map = new Map();
  state.cloud.notes.forEach((note) => {
    const title = getCloudNotebookTitle(note);
    const existing = map.get(title) || {
      title,
      count: 0,
      typeCounts: { A: 0, B: 0 },
      updatedAt: "",
    };
    const type = note.note_type === "B" ? "B" : "A";
    existing.count += 1;
    existing.typeCounts[type] += 1;
    if (!existing.updatedAt || String(note.updated_at || "") > existing.updatedAt) {
      existing.updatedAt = note.updated_at || "";
    }
    map.set(title, existing);
  });

  return Array.from(map.values()).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

function getCloudNotesForNotebook(title) {
  return state.cloud.notes.filter((note) => getCloudNotebookTitle(note) === title);
}

function compareCloudNotesByOrder(left, right) {
  const leftOrder = Number(left.sort_order ?? left.sortOrder ?? 0);
  const rightOrder = Number(right.sort_order ?? right.sortOrder ?? 0);
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return String(left.created_at || left.id || "").localeCompare(String(right.created_at || right.id || ""));
}

function getCloudNotebookTitle(note) {
  return cleanNoteField(note?.source_label) || "未命名笔记本";
}

function buildCloudNotebookMarkdown(title, notes) {
  const lines = [`# ${title}`, ""];

  ["A", "B"].forEach((type) => {
    const group = notes
      .filter((note) => (note.note_type === "B" ? "B" : "A") === type)
      .sort(compareCloudNotesByOrder);

    lines.push(`## ${type}类本`, "");
    if (!group.length) {
      lines.push("无", "");
      return;
    }

    group.forEach((note) => {
      lines.push(
        [
          cleanNoteField(note.word || note.word_key),
          cleanNoteField(note.pos),
          cleanNoteField(note.meaning),
          cleanNoteField(note.sentence),
          cleanNoteField(note.mnemonic),
        ].join(" ｜"),
      );
    });
    lines.push("");
  });

  return `${lines.join("\n").trim()}\n`;
}

function formatCloudNotebookTitle(date) {
  return `云端词汇整理${formatDateForNoteTitle(date)}`;
}

function formatCloudDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function sanitizeFileName(value) {
  return cleanNoteField(value).replace(/[\\/:*?"<>|]/g, "-") || "云端词汇整理";
}

async function requireCloudSession() {
  if (!canUseCloud()) {
    openCloudDialog();
    throw new Error("请先配置 Supabase");
  }
  if (!state.cloud.session?.access_token) {
    openCloudDialog();
    throw new Error("请先登录云端笔记本");
  }
  return ensureCloudSession();
}

async function ensureCloudSession() {
  const session = state.cloud.session;
  if (!session?.access_token) {
    throw new Error("请先登录云端笔记本");
  }

  const expiresAt = Number(session.expires_at || 0);
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt && expiresAt - now > 60) {
    return session;
  }

  if (!session.refresh_token) {
    clearCloudSession();
    renderCloudNotebook();
    throw new Error("登录已过期，请重新登录");
  }

  try {
    const data = await cloudAuthRequest("/auth/v1/token?grant_type=refresh_token", {
      refresh_token: session.refresh_token,
    });
    return saveCloudSession(data);
  } catch {
    clearCloudSession();
    renderCloudNotebook();
    throw new Error("登录已过期，请重新登录");
  }
}

async function cloudAuthRequest(path, body) {
  if (!canUseCloud()) throw new Error("请先配置 Supabase");
  const response = await fetch(`${state.cloud.url}${path}`, {
    method: "POST",
    headers: {
      apikey: state.cloud.anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return readSupabaseJson(response);
}

async function cloudRestRequest(path, options = {}) {
  const session = await ensureCloudSession();
  const response = await fetch(`${state.cloud.url}${path}`, {
    method: options.method || "GET",
    headers: {
      ...buildCloudHeaders(session),
      ...(options.headers || {}),
    },
    body: options.body,
  });
  return readSupabaseJson(response);
}

function buildCloudHeaders(session) {
  return {
    apikey: state.cloud.anonKey,
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

async function readSupabaseJson(response) {
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(getSupabaseErrorMessage(data, response.status));
  }
  return data;
}

function getSupabaseErrorMessage(data, status) {
  if (!data) return `Supabase 请求失败 ${status}`;
  return data.error_description || data.msg || data.message || data.error || `Supabase 请求失败 ${status}`;
}

function canUseCloud() {
  return Boolean(state.cloud.url && state.cloud.anonKey);
}

function normalizeCloudUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function saveCloudSession(data) {
  const rawSession = data.session || data;
  const user = rawSession.user || data.user || {};
  const expiresAt =
    rawSession.expires_at ||
    (rawSession.expires_in ? Math.floor(Date.now() / 1000) + Number(rawSession.expires_in) : 0);

  state.cloud.session = {
    access_token: rawSession.access_token,
    refresh_token: rawSession.refresh_token,
    expires_at: expiresAt,
    user: {
      id: user.id,
      email: user.email || state.cloud.email,
    },
  };
  state.cloud.email = state.cloud.session.user.email || state.cloud.email;
  persistCloudSettings();
  persistCloudSession();
  renderCloudNotebook();
  return state.cloud.session;
}

function loadCloudSettings() {
  try {
    const raw = localStorage.getItem(CLOUD_SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.cloud.url = normalizeCloudUrl(saved.url);
    state.cloud.anonKey = typeof saved.anonKey === "string" ? saved.anonKey : "";
    state.cloud.email = typeof saved.email === "string" ? saved.email : "";
  } catch {
    localStorage.removeItem(CLOUD_SETTINGS_STORAGE_KEY);
  }
}

function persistCloudSettings() {
  if (!canUseCloud() && !state.cloud.email) {
    localStorage.removeItem(CLOUD_SETTINGS_STORAGE_KEY);
    return;
  }

  localStorage.setItem(
    CLOUD_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      url: state.cloud.url,
      anonKey: state.cloud.anonKey,
      email: state.cloud.email,
    }),
  );
}

function loadCloudSession() {
  try {
    const raw = localStorage.getItem(CLOUD_SESSION_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved?.access_token) return;
    state.cloud.session = saved;
    state.cloud.email = saved.user?.email || state.cloud.email;
  } catch {
    clearCloudSession();
  }
}

function getCloudCacheAccountKey() {
  const account = state.cloud.session?.user?.id || state.cloud.session?.user?.email || state.cloud.email;
  if (!state.cloud.url || !account) return "";
  return `${state.cloud.url}::${account}`;
}

function loadCloudCache() {
  try {
    const raw = localStorage.getItem(CLOUD_CACHE_STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);
    const accountKey = getCloudCacheAccountKey();
    if (saved.accountKey && accountKey && saved.accountKey !== accountKey) return;
    if (saved.accountKey && !accountKey) return;

    state.cloud.notes = Array.isArray(saved.notes) ? saved.notes : [];
    state.cloud.workspace = Array.isArray(saved.workspace) ? saved.workspace : [];
    state.cloud.selectedNotebook = typeof saved.selectedNotebook === "string" ? saved.selectedNotebook : "";
    state.cloud.loaded = Boolean(saved.loaded) || state.cloud.notes.length > 0;
  } catch {
    clearCloudCache();
  }
}

function persistCloudCache() {
  const accountKey = getCloudCacheAccountKey();
  if (!accountKey) return;

  try {
    localStorage.setItem(
      CLOUD_CACHE_STORAGE_KEY,
      JSON.stringify({
        accountKey,
        notes: state.cloud.notes,
        workspace: state.cloud.workspace,
        selectedNotebook: state.cloud.selectedNotebook,
        loaded: state.cloud.loaded,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Cache is optional; Supabase remains the source of truth.
  }
}

function clearCloudCache() {
  localStorage.removeItem(CLOUD_CACHE_STORAGE_KEY);
}

function persistCloudSession() {
  if (!state.cloud.session?.access_token) {
    clearCloudSession();
    return;
  }
  localStorage.setItem(CLOUD_SESSION_STORAGE_KEY, JSON.stringify(state.cloud.session));
}

function clearCloudSession() {
  state.cloud.session = null;
  localStorage.removeItem(CLOUD_SESSION_STORAGE_KEY);
}

function setCloudBusy(isBusy) {
  state.cloud.busy = isBusy;
  renderCloudNotebook();
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function initVoices() {
  if (!("speechSynthesis" in window)) return;
  const loadVoices = () => {
    state.voices = window.speechSynthesis.getVoices();
  };
  loadVoices();
  if (typeof window.speechSynthesis.addEventListener === "function") {
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
  } else if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

function speakWord(word) {
  const text = normalizeAudioText(word);
  if (!text) {
    showToast("播放失败", true);
    return;
  }

  const primary = shouldUseRemoteAudioFirst() ? playRemoteWordAudio : speakWithWebSpeech;
  const fallback = shouldUseRemoteAudioFirst() ? speakWithWebSpeech : playRemoteWordAudio;

  primary(text).catch(() => {
    fallback(text).catch(() => showToast("播放失败", true));
  });
}

function speakWithWebSpeech(word) {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      reject(new Error("Speech synthesis is unavailable"));
      return;
    }

    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(word);
    let settled = false;

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(startTimer);
      callback(value);
    };

    const startTimer = window.setTimeout(() => {
      synth.cancel();
      settle(reject, new Error("Speech synthesis did not start"));
    }, 1800);

    utterance.lang = "en-US";
    utterance.rate = 0.86;
    utterance.pitch = 1;

    const voice = pickEnglishVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => settle(resolve);
    utterance.onend = () => settle(resolve);
    utterance.onerror = (event) => settle(reject, event);

    synth.cancel();
    synth.speak(utterance);
    if (synth.paused) synth.resume();
  });
}

function playRemoteWordAudio(word) {
  return new Promise((resolve, reject) => {
    try {
      if (state.currentAudio) {
        state.currentAudio.pause();
        state.currentAudio = null;
      }

      const audio = new Audio(buildRemoteAudioUrl(word));
      state.currentAudio = audio;
      audio.preload = "auto";

      let settled = false;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(loadTimer);
        callback(value);
      };

      const loadTimer = window.setTimeout(() => {
        settle(reject, new Error("Remote audio timed out"));
      }, 5000);

      audio.onplaying = () => settle(resolve);
      audio.onended = () => settle(resolve);
      audio.onerror = () => settle(reject, new Error("Remote audio failed"));

      const playResult = audio.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch((error) => settle(reject, error));
      }
    } catch (error) {
      reject(error);
    }
  });
}

function shouldUseRemoteAudioFirst() {
  return /Android/i.test(navigator.userAgent);
}

function buildRemoteAudioUrl(word) {
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;
}

function normalizeAudioText(word) {
  return String(word || "")
    .trim()
    .split("/")
    .find(Boolean)
    ?.trim() || "";
}

function pickEnglishVoice() {
  const voices = state.voices.length ? state.voices : window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => /google us english/i.test(voice.name)) ||
    voices.find((voice) => /samantha/i.test(voice.name)) ||
    voices.find((voice) => /^en-US/i.test(voice.lang)) ||
    voices.find((voice) => /^en/i.test(voice.lang)) ||
    null
  );
}

function startDictation(card, originalWord) {
  const title = card.querySelector(".word-title");
  if (!title || title.querySelector("input")) return;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "dictation-input";
  input.autocomplete = "off";
  input.autocapitalize = "none";
  input.spellcheck = false;
  input.placeholder = "输入单词";
  title.textContent = "";
  title.append(input);
  input.focus();

  const restore = () => {
    title.textContent = originalWord;
  };

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const answer = input.value.trim().toLowerCase();
    const correct = originalWord.toLowerCase();
    if (answer === correct) {
      showToast("默写正确");
    } else {
      showToast(`正确拼写：${originalWord}`, true);
    }
    restore();
  });

  input.addEventListener("blur", () => {
    window.setTimeout(restore, 150);
  });
}

async function handleMnemonic(item, mnemonicBox, button) {
  if (!canCallMnemonicApi()) {
    if (item.mnemonic) {
      mnemonicBox.classList.toggle("is-visible");
      return;
    }
    state.pendingMnemonic = { item, mnemonicBox, button };
    openApiDialog();
    showToast("请先填写 Supabase Function URL 和 anon key", true);
    return;
  }

  await generateMnemonic(item, mnemonicBox, button);
}

async function generateMnemonic(item, mnemonicBox, button) {
  button.disabled = true;
  mnemonicBox.classList.add("is-visible", "is-loading");
  mnemonicBox.textContent = "正在生成助记...";

  try {
    const mnemonic = await requestMnemonic(item.word);
    item.mnemonic = mnemonic;
    state.mnemonics.set(normalizeWordKey(item.word), mnemonic);
    mnemonicBox.classList.remove("is-loading");
    mnemonicBox.textContent = mnemonic;
    showToast("助记已生成");
  } catch (error) {
    mnemonicBox.classList.remove("is-loading");
    mnemonicBox.textContent = item.mnemonic || "";
    if (!item.mnemonic) mnemonicBox.classList.remove("is-visible");
    showToast(error.message || "助记生成失败", true);
  } finally {
    button.disabled = false;
  }
}

async function requestMnemonic(word) {
  let response;
  try {
    response = await fetch(state.api.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: state.api.key,
        Authorization: `Bearer ${state.api.key}`,
      },
      body: JSON.stringify({
        word,
        model: state.api.model,
      }),
    });
  } catch {
    throw new Error("Supabase 函数请求失败，请检查 Function URL");
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || `Supabase 函数返回 ${response.status}`);
  }

  const data = await response.json();
  const text = extractMnemonicText(data);
  if (!text) throw new Error("Supabase 函数返回为空");
  return text;
}

async function warmEdgeFunction() {
  if (!canCallMnemonicApi()) return;

  try {
    await fetch(state.api.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: state.api.key,
        Authorization: `Bearer ${state.api.key}`,
      },
      body: JSON.stringify({
        warmup: true,
        model: state.api.model,
      }),
    });
  } catch (error) {
    console.warn("Supabase warmup failed", error);
  }
}

function extractMnemonicText(data) {
  return (
    data?.mnemonic?.trim?.() ||
    data?.choices?.[0]?.message?.content?.trim?.() ||
    data?.choices?.[0]?.text?.trim?.() ||
    ""
  );
}

async function readErrorMessage(response) {
  try {
    const data = await response.json();
    return data?.error?.message || data?.message || "";
  } catch {
    return "";
  }
}

function openApiDialog() {
  els.apiEndpoint.value = state.api.endpoint;
  els.apiModel.value = state.api.model;
  els.apiKey.value = state.api.key;
  if (typeof els.apiDialog.showModal === "function") {
    els.apiDialog.showModal();
  } else {
    els.apiDialog.setAttribute("open", "");
  }
  refreshIcons();
}

function closeApiDialog() {
  if (els.apiDialog.open && typeof els.apiDialog.close === "function") {
    els.apiDialog.close();
  } else {
    els.apiDialog.removeAttribute("open");
  }
  state.pendingMnemonic = null;
}

function saveApiSettings() {
  state.api.endpoint = els.apiEndpoint.value.trim() || DEFAULT_API_ENDPOINT;
  state.api.model = els.apiModel.value.trim() || DEFAULT_MODEL;
  state.api.key = els.apiKey.value.trim();
  updateApiState();
  persistApiSettings();
  startPrewarmLoop();
  showToast(canCallMnemonicApi() ? "API 设置已保存" : "API 未配置完整", !canCallMnemonicApi());

  const pending = state.pendingMnemonic;
  state.pendingMnemonic = null;
  closeApiDialog();
  if (pending && canCallMnemonicApi()) {
    generateMnemonic(pending.item, pending.mnemonicBox, pending.button);
  }
}

function clearApiSettings() {
  state.api = {
    endpoint: DEFAULT_API_ENDPOINT,
    model: DEFAULT_MODEL,
    key: "",
  };
  els.apiEndpoint.value = state.api.endpoint;
  els.apiModel.value = state.api.model;
  els.apiKey.value = "";
  clearPersistedApiSettings();
  stopPrewarmLoop();
  updateApiState();
  showToast("API 设置已清除");
}

function updateApiState() {
  if (canCallMnemonicApi()) {
    els.apiState.textContent = `Supabase 代理：${state.api.model}`;
  } else {
    els.apiState.textContent = "Supabase 代理未配置";
  }
  els.apiState.classList.toggle("is-ready", canCallMnemonicApi());
}

function canCallMnemonicApi() {
  return Boolean(state.api.endpoint && state.api.key);
}

function loadApiSettings() {
  try {
    const raw = localStorage.getItem(API_SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.api.endpoint = typeof saved.endpoint === "string" ? saved.endpoint : DEFAULT_API_ENDPOINT;
    state.api.model = typeof saved.model === "string" && saved.model ? saved.model : DEFAULT_MODEL;
    state.api.key = typeof saved.key === "string" ? saved.key : "";
  } catch {
    clearPersistedApiSettings();
  }
}

function persistApiSettings() {
  if (!canCallMnemonicApi()) {
    clearPersistedApiSettings();
    return;
  }

  try {
    localStorage.setItem(
      API_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        endpoint: state.api.endpoint,
        model: state.api.model,
        key: state.api.key,
      }),
    );
  } catch {
    showToast("浏览器无法保存 API 设置", true);
  }
}

function clearPersistedApiSettings() {
  try {
    localStorage.removeItem(API_SETTINGS_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

function startPrewarmLoop() {
  stopPrewarmLoop();
  if (!canCallMnemonicApi()) return;

  warmEdgeFunction();
  state.prewarmTimer = window.setInterval(warmEdgeFunction, PREWARM_INTERVAL_MS);
}

function stopPrewarmLoop() {
  if (!state.prewarmTimer) return;
  window.clearInterval(state.prewarmTimer);
  state.prewarmTimer = null;
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle("is-error", isError);
  els.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 2200);
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons({ attrs: { "stroke-width": 2 } });
  }
}

function countWords(chapter) {
  return chapter.groups.reduce((sum, group) => sum + group.length, 0);
}

function normalizeWordKey(word) {
  return String(word).trim().toLowerCase();
}

function formatDateForNoteTitle(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
