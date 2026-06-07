const TARGET_URL_PREFIX = "https://mapi.yuanfudao.com/evaluation/#/admin/evaluation/homework-correct-viewing/";

function checkUrlAndToggleButton() {
  const currentUrl = window.location.href;
  let btn = document.getElementById("sequential-download-btn");

  if (currentUrl.startsWith(TARGET_URL_PREFIX)) {
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "sequential-download-btn";
      btn.innerText = "顺序下载";
      Object.assign(btn.style, {
        position: "fixed",
        right: "0",
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: "9999",
        backgroundColor: "#28a745",
        color: "white",
        border: "none",
        padding: "10px 20px",
        borderRadius: "5px 0 0 5px",
        cursor: "pointer",
        fontSize: "14px",
        boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
        transition: "background-color 0.3s",
        fontWeight: "bold"
      });
      btn.onclick = startDownload;
      document.body.appendChild(btn);
    }
  } else {
    if (btn) {
      btn.remove();
    }
  }
}

// Observe URL changes for SPA
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    checkUrlAndToggleButton();
  }
}).observe(document, { subtree: true, childList: true });

// Initial check
checkUrlAndToggleButton();

async function startDownload() {
  const btn = document.getElementById("sequential-download-btn");
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  btn.style.backgroundColor = "#6c757d";
  btn.innerText = "正在下载...";

  try {
    const result = await extractOrderedImagesFromPage();
    if (!result.ok) {
      alert(result.error || "提取图片失败");
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "startOrderedDownload",
      items: result.items
    });

    if (!response?.ok) {
      alert(response?.error || "下载失败");
    }
  } catch (e) {
    alert("操作异常: " + e.message);
  } finally {
    btn.disabled = false;
    btn.style.backgroundColor = "#28a745";
    btn.innerText = "顺序下载";
  }
}

