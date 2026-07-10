import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "offline-resources.json");

const CORE_RESOURCES = [
  "./",
  "./index.html",
  "./app.js",
  "./reading.js",
  "./listening.js",
  "./writing.js",
  "./styles.css",
  "./reading-styles.css",
  "./listening-styles.css",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./vocabulary.txt",
  "./mnemonics.json",
  "./offline-resources.json",
  "./sw.js",
];

const CONTENT_ROOTS = [
  "reading-question-bank",
  "zyz-question-bank",
  "tzx-reading",
  "listening-question-bank",
  "writing-resources",
];

const FIXED_EXTERNAL_RESOURCES = [
  "https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js",
];

async function collectFiles(relativeDirectory) {
  const directory = path.join(ROOT, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

function extractExternalMedia(text) {
  const urls = [];
  const pattern = /\b(?:src|poster)\s*=\s*\\?["'](https?:\/\/[^"'\\\s<>]+)\\?["']/gi;
  let match = pattern.exec(text);
  while (match) {
    urls.push(match[1]);
    match = pattern.exec(text);
  }
  return urls;
}

async function main() {
  const contentFiles = (await Promise.all(CONTENT_ROOTS.map(collectFiles))).flat().sort();
  const coreFiles = CORE_RESOURCES.filter((resource) => resource !== "./" && resource !== "./offline-resources.json").map(
    (resource) => resource.replace(/^\.\//, ""),
  );
  const localFiles = [...new Set([...coreFiles, ...contentFiles])].sort();
  const externalResources = new Set(FIXED_EXTERNAL_RESOURCES);
  const digest = createHash("sha256");
  let totalBytes = 0;

  for (const relativePath of localFiles) {
    const absolutePath = path.join(ROOT, relativePath);
    const info = await stat(absolutePath);
    const contents = await readFile(absolutePath);
    totalBytes += info.size;
    digest.update(relativePath);
    digest.update(contents);

    if (contentFiles.includes(relativePath) && /\.(?:html|json)$/i.test(relativePath)) {
      extractExternalMedia(contents.toString("utf8")).forEach((url) => externalResources.add(url));
    }
  }

  const manifest = {
    version: digest.digest("hex").slice(0, 16),
    generatedAt: new Date().toISOString(),
    totalBytes,
    core: CORE_RESOURCES,
    content: contentFiles.map((file) => `./${file}`),
    external: [...externalResources].sort(),
  };

  await writeFile(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const totalResources = manifest.core.length + manifest.content.length + manifest.external.length;
  console.log(`Generated ${path.relative(ROOT, OUTPUT)} with ${totalResources} resources (${manifest.version}).`);
}

await main();
