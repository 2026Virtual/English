import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(toolsDirectory);
const resourcesRoot = path.join(projectRoot, "writing-resources");
const themeScript = path.join(resourcesRoot, "theme-sync.js");
const themeStyles = path.join(resourcesRoot, "theme-sync.css");
const marker = "data-writing-theme";
let updatedCount = 0;

function webPath(fromDirectory, target) {
  const relativePath = path.relative(fromDirectory, target).split(path.sep).join("/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

async function collectHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectHtmlFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(entryPath);
    }
  }

  return files;
}

for (const filePath of await collectHtmlFiles(resourcesRoot)) {
  const html = await readFile(filePath, "utf8");
  if (html.includes(marker)) continue;

  const directory = path.dirname(filePath);
  const injection = [
    `<script ${marker} src="${webPath(directory, themeScript)}?v=20260710-global-theme"></script>`,
    `<link ${marker} rel="stylesheet" href="${webPath(directory, themeStyles)}?v=20260710-global-theme">`,
  ].join("\n");
  const updatedHtml = html.replace(/<\/head>/i, `${injection}\n</head>`);
  if (updatedHtml === html) {
    throw new Error(`Missing </head> in ${path.relative(projectRoot, filePath)}`);
  }

  await writeFile(filePath, updatedHtml);
  updatedCount += 1;
}

console.log(`Added global theme support to ${updatedCount} writing resource pages.`);