async function extractOrderedImagesFromPage() {
  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function isUsefulImageUrl(url) {
    if (!url || typeof url !== "string") {
      return false;
    }
    if (!/^https?:\/\//i.test(url) || /^data:/i.test(url)) {
      return false;
    }
    if (!/\.(jpg|jpeg|png|webp|bmp|gif|heic|heif)(\?|$)/i.test(url)) {
      return false;
    }
    return true;
  }

  function parseContextFromHash() {
    const match = (location.hash || "").match(
      /^#\/admin\/evaluation\/homework-correct-viewing\/([^/?#]+)\/([^/?#]+)/
    );
    if (!match) {
      return null;
    }
    return {
      homeworkId: match[1],
      studentId: match[2]
    };
  }

  function inferExt(url) {
    try {
      const pathname = new URL(url, location.href).pathname;
      const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
      return match ? match[1].toLowerCase() : "";
    } catch (_error) {
      return "";
    }
  }

  function getOrderedIdListFromText() {
    const entries = [];
    const snapshot = document.evaluate(
      "//text()[contains(., '图片ID')]",
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let i = 0; i < snapshot.snapshotLength; i += 1) {
      const node = snapshot.snapshotItem(i);
      if (!node || !node.parentElement) {
        continue;
      }
      const text = normalizeText(node.nodeValue || "");
      const match = text.match(/图片ID[:：]\s*([A-Za-z0-9_-]+)/);
      if (!match) {
        continue;
      }
      const rect = node.parentElement.getBoundingClientRect();
      entries.push({
        id: match[1],
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX
      });
    }

    entries.sort((a, b) => a.top - b.top || a.left - b.left);
    const dedup = [];
    const seen = new Set();
    for (const entry of entries) {
      if (seen.has(entry.id)) {
        continue;
      }
      seen.add(entry.id);
      dedup.push(entry.id);
    }
    return dedup;
  }

  function collectOrderedItemsFromApiData(data) {
    const rawItems = [];
    const idKeys = ["imageId", "imgId", "id", "fileId", "resourceId", "materialId"];
    const nameKeys = ["fileName", "filename", "name", "originName", "originalFileName"];

    function pickId(obj) {
      for (const key of idKeys) {
        const val = obj[key];
        if (typeof val === "string" && /^[A-Za-z0-9_-]{6,}$/.test(val)) {
          return val;
        }
      }
      return "";
    }

    function pickName(obj) {
      for (const key of nameKeys) {
        const val = obj[key];
        if (typeof val === "string" && val.trim()) {
          return val.trim();
        }
      }
      return "";
    }

    function walk(value) {
      if (!value) {
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          walk(item);
        }
        return;
      }
      if (typeof value !== "object") {
        return;
      }

      const imageUrl = typeof value.imageUrl === "string" ? value.imageUrl : "";
      if (isUsefulImageUrl(imageUrl)) {
        rawItems.push({
          id: pickId(value),
          url: imageUrl,
          ext: inferExt(imageUrl),
          originalFileName: pickName(value)
        });
      }

      for (const child of Object.values(value)) {
        walk(child);
      }
    }

    walk(data);

    const dedupByUrl = [];
    const seen = new Set();
    for (const item of rawItems) {
      if (!item.url || seen.has(item.url)) {
        continue;
      }
      seen.add(item.url);
      dedupByUrl.push(item);
    }

    return dedupByUrl;
  }

  async function getItemsFromApi() {
    const context = parseContextFromHash();
    if (!context) {
      return { items: [], warning: "URL hash 中未识别到作业参数，接口提取跳过。" };
    }

    const apiUrl = `/metis-gnosis-evaluation/api/internal/homework/background/v2/${encodeURIComponent(
      context.homeworkId
    )}/${encodeURIComponent(context.studentId)}?answerSheet=false`;

    const response = await fetch(apiUrl, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`接口请求失败: ${response.status}`);
    }

    const data = await response.json();
    const items = collectOrderedItemsFromApiData(data);
    return { items };
  }

  function getItemsFromDomImageOrder() {
    const imgs = Array.from(document.querySelectorAll("img"));
    const candidates = [];
    for (const img of imgs) {
      const url = img.currentSrc || img.src || "";
      if (!isUsefulImageUrl(url)) {
        continue;
      }
      const rect = img.getBoundingClientRect();
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      if (area < 2500) {
        continue;
      }
      candidates.push({
        url,
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        ext: inferExt(url)
      });
    }

    candidates.sort((a, b) => a.top - b.top || a.left - b.left);
    const dedup = [];
    const seen = new Set();
    for (const candidate of candidates) {
      if (seen.has(candidate.url)) {
        continue;
      }
      seen.add(candidate.url);
      dedup.push({
        id: "",
        url: candidate.url,
        ext: candidate.ext,
        originalFileName: ""
      });
    }
    return dedup;
  }

  try {
    const warnings = [];
    const orderedIdsFromText = getOrderedIdListFromText();

    try {
      const apiResult = await getItemsFromApi();
      const apiItems = apiResult.items || [];
      if (apiResult.warning) {
        warnings.push(apiResult.warning);
      }
      if (apiItems.length > 0) {
        for (let i = 0; i < apiItems.length; i += 1) {
          if (!apiItems[i].id && orderedIdsFromText[i]) {
            apiItems[i].id = orderedIdsFromText[i];
          }
        }
        return {
          ok: true,
          strategy: "api",
          warnings,
          items: apiItems
        };
      }
    } catch (error) {
      warnings.push(`接口提取失败，已切换到 DOM 兜底：${error?.message || "unknown"}`);
    }

    const domItems = getItemsFromDomImageOrder();
    for (let i = 0; i < domItems.length; i += 1) {
      if (!domItems[i].id && orderedIdsFromText[i]) {
        domItems[i].id = orderedIdsFromText[i];
      }
    }
    if (domItems.length > 0) {
      return {
        ok: true,
        strategy: "dom",
        warnings,
        items: domItems
      };
    }

    return {
      ok: false,
      error: "接口与 DOM 都未提取到图片。请先滚动页面让图片加载完成后重试。"
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "页面提取失败"
    };
  }
}
