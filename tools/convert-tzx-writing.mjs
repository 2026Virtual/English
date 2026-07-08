import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const PROJECT_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const TASKS = [
  {
    id: "tzx-writing-task1",
    title: "躺着学写作 Task 1",
    subtitle: "小作文题库与范文",
    icon: "T1",
    sourceDir: "/Users/toy/English/躺着学/躺着学写作Task1",
    outputDir: "writing-resources/tzx-task1",
    hasImages: true,
  },
  {
    id: "tzx-writing-task2",
    title: "躺着学写作 Task 2",
    subtitle: "大作文题库与范文",
    icon: "T2",
    sourceDir: "/Users/toy/English/躺着学/躺着学写作Task2",
    outputDir: "writing-resources/tzx-task2",
    hasImages: false,
  },
];

const MANIFEST_PATH = path.join(PROJECT_ROOT, "writing-resources", "tzx-writing-manifest.json");
const cwebpPath = commandPath("cwebp");

const adaptStyle = `
<style id="tzx-writing-adapt">
  :root { color-scheme: light; }
  body {
    margin: 0;
    padding: 22px 14px 34px;
    background: #f6f4ef;
    color: #1f2a2a;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  }
  .paper {
    width: min(1180px, 100%) !important;
    max-width: 1180px !important;
    min-height: auto !important;
    margin: 0 auto !important;
    padding: clamp(18px, 4vw, 42px) !important;
    border: 1px solid #d9dfdc;
    border-radius: 8px;
    box-shadow: 0 12px 34px rgba(31, 42, 42, 0.09) !important;
  }
  .header {
    gap: 12px;
    border-bottom-color: #d9dfdc !important;
    flex-wrap: wrap;
  }
  .h-left h1 { line-height: 1.25; }
  .tag {
    background: #0b7a75 !important;
    border-radius: 999px !important;
    padding: 3px 9px !important;
  }
  .content-grid {
    display: grid !important;
    grid-template-columns: minmax(0, 0.96fr) minmax(0, 1.04fr);
    gap: 24px !important;
  }
  .col-left {
    min-width: 0;
    border-right: 1px dashed #d9dfdc !important;
    padding-right: 20px !important;
  }
  .col-right {
    min-width: 0;
    padding-left: 0 !important;
  }
  .section-title {
    border-left-color: #0b7a75 !important;
    background: #f8faf9 !important;
    color: #1f2a2a;
  }
  .q-text,
  .ans-text {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  .ans-text p,
  .ans-text span,
  .q-text p,
  .q-text span {
    max-width: 100%;
  }
  .q-img,
  img {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
  }
  .writing-float-menu {
    position: fixed;
    top: 14px;
    left: 14px;
    z-index: 10000;
    opacity: 0.88;
    transition: opacity 160ms ease, transform 160ms ease;
  }
  .writing-float-menu.is-hidden {
    opacity: 0;
    pointer-events: none;
    transform: translateY(-10px);
  }
  .writing-float-back {
    min-height: 38px;
    border: 1px solid rgba(31, 42, 42, 0.16);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.88);
    color: #1f2a2a;
    padding: 0 13px;
    font: 700 14px/1.2 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    box-shadow: 0 10px 28px rgba(31, 42, 42, 0.14);
    backdrop-filter: blur(12px);
    cursor: pointer;
  }
  .writing-float-back:hover { background: #fff; }
  @media (max-width: 820px) {
    body { padding: 10px 8px 26px !important; }
    .paper { padding: 16px !important; }
    .header {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr);
      margin-bottom: 18px !important;
    }
    .h-right {
      text-align: left !important;
      font-size: 13px !important;
    }
    .content-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 18px !important;
    }
    .col-left {
      border-right: 0 !important;
      border-bottom: 1px dashed #d9dfdc;
      padding-right: 0 !important;
      padding-bottom: 16px;
    }
    .q-text,
    .ans-text {
      font-size: 15px !important;
      line-height: 1.7 !important;
    }
    .writing-float-menu {
      top: 10px;
      left: 10px;
    }
  }
</style>`;

const floatMenu = `
<div class="writing-float-menu" id="writing-float-menu">
  <button class="writing-float-back" type="button" id="writing-float-back">← 返回</button>
</div>`;

const floatScript = `
<script>
(function(){
  const menu = document.getElementById("writing-float-menu");
  const back = document.getElementById("writing-float-back");
  if (!menu || !back) return;
  let lastY = window.scrollY;
  back.addEventListener("click", function(){
    const ref = document.referrer;
    try {
      if (ref && new URL(ref).origin === window.location.origin) {
        history.back();
        return;
      }
    } catch (error) {}
    window.location.href = "../../#writing";
  });
  window.addEventListener("scroll", function(){
    const y = window.scrollY;
    if (y > lastY && y > 80) {
      menu.classList.add("is-hidden");
    } else {
      menu.classList.remove("is-hidden");
    }
    lastY = y;
  }, { passive: true });
})();
</script>`;

