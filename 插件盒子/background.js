let isDownloading = false;
const OCR_SAMPLE_ORIGIN = "https://metis-aione-test.zhenguanyu.com";
const OCR_SAMPLE_PATH_PREFIX = "/metis-aione-eval/samples/";
const OCR_VISIBILITY_MESSAGE = "ocr-box-helper-visibility";

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  toggleToolbox(tab.id);
});

function toggleToolbox(tabId) {
  chrome.scripting.executeScript(
    {
      target: { tabId },
      files: ["content.js"]
    },
    () => {
      const injectError = chrome.runtime.lastError;
      if (injectError) return;

      chrome.tabs.sendMessage(tabId, { type: "TOOLBOX_TOGGLE" }, () => {
        void chrome.runtime.lastError;
      });
    }
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === "TOOLBOX_DOWNLOAD_LINKS") {
    (async () => {
      try {
        const result = await downloadLinks(message.items || message.links || [], message.taskId || "");
        sendResponse(result);
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || "下载失败" });
      }
    })();
    return true;
  }

  if (message.type === "TOOLBOX_SET_OCR_VISIBILITY") {
    (async () => {
      try {
        const result = await setOcrToolVisibility(
          sender.tab,
          Boolean(message.visible)
        );
        sendResponse(result);
      } catch (error) {
        sendResponse({
          ok: false,
          error: error?.message || "无法呼出字框标注。"
        });
      }
    })();
    return true;
  }

  return false;
});

function isSupportedOcrPage(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === OCR_SAMPLE_ORIGIN &&
      parsed.pathname.startsWith(OCR_SAMPLE_PATH_PREFIX)
    );
  } catch (_error) {
    return false;
  }
}

function sendOcrVisibilityMessage(tabId, action, visible) {
  return chrome.tabs.sendMessage(tabId, {
    type: OCR_VISIBILITY_MESSAGE,
    action,
    ...(typeof visible === "boolean" ? { visible } : {})
  });
}

async function injectOcrTool(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["ocr_box_tool.css"]
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["ocr_box_core.js"]
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["ocr_box_tool.js"]
  });
}

async function setOcrToolVisibility(tab, visible) {
  if (!tab?.id || !isSupportedOcrPage(tab.url)) {
    return {
      ok: false,
      error: "字框标注仅支持算法评测系统的作文正文单字框样本页。"
    };
  }

  let current;
  try {
    current = await sendOcrVisibilityMessage(tab.id, "get");
  } catch (_error) {
    current = null;
  }

  if (!current || typeof current.visible !== "boolean") {
    await injectOcrTool(tab.id);
  }

  const result = await sendOcrVisibilityMessage(tab.id, "set", visible);
  return {
    ok: true,
    visible: result?.visible ?? visible
  };
}

async function downloadLinks(rawItems, taskId) {
  if (isDownloading) {
    throw new Error("已有下载任务进行中。");
  }
  isDownloading = true;

  try {
    const items = normalizeItems(rawItems);
    if (!items.length) {
      throw new Error("没有可下载的图片。");
    }

    const downloaded = [];
    const failed = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      try {
        const id = await startDownload(item.url, buildFileName(item, i + 1));
        downloaded.push({ index: i + 1, downloadId: id, url: item.url });
      } catch (error) {
        failed.push({ index: i + 1, url: item.url, error: error?.message || "失败" });
      }
      sendDownloadProgress(taskId, i + 1, items.length, downloaded.length, failed.length);
    }

    return {
      ok: downloaded.length > 0,
      total: items.length,
      successCount: downloaded.length,
      failCount: failed.length,
      failed
    };
  } finally {
    isDownloading = false;
  }
}

function sendDownloadProgress(taskId, current, total, successCount, failCount) {
  if (!taskId) return;
  chrome.runtime.sendMessage(
    {
      type: "TOOLBOX_DOWNLOAD_PROGRESS",
      taskId,
      current,
      total,
      successCount,
      failCount
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const seen = new Set();
  const items = [];

  for (const raw of rawItems) {
    const url = typeof raw === "string" ? raw : raw?.url;
    if (!isImageUrl(url) || seen.has(url)) continue;
    seen.add(url);
    items.push({
      url,
      id: typeof raw === "object" ? raw.id || "" : "",
      fileName: typeof raw === "object" ? raw.fileName || raw.filename || "" : ""
    });
  }

  return items;
}

function isImageUrl(url) {
  return /^https?:\/\//i.test(String(url || "")) &&
    /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif)(?:[?#].*)?$/i.test(String(url || ""));
}

function buildFileName(item, order) {
  const ext = inferExtFromUrl(item.url) || inferExtFromName(item.fileName) || "jpg";
  const fromId = sanitizeBaseName(item.id);
  if (fromId) return `${fromId}.${ext}`;

  const fromItem = sanitizeFileName(item.fileName);
  if (fromItem) return fromItem;

  const fromUrl = sanitizeFileName(extractFileNameFromUrl(item.url));
  if (fromUrl) return fromUrl;

  return `image_${String(order).padStart(4, "0")}.jpg`;
}

function extractFileNameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
  } catch (_error) {
    return "";
  }
}

function sanitizeFileName(name) {
  return String(name || "")
    .trim()
    .replace(/[\\:*?"<>|]+/g, "_")
    .replace(/^\/+/, "")
    .slice(0, 160);
}

function sanitizeBaseName(name) {
  return String(name || "")
    .trim()
    .replace(/\.[a-zA-Z0-9]{2,5}$/, "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 140);
}

function inferExtFromUrl(url) {
  return inferExtFromName(extractFileNameFromUrl(url));
}

function inferExtFromName(name) {
  const match = String(name || "").match(/\.([a-zA-Z0-9]{2,5})(?:[?#].*)?$/);
  return match ? match[1].toLowerCase() : "";
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
        const error = chrome.runtime.lastError;
        if (error || typeof downloadId !== "number") {
          reject(new Error(error?.message || "无法开始下载"));
          return;
        }
        resolve(downloadId);
      }
    );
  });
}
