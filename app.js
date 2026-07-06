const DEFAULT_API_ENDPOINT = "";
const DEFAULT_MODEL = "ecnu-max";
const GROUP_COLORS = ["#ef4444", "#0f766e", "#2563eb", "#d97706", "#7c3aed", "#0891b2"];
const API_SETTINGS_STORAGE_KEY = "personal-vocab-supabase-settings";
const WORKSPACE_STORAGE_KEY = "personal-vocab-workspace";
const PREWARM_INTERVAL_MS = 10 * 60 * 1000;
const SCROLL_TOP_THRESHOLD = 280;
const HEADER_HIDE_THRESHOLD = 120;
const HEADER_SCROLL_DELTA = 3;
const PAGE_TITLES = {
  home: "英语速提升系统",
  vocabulary: "个人背单词",
  reading: "阅读提升",
};
const PAGE_COPY = {
  home: "个人学习入口",
  vocabulary: "逻辑词群记忆",
  reading: "雅思阅读训练",
};

const state = {
  activePage: "home",
  chapters: [],
  chapterIndex: 0,
  searchText: "",
  notes: [],
  mnemonics: new Map(),
  readingSubView: "selector",
  api: {
    endpoint: DEFAULT_API_ENDPOINT,
    model: DEFAULT_MODEL,
    key: "",
  },
  voices: [],
  pendingMnemonic: null,
  prewarmTimer: null,
  currentAudio: null,
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
  loadWorkspace();
  updateApiState();
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
  els.homeMenuButtons = Array.from(document.querySelectorAll(".home-menu-button"));
  els.vocabularyView = document.getElementById("vocabulary-view");
  els.readingView = document.getElementById("reading-view");
  els.scrollTop = document.getElementById("scroll-top");
  els.vocabActions = document.getElementById("vocab-actions");
  els.chapterSelect = document.getElementById("chapter-select");
  els.searchInput = document.getElementById("search-input");
  els.wordList = document.getElementById("word-list");
  els.chapterTitle = document.getElementById("chapter-title");
  els.chapterMeta = document.getElementById("chapter-meta");
  els.noteCount = document.getElementById("note-count");
  els.exportNotes = document.getElementById("export-notes");
  els.openWorkspace = document.getElementById("open-workspace");
  els.closeWorkspace = document.getElementById("close-workspace");
  els.clearWorkspace = document.getElementById("clear-workspace");
  els.workspacePanel = document.getElementById("workspace-panel");
  els.workspaceList = document.getElementById("workspace-list");
  els.workspaceMeta = document.getElementById("workspace-meta");
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
}

function bindEvents() {
  els.homeButton.addEventListener("click", () => switchPage("home"));

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
  els.closeWorkspace.addEventListener("click", closeWorkspace);
  els.panelBackdrop.addEventListener("click", closeWorkspace);
  els.clearWorkspace.addEventListener("click", clearWorkspace);
  els.apiSettings.addEventListener("click", () => openApiDialog());
  els.closeApiDialog.addEventListener("click", closeApiDialog);
  els.clearApi.addEventListener("click", clearApiSettings);

  els.apiForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveApiSettings();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeWorkspace();
      closeApiDialog();
    }
  });
}

function pageFromHash() {
  if (window.location.hash === "#vocabulary") return "vocabulary";
  if (window.location.hash === "#reading") return "reading";
  return "home";
}

function switchPage(page, options = {}) {
  const nextPage = page === "vocabulary" || page === "reading" ? page : "home";
  const updateHash = options.updateHash !== false;
  const isHome = nextPage === "home";
  const previousPage = state.activePage;

  state.activePage = nextPage;
  document.body.classList.toggle("is-home", isHome);
  document.body.classList.toggle("is-reading", nextPage === "reading");
  if (nextPage !== "reading") {
    state.readingSubView = "selector";
  }
  syncAppHeaderVisibility();
  els.homeView.hidden = !isHome;
  els.vocabularyView.hidden = nextPage !== "vocabulary";
  els.readingView.hidden = nextPage !== "reading";
  els.vocabActions.classList.toggle("is-hidden", nextPage !== "vocabulary");
  document.title = PAGE_TITLES[nextPage];
  els.title.textContent = PAGE_TITLES[nextPage];
  els.subtitle.textContent = getPageSubtitle(nextPage);
  setHeaderHiddenByScroll(false);

  if (previousPage !== nextPage) {
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  if (isHome || nextPage !== "vocabulary") {
    closeWorkspace();
    closeApiDialog();
  }

  if (nextPage === "reading" && window.readingApp) {
    window.readingApp.show();
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
  els.appHeader.hidden = isHome || isReadingInnerPage;
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
  const pageHasScrollTools = state.activePage === "vocabulary" || state.activePage === "reading";
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
  els.workspacePanel.classList.add("is-open");
  els.workspacePanel.setAttribute("aria-hidden", "false");
  els.panelBackdrop.hidden = false;
}

function closeWorkspace() {
  els.workspacePanel.classList.remove("is-open");
  els.workspacePanel.setAttribute("aria-hidden", "true");
  els.panelBackdrop.hidden = true;
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
