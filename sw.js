const OFFLINE_CACHE = "english-offline-content-v1";
const OFFLINE_MANIFEST_URL = new URL("./offline-resources.json", self.registration.scope).href;
const OFFLINE_META_URL = new URL("./__offline-package-meta__", self.registration.scope).href;
const DOWNLOAD_CONCURRENCY = 8;

const CORE_ASSETS = [
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
];

const CONTENT_DIRECTORIES = [
  "./reading-question-bank/",
  "./zyz-question-bank/",
  "./tzx-reading/",
  "./listening-question-bank/",
  "./writing-resources/",
].map((path) => new URL(path, self.registration.scope).pathname);

let activeDownload = null;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      await Promise.allSettled(
        CORE_ASSETS.map(async (path) => {
          const url = new URL(path, self.registration.scope);
          const response = await fetch(new Request(url, { cache: "reload", credentials: "same-origin" }));
          if (response.ok) await cache.put(url, response);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  if (type === "GET_OFFLINE_STATUS") {
    event.waitUntil(reportOfflineStatus(event.source));
    return;
  }
  if (type === "DOWNLOAD_OFFLINE_CONTENT") {
    event.waitUntil(startOfflineDownload(event.source));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isContent =
    url.origin === self.location.origin && CONTENT_DIRECTORIES.some((directory) => url.pathname.startsWith(directory));

  if (isContent || url.origin !== self.location.origin) {
    event.respondWith(cacheFirst(request, { ignoreSearch: isContent, cacheNetworkResponse: isContent }));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function cacheFirst(request, options = {}) {
  const cache = await caches.open(OFFLINE_CACHE);
  const cached = await cache.match(request, { ignoreSearch: Boolean(options.ignoreSearch) });
  if (cached) return cached;

  const response = await fetch(request);
  if (options.cacheNetworkResponse && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(OFFLINE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && new URL(request.url).origin === self.location.origin) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    if (request.mode === "navigate") {
      const fallback =
        (await cache.match(new URL("./index.html", self.registration.scope))) ||
        (await cache.match(new URL("./", self.registration.scope)));
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function loadOfflineManifest() {
  const cache = await caches.open(OFFLINE_CACHE);
  try {
    const response = await fetch(new Request(OFFLINE_MANIFEST_URL, { cache: "no-store", credentials: "same-origin" }));
    if (!response.ok) throw new Error(`离线清单请求失败 ${response.status}`);
    await cache.put(OFFLINE_MANIFEST_URL, response.clone());
    return response.json();
  } catch (error) {
    const cached = await cache.match(OFFLINE_MANIFEST_URL);
    if (cached) return cached.json();
    throw error;
  }
}

async function readOfflineMeta() {
  const cache = await caches.open(OFFLINE_CACHE);
  const response = await cache.match(OFFLINE_META_URL);
  if (!response) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function reportOfflineStatus(client) {
  try {
    const [manifest, meta] = await Promise.all([loadOfflineManifest(), readOfflineMeta()]);
    const total = countManifestResources(manifest);
    const status = meta?.version === manifest.version && meta?.total === total ? "complete" : meta ? "outdated" : "idle";
    client?.postMessage({
      type: "OFFLINE_STATUS",
      status,
      total,
      version: manifest.version,
      completedAt: meta?.completedAt || "",
    });
  } catch (error) {
    client?.postMessage({ type: "OFFLINE_STATUS", status: "unavailable", message: readableError(error) });
  }
}

async function startOfflineDownload(client) {
  if (!activeDownload) {
    activeDownload = downloadOfflineContent(client).finally(() => {
      activeDownload = null;
    });
  } else {
    client?.postMessage({ type: "OFFLINE_DOWNLOAD_BUSY" });
  }
  await activeDownload;
}

async function downloadOfflineContent(client) {
  const cache = await caches.open(OFFLINE_CACHE);
  try {
    const manifest = await loadOfflineManifest();
    const resources = uniqueManifestResources(manifest);
    const total = resources.length;
    let completed = 0;
    let lastPercent = -1;
    const failures = [];

    client?.postMessage({ type: "OFFLINE_DOWNLOAD_START", total, totalBytes: manifest.totalBytes || 0 });

    const queue = resources.slice();
    const workers = Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, queue.length) }, async () => {
      while (queue.length) {
        const resource = queue.shift();
        try {
          await cacheResource(cache, resource);
        } catch (error) {
          failures.push({ resource, message: readableError(error) });
        }

        completed += 1;
        const percent = Math.floor((completed / total) * 100);
        if (percent !== lastPercent || completed === total) {
          lastPercent = percent;
          client?.postMessage({
            type: "OFFLINE_DOWNLOAD_PROGRESS",
            completed,
            total,
            percent,
            failed: failures.length,
          });
        }
      }
    });

    await Promise.all(workers);

    if (failures.length) {
      await cache.delete(OFFLINE_META_URL);
      client?.postMessage({
        type: "OFFLINE_DOWNLOAD_ERROR",
        completed,
        total,
        failed: failures.length,
        failures: failures.slice(0, 5),
      });
      return;
    }

    const meta = {
      version: manifest.version,
      total,
      completedAt: new Date().toISOString(),
    };
    await cache.put(
      OFFLINE_META_URL,
      new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }),
    );
    await pruneOfflineCache(cache, resources);
    client?.postMessage({ type: "OFFLINE_DOWNLOAD_COMPLETE", ...meta, totalBytes: manifest.totalBytes || 0 });
  } catch (error) {
    client?.postMessage({ type: "OFFLINE_DOWNLOAD_ERROR", message: readableError(error), failed: 1 });
  }
}

async function cacheResource(cache, resource) {
  const url = new URL(resource, self.registration.scope);
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const sameOrigin = url.origin === self.location.origin;
      const request = sameOrigin
        ? new Request(url, { cache: "reload", credentials: "same-origin" })
        : new Request(url, { cache: "no-store", credentials: "omit", mode: "no-cors" });
      const response = await fetch(request);
      if (!response.ok && response.type !== "opaque") {
        throw new Error(`${response.status} ${response.statusText}`.trim());
      }
      await cache.put(request, response);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("下载失败");
}

async function pruneOfflineCache(cache, resources) {
  const keep = new Set(resources.map((resource) => new URL(resource, self.registration.scope).href));
  keep.add(OFFLINE_META_URL);
  const requests = await cache.keys();
  await Promise.all(requests.filter((request) => !keep.has(request.url)).map((request) => cache.delete(request)));
}

function uniqueManifestResources(manifest) {
  return [...new Set([...(manifest.core || []), ...(manifest.content || []), ...(manifest.external || [])])];
}

function countManifestResources(manifest) {
  return uniqueManifestResources(manifest).length;
}

function readableError(error) {
  return error instanceof Error ? error.message : String(error || "未知错误");
}