async function main() {
  const groups = [];

  for (const task of TASKS) {
    const result = await convertTask(task);
    groups.push(result);
  }

  await fs.writeFile(
    MANIFEST_PATH,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        image_compression: cwebpPath ? "webp q72/q58 via cwebp" : "uncompressed fallback",
        groups,
      },
      null,
      2,
    )}\n`,
  );

  for (const group of groups) {
    const imageNote = group.images
      ? `, images ${formatBytes(group.images.original_bytes)} -> ${formatBytes(group.images.output_bytes)}`
      : "";
    console.log(`${group.title}: ${group.resources.length} html${imageNote}`);
  }
}

async function convertTask(task) {
  const sourceDir = path.resolve(task.sourceDir);
  const outputDir = path.join(PROJECT_ROOT, task.outputDir);
  const htmlFiles = (await fs.readdir(sourceDir))
    .filter((file) => file.endsWith(".html"))
    .sort((a, b) => numericId(a) - numericId(b) || a.localeCompare(b, "zh-Hans-CN"));

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  let imageMap = new Map();
  let imageStats = null;
  if (task.hasImages) {
    imageStats = await convertImages(path.join(sourceDir, "images"), path.join(outputDir, "images"));
    imageMap = imageStats.map;
  }

  const resources = [];
  const tagCounts = new Map();

  for (const file of htmlFiles) {
    const sourcePath = path.join(sourceDir, file);
    const raw = await fs.readFile(sourcePath, "utf8");
    const meta = extractMeta(raw, file);
    const outputName = `${meta.id}.html`;
    const outputPath = path.join(outputDir, outputName);
    const html = transformHtml(raw, {
      taskTitle: task.title,
      title: meta.title,
      imageMap,
    });

    await fs.writeFile(outputPath, html);
    tagCounts.set(meta.tag, (tagCounts.get(meta.tag) || 0) + 1);
    resources.push({
      id: meta.id,
      title: meta.title,
      subtitle: [meta.tag, `ID ${meta.id}`, meta.hit ? `命中 ${meta.hit}` : ""].filter(Boolean).join(" · "),
      tag: meta.tag,
      hit: meta.hit,
      url: `./${task.outputDir}/${outputName}`,
    });
  }

  return {
    id: task.id,
    title: task.title,
    subtitle: `${task.subtitle} · ${resources.length} 篇`,
    icon: task.icon,
    tags: [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })),
    images: imageStats
      ? {
          original_bytes: imageStats.originalBytes,
          output_bytes: imageStats.outputBytes,
          count: imageStats.count,
        }
      : null,
    resources,
  };
}

async function convertImages(sourceImagesDir, outputImagesDir) {
  await fs.mkdir(outputImagesDir, { recursive: true });
  const imageFiles = (await fs.readdir(sourceImagesDir)).filter((file) => /\.(png|jpe?g|webp|gif)$/i.test(file));
  const map = new Map();
  let originalBytes = 0;
  let outputBytes = 0;

  for (const file of imageFiles) {
    const sourcePath = path.join(sourceImagesDir, file);
    const sourceStat = await fs.stat(sourcePath);
    originalBytes += sourceStat.size;

    const ext = path.extname(file);
    const stem = path.basename(file, ext);
    let outputName = `${stem}.webp`;
    let outputPath = path.join(outputImagesDir, outputName);

    if (cwebpPath) {
      await runCwebp(sourcePath, outputPath, 72);
      const firstStat = await fs.stat(outputPath);
      if (firstStat.size > sourceStat.size * 0.92) {
        await runCwebp(sourcePath, outputPath, 58);
      }
    } else {
      outputName = file;
      outputPath = path.join(outputImagesDir, outputName);
      await fs.copyFile(sourcePath, outputPath);
    }

    const outputStat = await fs.stat(outputPath);
    outputBytes += outputStat.size;
    map.set(`images/${file}`, `images/${outputName}`);
    map.set(file, outputName);
  }

  return { count: imageFiles.length, originalBytes, outputBytes, map };
}

async function runCwebp(sourcePath, outputPath, quality) {
  const result = spawnSync(cwebpPath, ["-quiet", "-m", "6", "-q", String(quality), sourcePath, "-o", outputPath], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`cwebp failed for ${sourcePath}: ${result.stderr || result.stdout}`);
  }
}

function transformHtml(raw, { taskTitle, title, imageMap }) {
  let html = raw;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlText(title)} · ${escapeHtmlText(taskTitle)}</title>`);
  if (!/<meta\s+name=["']viewport["']/i.test(html)) {
    html = html.replace(/<meta\s+charset=["'][^"']+["']\s*\/?>/i, (match) => `${match}\n        <meta name="viewport" content="width=device-width, initial-scale=1">`);
  }
  html = html.replace(/<\/head>/i, `${adaptStyle}\n</head>`);
  html = html.replace(/<body([^>]*)>/i, (match) => `${match}\n${floatMenu}`);
  html = html.replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (match, prefix, src, suffix) => {
    const decodedSrc = decodeHtmlAttr(src);
    const mapped = imageMap.get(decodedSrc) || imageMap.get(path.basename(decodedSrc));
    let next = `${prefix}${mapped || src}${suffix}`;
    if (!/\sloading=/i.test(next)) next = next.replace(/>$/, ' loading="lazy">');
    if (!/\sdecoding=/i.test(next)) next = next.replace(/>$/, ' decoding="async">');
    return next;
  });
  html = html.replace(/<\/body>/i, `${floatScript}\n</body>`);
  return html;
}

function extractMeta(html, filename) {
  const id = matchText(html, /ID:\s*([^<\s]+)/i) || String(numericId(filename));
  const titleFromFile = filename.replace(/\.html$/i, "").replace(/^\d+_?/, "").trim();
  const title = stripTags(matchText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || matchText(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || titleFromFile).trim();
  const tag = stripTags(matchText(html, /<span\s+class=["']tag["'][^>]*>([\s\S]*?)<\/span>/i) || "").trim();
  const hit = stripTags(matchText(html, /命中:\s*([^<]+)/i) || "").trim();
  return { id, title, tag, hit };
}

function numericId(filename) {
  const match = String(filename).match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function matchText(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : "";
}

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ");
}

function decodeHtmlAttr(value) {
  return String(value || "").replace(/&amp;/g, "&");
}

function escapeHtmlText(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function commandPath(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function formatBytes(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
