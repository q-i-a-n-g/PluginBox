const PAGE_SIZE = 20;
const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif)(?:[?#].*)?$/i;

let links = [];
let page = 1;
const cache = new Map();

const input = document.getElementById("inputText");
const counter = document.getElementById("inputCounter");
const statusEl = document.getElementById("status");
const results = document.getElementById("results");
const list = document.getElementById("list");
const summary = document.getElementById("summary");
const pageInfo = document.getElementById("pageInfo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const jumpInput = document.getElementById("jumpInput");
const jumpBtn = document.getElementById("jumpBtn");
const downloadBtn = document.getElementById("downloadBtn");
const exportBtn = document.getElementById("exportBtn");
let activeDownloadTaskId = "";

document.getElementById("previewBtn").addEventListener("click", previewLinks);
downloadBtn.addEventListener("click", downloadAll);
exportBtn.addEventListener("click", exportExcel);
document.getElementById("clearBtn").addEventListener("click", clearAll);
prevBtn.addEventListener("click", () => goPage(page - 1));
nextBtn.addEventListener("click", () => goPage(page + 1));
jumpBtn.addEventListener("click", jumpToPage);
jumpInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") jumpToPage();
});
input.addEventListener("input", updateCounter);
input.addEventListener("paste", () => requestAnimationFrame(() => {
  input.value = trimTrailingBlankLines(input.value);
  updateCounter();
}));

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "TOOLBOX_DOWNLOAD_PROGRESS") return;
  if (message.taskId !== activeDownloadTaskId) return;
  const failed = message.failCount ? `，失败 ${message.failCount}` : "";
  showStatus(`下载中 ${message.current} / ${message.total}${failed}`, "info");
});

function trimTrailingBlankLines(text) {
  return String(text || "").replace(/(?:\r?\n\s*)+$/g, "");
}

function updateCounter() {
  const text = trimTrailingBlankLines(input.value);
  counter.textContent = `${text ? text.split(/\r?\n/).length : 0} 行`;
}

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status show ${type}`;
}

function parseDirectImageLinks(text) {
  const seen = new Set();
  const out = [];

  for (const line of trimTrailingBlankLines(text).split(/\r?\n/)) {
    const link = line.trim().replace(/&amp;/g, "&");
    if (!link || seen.has(link) || !IMAGE_EXT_RE.test(link)) continue;
    try {
      const parsed = new URL(link);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    } catch (_error) {
      continue;
    }
    seen.add(link);
    out.push(link);
  }
  return out;
}

function previewLinks() {
  input.value = trimTrailingBlankLines(input.value);
  updateCounter();
  links = parseDirectImageLinks(input.value);
  page = 1;
  cache.clear();
  if (!links.length) {
    reset();
    showStatus("请输入有效的图片链接，每行一个。", "error");
    return;
  }
  results.classList.add("show");
  downloadBtn.disabled = false;
  exportBtn.disabled = false;
  render();
  showStatus(`已加载 ${links.length} 条图片链接。`, "success");
}

function reset() {
  list.innerHTML = "";
  results.classList.remove("show");
  downloadBtn.disabled = true;
  exportBtn.disabled = true;
  links = [];
  page = 1;
  cache.clear();
}

function totalPages() {
  return Math.max(1, Math.ceil(links.length / PAGE_SIZE));
}

function goPage(nextPage) {
  page = Math.min(Math.max(1, nextPage), totalPages());
  render();
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function render() {
  const start = (page - 1) * PAGE_SIZE;
  const pageLinks = links.slice(start, start + PAGE_SIZE);
  summary.textContent = `${links.length} 条链接，当前 ${start + 1}-${start + pageLinks.length}`;
  pageInfo.textContent = `${page} / ${totalPages()}`;
  jumpInput.max = String(totalPages());
  jumpInput.value = String(page);
  prevBtn.disabled = page <= 1;
  nextBtn.disabled = page >= totalPages();
  list.innerHTML = "";
  pageLinks.forEach((link, i) => list.appendChild(createItem(link, start + i)));
  preload(page + 1);
}

function jumpToPage() {
  const target = Number.parseInt(jumpInput.value, 10);
  if (!Number.isFinite(target)) {
    showStatus("请输入页码。", "error");
    return;
  }
  goPage(target);
}

function createItem(link, index) {
  const item = document.createElement("article");
  item.className = "item";
  const meta = document.createElement("div");
  meta.className = "meta";
  const idx = document.createElement("div");
  idx.className = "idx";
  idx.textContent = `#${index + 1}`;
  const a = document.createElement("a");
  a.href = link;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = link;
  const stage = document.createElement("div");
  stage.className = "stage";
  const img = document.createElement("img");
  img.src = link;
  img.alt = `第 ${index + 1} 张`;
  img.loading = index % PAGE_SIZE < 3 ? "eager" : "lazy";
  img.decoding = "async";
  img.addEventListener("error", () => {
    stage.innerHTML = '<span class="failed">图片加载失败</span>';
  });
  meta.append(idx, a);
  stage.appendChild(img);
  item.append(meta, stage);
  return item;
}

function preload(nextPage) {
  if (nextPage < 1 || nextPage > totalPages()) return;
  const start = (nextPage - 1) * PAGE_SIZE;
  for (const link of links.slice(start, start + PAGE_SIZE)) {
    if (cache.has(link)) continue;
    const img = new Image();
    img.decoding = "async";
    img.src = link;
    cache.set(link, img);
  }
}

function extractFileName(url) {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "") || "download";
  } catch (_error) {
    return "download";
  }
}

async function downloadAll() {
  if (!links.length) {
    showStatus("没有可下载的图片。", "error");
    return;
  }
  downloadBtn.disabled = true;
  activeDownloadTaskId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  showStatus(`开始下载 ${links.length} 张图片...`, "info");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "TOOLBOX_DOWNLOAD_LINKS",
      taskId: activeDownloadTaskId,
      items: links.map((url) => ({ url, fileName: extractFileName(url) }))
    });
    if (!response?.ok) throw new Error(response?.error || "下载失败");
    const tail = response.failCount ? `，失败 ${response.failCount} 张` : "";
    showStatus(`已完成 ${response.successCount} 个下载${tail}。`, "success");
  } catch (error) {
    showStatus(error?.message || "下载失败。", "error");
  } finally {
    activeDownloadTaskId = "";
    downloadBtn.disabled = false;
  }
}

function exportExcel() {
  if (!links.length) {
    showStatus("没有可导出的链接。", "error");
    return;
  }
  const rows = [["序号", "链接地址", "文件名"]].concat(
    links.map((link, index) => [index + 1, link, extractFileName(link)])
  );
  const tableRows = rows.map((row) => (
    `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`
  )).join("");
  const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body><table>${tableRows}</table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  saveBlob(blob, `图片链接_${timestamp()}.xls`);
  showStatus(`已导出 ${links.length} 条链接。`, "success");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function timestamp() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
}

function saveBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}

function clearAll() {
  input.value = "";
  statusEl.className = "status";
  updateCounter();
  reset();
}

updateCounter();
