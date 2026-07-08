import fs from "node:fs";
import path from "node:path";

const sourceDir = path.resolve(process.argv[2] || "/Users/toy/English/躺着学/躺着学阅读");
const outputDir = path.resolve(process.argv[3] || "tzx-reading");

const WORD_NUMBERS = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

function main() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory does not exist: ${sourceDir}`);
  }

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const resourceDir = path.join(sourceDir, "resources");
  if (fs.existsSync(resourceDir)) {
    fs.cpSync(resourceDir, path.join(outputDir, "resources"), { recursive: true });
  }

  const htmlFiles = fs
    .readdirSync(sourceDir)
    .filter((name) => name.toLowerCase().endsWith(".html"))
    .sort(compareSourceFilenames);

  const items = [];
  for (const filename of htmlFiles) {
    const sourcePath = path.join(sourceDir, filename);
    const html = fs.readFileSync(sourcePath, "utf8");
    const data = convertHtmlFile(filename, html);
    fs.writeFileSync(path.join(outputDir, `${data.id}.json`), `${JSON.stringify(data, null, 2)}\n`);
    items.push(manifestItem(data, filename));
  }

  const categories = [1, 2, 3].map((passageNo) => {
    const count = items.filter((item) => item.passage_no === passageNo).length;
    return {
      id: `p${passageNo}`,
      label: `Passage ${passageNo}`,
      passage: `P${passageNo}`,
      count,
    };
  });

  const manifest = {
    generated_at: new Date().toISOString(),
    source: sourceDir,
    categories,
    items,
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Converted ${items.length} HTML files into ${outputDir}`);
}

function convertHtmlFile(filename, html) {
  const sourceId = sourceIdFromFilename(filename);
  const passageNo = passageNoFromFilename(filename);
  const id = `tzx-${sourceId}`;
  const title = titleFromHtml(filename, html, passageNo);
  const articleHtml = normalizeSourceHtml(extractElementByClass(html, "article-pane") || "");
  const questionHtml = normalizeQuestionHtml(extractElementByClass(html, "question-pane") || "");
  const questionIds = collectQuestionIds(questionHtml);
  const questionNumbers = questionIds.map((qid) => Number(qid.replace(/\D/g, ""))).filter((value) => value > 0);
  const questionRange = buildQuestionRange(questionNumbers, passageNo);
  const answerKey = extractAnswerKey(questionHtml);

  return {
    id,
    source: "tzx",
    group: `p${passageNo}`,
    category: `P${passageNo}`,
    title,
    originalFilename: filename,
    source_refs: {
      html: path.join(sourceDir, filename),
    },
    answer_key: answerKey,
    question_order: questionIds,
    question_display_map: Object.fromEntries(questionIds.map((qid) => [qid, qid.replace(/\D/g, "")])),
    passages: [
      {
        passage_no: passageNo,
        question_range: questionRange,
        title,
        subtitle: "",
        intro: [],
        paragraphs: [],
        source_html: articleHtml,
      },
    ],
    problems: [
      {
        passage_no: passageNo,
        groups: [
          {
            title: formatQuestionRangeTitle(questionRange),
            question_range: questionRange,
            raw_lines: [],
            source_kind: "tzx-html",
            source_html: questionHtml,
            source_question_ids: questionIds,
            kind: "html",
          },
        ],
      },
    ],
  };
}

function manifestItem(data, filename) {
  const passage = data.passages[0];
  return {
    id: data.id,
    status: "ok",
    source: "tzx",
    group: data.group,
    title: data.title,
    category: data.category,
    originalFilename: filename,
    path: `${data.id}.json`,
    passage_no: passage.passage_no,
    question_range: passage.question_range,
    problem_groups: 1,
    order: Number(data.id.replace(/\D/g, "")) || 0,
  };
}

function compareSourceFilenames(a, b) {
  const pa = passageNoFromFilename(a);
  const pb = passageNoFromFilename(b);
  if (pa !== pb) return pa - pb;
  return (Number(sourceIdFromFilename(a)) || 0) - (Number(sourceIdFromFilename(b)) || 0) || a.localeCompare(b);
}

