let isRunning = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "startOrderedDownload") {
    return false;
  }

  (async () => {
    try {
      const payload = await startOrderedDownload(message.items);
      sendResponse(payload);
    } catch (error) {
      sendResponse({
        ok: false,
        error: error?.message || "未知错误"
      });
    }
  })();

  return true;
});

async function startOrderedDownload(items) {
  if (isRunning) {
    throw new Error("已有下载任务进行中，请稍后再试。");
  }
  isRunning = true;

  try {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("未提取到可下载图片。");
    }

    const downloaded = [];
    const failed = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const order = i + 1;
      const fileName = buildFileName(order, item);
      try {
        const downloadId = await startDownload(item.url, fileName);
        downloaded.push({
          index: order,
          id: item.id || "unknown",
          downloadId,
          fileName
        });
      } catch (error) {
        failed.push({
          index: order,
          id: item.id || "unknown",
          reason: error?.message || "下载失败"
        });
      }
    }

    return {
      ok: downloaded.length > 0,
      total: items.length,
      successCount: downloaded.length,
      failCount: failed.length,
      downloaded,
      failed
    };
  } finally {
    isRunning = false;
  }
}

function buildFileName(order, item) {
  const ext = sanitizeExt(item.ext) || inferExtFromUrl(item.url) || "jpg";
  const baseName = getOriginalBaseName(item, item.url, order);
  return `${baseName}.${ext}`;
}

function getOriginalBaseName(item, url, order) {
  const fromItemId = sanitizeBaseName(item?.id || "");
  if (fromItemId) {
    return fromItemId;
  }

  const fromItem = sanitizeBaseName(removeExt(item?.originalFileName || ""));
  if (fromItem) {
    return fromItem;
  }

  const fromUrl = sanitizeBaseName(removeExt(extractFileNameFromUrl(url)));
  if (fromUrl) {
    return fromUrl;
  }

  return `image_${String(order).padStart(4, "0")}`;
}

function sanitizeBaseName(text) {
  return String(text || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 140);
}

function sanitizeExt(ext) {
  const cleaned = String(ext || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!cleaned) {
    return "";
  }
  if (cleaned.length < 2 || cleaned.length > 5) {
    return "";
  }
  return cleaned;
}

function inferExtFromUrl(url) {
  const fileName = extractFileNameFromUrl(url);
  const match = fileName.match(/\.([a-zA-Z0-9]{2,5})$/);
  return match ? match[1].toLowerCase() : "";
}

function extractFileNameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const raw = pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(raw);
  } catch (_error) {
    return "";
  }
}

function removeExt(fileName) {
  return String(fileName || "").replace(/\.[a-zA-Z0-9]{2,5}$/, "");
}

function startDownload(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename,
        conflictAction: "uniquify",
        saveAs: false
      },
      (downloadId) => {
        const startError = chrome.runtime.lastError;
        if (startError || typeof downloadId !== "number") {
          reject(new Error(startError?.message || "无法开始下载"));
          return;
        }
        resolve(downloadId);
      }
    );
  });
}