function sourceIdFromFilename(filename) {
  const match = filename.match(/^(\d+)/);
  if (match) return match[1];
  return slugify(filename.replace(/\.html$/i, ""));
}

function passageNoFromFilename(filename) {
  const match = filename.match(/Passage\s*(\d+)/i);
  return match ? Number(match[1]) : 1;
}

function titleFromHtml(filename, html, passageNo) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = decodeEntities(stripTags(titleMatch?.[1] || filename.replace(/\.html$/i, "")));
  const withoutPassage = rawTitle.replace(new RegExp(`^\\s*Passage\\s*${passageNo}\\s*`, "i"), "").trim();
  return withoutPassage || filename.replace(/^\d+_/, "").replace(/\.html$/i, "").trim();
}

function extractElementByClass(html, className) {
  const classPattern = new RegExp(`<div\\b(?=[^>]*\\bclass=(["'])[^"']*\\b${escapeRegExp(className)}\\b[^"']*\\1)[^>]*>`, "i");
  const match = classPattern.exec(html);
  if (!match) return "";
  const openEnd = match.index + match[0].length;
  const closeStart = findMatchingDivClose(html, openEnd);
  if (closeStart < 0) return "";
  return html.slice(openEnd, closeStart).trim();
}

function transformElementsByClass(html, className, transform) {
  const classPattern = new RegExp(`<div\\b(?=[^>]*\\bclass=(["'])[^"']*\\b${escapeRegExp(className)}\\b[^"']*\\1)[^>]*>`, "gi");
  let result = "";
  let cursor = 0;
  let match;

  while ((match = classPattern.exec(html))) {
    const openTag = match[0];
    const openEnd = match.index + openTag.length;
    const closeStart = findMatchingDivClose(html, openEnd);
    if (closeStart < 0) break;
    const closeEnd = closeStart + html.slice(closeStart).match(/^<\/div\s*>/i)[0].length;
    const inner = html.slice(openEnd, closeStart);
    result += html.slice(cursor, match.index);
    result += `${openTag}${transform(inner, openTag)}</div>`;
    cursor = closeEnd;
    classPattern.lastIndex = closeEnd;
  }

  return result + html.slice(cursor);
}

function findMatchingDivClose(html, openEnd) {
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = openEnd;
  let depth = 1;
  let match;
  while ((match = tagPattern.exec(html))) {
    if (/^<\//.test(match[0])) {
      depth -= 1;
      if (depth === 0) return match.index;
    } else {
      depth += 1;
    }
  }
  return -1;
}

function normalizeSourceHtml(html) {
  return rewriteAssetPaths(cleanEmbeddedHtml(html))
    .replace(/#&amp;/g, "")
    .replace(/&amp;#/g, "")
    .replace(/#&/g, "");
}

function normalizeQuestionHtml(html) {
  const cleaned = rewriteAssetPaths(cleanEmbeddedHtml(html));
  return transformElementsByClass(cleaned, "big-section", normalizeQuestionSection);
}

function cleanEmbeddedHtml(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/\s+onclick=(["']).*?\1/gi, "")
    .replace(/\s+on(?:drag|drop|click|change|input|mousedown|mouseup|mouseover|mouseout)=(["']).*?\1/gi, "");
}

function rewriteAssetPaths(html) {
  return html.replace(/(<img\b[^>]*\bsrc=(["']))(?!https?:|data:|\/|\.\/tzx-reading\/)([^"']+)(\2)/gi, (_match, prefix, quote, src, suffix) => {
    return `${prefix}./tzx-reading/${src.replace(/^\.?\//, "")}${suffix}`;
  });
}

function normalizeQuestionSection(sectionHtml) {
  const sectionText = decodeEntities(stripTags(sectionHtml));
  const questionNumbers = questionNumbersFromSection(sectionHtml, sectionText);
  const requiredChoices = requiredChoiceCount(sectionText);
  const hasChoiceInputs = /<input\b/i.test(sectionHtml);
  let nextBlankIndex = 0;

  let transformed = sectionHtml.replace(/<input\b[^>]*>/gi, (tag) => {
    return normalizeInputTag(tag, questionNumbers, requiredChoices);
  });

  if (hasChoiceInputs) {
    return transformed;
  }

  transformed = transformed.replace(/<span\b([^>]*\bclass=(["'])[^"']*\binput-blank\b[^"']*\2[^>]*)>[\s\S]*?<\/span>/gi, (match, attrs) => {
    const number = questionNumbers[nextBlankIndex] || nearestQuestionNumberBefore(sectionHtml, match) || null;
    nextBlankIndex += 1;
    if (!number) return match;
    const nextAttrs = upsertAttr(attrs, "data-question", `q${number}`);
    return `<span${nextAttrs}></span>`;
  });

  return transformed;
}

function normalizeInputTag(tag, questionNumbers, requiredChoices) {
  const attrs = readAttrs(tag);
  const type = (attrs.type || "text").toLowerCase();
  if (type !== "radio" && type !== "checkbox") return tag;

  const explicitNumber = questionNumberFromName(attrs.name) || questionNumberFromName(attrs.id);
  const usesMultiChoice = requiredChoices > 1 && questionNumbers.length >= requiredChoices;
  const questionRef = usesMultiChoice
    ? `q${questionNumbers[0]}-q${questionNumbers[requiredChoices - 1]}`
    : explicitNumber
      ? `q${explicitNumber}`
      : "";

  let nextTag = tag;
  if (usesMultiChoice) {
    nextTag = upsertAttrInTag(nextTag, "type", "checkbox");
    nextTag = upsertAttrInTag(nextTag, "name", `multi_${questionNumbers[0]}_${questionNumbers[requiredChoices - 1]}`);
  }

  if (questionRef) {
    nextTag = upsertAttrInTag(nextTag, "data-zyz-question", questionRef);
  }

  if (!attrs.value) {
    const value = optionValueFromId(attrs.id);
    if (value) {
      nextTag = upsertAttrInTag(nextTag, "value", value);
    }
  }

  return nextTag;
}

function questionNumbersFromSection(sectionHtml, sectionText) {
  const rangeMatch = sectionText.match(/Questions?\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/i);
  if (rangeMatch) {
    return range(Number(rangeMatch[1]), Number(rangeMatch[2]));
  }

  const singleMatch = sectionText.match(/Questions?\s*(\d{1,2})\b/i);
  if (singleMatch) {
    return [Number(singleMatch[1])];
  }

  const explicit = [
    ...sectionHtml.matchAll(/class=(["'])[^"']*\bq-num\b[^"']*\1[^>]*>\s*(\d{1,2})\s*</gi),
    ...sectionHtml.matchAll(/\bname=(["'])(?:radio_|q_matrix_\d+_)(\d{1,2})\1/gi),
  ].map((match) => Number(match[2]));

  return [...new Set(explicit)].filter((value) => value > 0).sort((a, b) => a - b);
}

function requiredChoiceCount(text) {
  const match = text.match(/\bChoose\s+(ONE|TWO|THREE|FOUR|FIVE)\b/i);
  if (!match) return 0;
  return WORD_NUMBERS[match[1].toUpperCase()] || 0;
}

function questionNumberFromName(value) {
  if (!value) return null;
  const text = String(value);
  const matrix = text.match(/q_matrix_\d+_(\d{1,2})/i);
  if (matrix) return Number(matrix[1]);
  const radio = text.match(/radio_(\d{1,2})/i);
  if (radio) return Number(radio[1]);
  const option = text.match(/opt_(\d{1,2})_[A-Z]/i);
  if (option) return Number(option[1]);
  const qid = text.match(/q(\d{1,2})/i);
  return qid ? Number(qid[1]) : null;
}

function optionValueFromId(value) {
  const match = String(value || "").match(/_([A-Z])$/);
  return match ? match[1] : "";
}

function nearestQuestionNumberBefore(html, token) {
  const index = html.indexOf(token);
  if (index < 0) return null;
  const before = html.slice(Math.max(0, index - 500), index);
  const matches = [...before.matchAll(/(?:q-num[^>]*>|<strong[^>]*>)\s*(\d{1,2})\s*</gi)];
  const last = matches[matches.length - 1];
  return last ? Number(last[1]) : null;
}

function readAttrs(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/\s+([:\w-]+)(?:=(["'])(.*?)\2|=([^\s>]+))?/g)) {
    attrs[match[1].toLowerCase()] = match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function upsertAttrInTag(tag, name, value) {
  const attrPattern = new RegExp(`\\s${escapeRegExp(name)}=(["']).*?\\1`, "i");
  if (attrPattern.test(tag)) {
    return tag.replace(attrPattern, ` ${name}="${escapeAttr(value)}"`);
  }
  return tag.replace(/\s*\/?>$/, (end) => ` ${name}="${escapeAttr(value)}"${end}`);
}

function upsertAttr(attrs, name, value) {
  const attrPattern = new RegExp(`\\s${escapeRegExp(name)}=(["']).*?\\1`, "i");
  if (attrPattern.test(attrs)) {
    return attrs.replace(attrPattern, ` ${name}="${escapeAttr(value)}"`);
  }
  return `${attrs} ${name}="${escapeAttr(value)}"`;
}

function collectQuestionIds(html) {
  const ids = [];
  const add = (qid) => {
    if (!qid || ids.includes(qid)) return;
    ids.push(qid);
  };

  for (const match of html.matchAll(/data-(?:zyz-)?question=(["'])(.*?)\1/gi)) {
    for (const qid of questionIdsFromRef(match[2])) add(qid);
  }

  for (const match of html.matchAll(/\bname=(["'])(.*?)\1/gi)) {
    for (const qid of questionIdsFromRef(match[2])) add(qid);
  }

  return ids.sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
}

function questionIdsFromRef(value) {
  const text = String(value || "");
  const rangeMatch = text.match(/q(\d{1,2})\s*[-–_]\s*q?(\d{1,2})/i);
  if (rangeMatch) {
    return range(Number(rangeMatch[1]), Number(rangeMatch[2])).map((number) => `q${number}`);
  }
  const numeric = questionNumberFromName(text);
  if (numeric) return [`q${numeric}`];
  return [...text.matchAll(/q(\d{1,2})/gi)].map((match) => `q${Number(match[1])}`);
}

function buildQuestionRange(questionNumbers, passageNo) {
  const fallbackStart = passageNo === 1 ? 1 : passageNo === 2 ? 14 : 27;
  const fallbackEnd = passageNo === 1 ? 13 : passageNo === 2 ? 26 : 40;
  const start = questionNumbers.length ? Math.min(...questionNumbers) : fallbackStart;
  const end = questionNumbers.length ? Math.max(...questionNumbers) : fallbackEnd;
  return {
    start,
    end,
    numbers: range(start, end),
  };
}

function formatQuestionRangeTitle(questionRange) {
  if (!questionRange?.start || !questionRange?.end) return "Questions";
  return `Questions ${questionRange.start}-${questionRange.end}`;
}

function extractAnswerKey(html) {
  const answerKey = {};
  const rows = html.match(/<div\b[^>]*\bclass=(["'])[^"']*\bans-row\b[^"']*\1[^>]*>[\s\S]*?<\/div>/gi) || [];
  for (const row of rows) {
    const text = decodeEntities(stripTags(row)).replace(/\s+/g, " ").trim();
    const numbered = [...text.matchAll(/\b(\d{1,2})\b\s+([^|]+?)(?=\s+\|\s+|\s+\d{1,2}\b\s+|$)/g)];
    for (const match of numbered) {
      answerKey[`q${Number(match[1])}`] = match[2].trim();
    }
  }
  return answerKey;
}

function range(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  return Array.from({ length: end - start + 1 }, (_item, index) => start + index);
}

function stripTags(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-");
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

main();
