(() => {
  if (window.__PLUGIN_TOOLBOX_LOADED__) {
    return;
  }
  window.__PLUGIN_TOOLBOX_LOADED__ = true;

  const ROOT_ID = "__plugin_toolbox_root";
  const STORAGE_KEY = "plugin_toolbox_eval_config_v1";
  const UI_STATE_KEY = "plugin_toolbox_ui_state_v1";
  const UI_STATE_SCHEMA_VERSION = 3;
  const OCR_VISIBILITY_MESSAGE = "TOOLBOX_SET_OCR_VISIBILITY";
  const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif)(?:[?#].*)?$/i;
  const siteRules = globalThis.PluginToolboxSiteRules;
  if (!siteRules) throw new Error("插件盒子站点规则未加载");

  const DEFAULT_CONFIG = {
    result: true,
    resultAnswer: "一致",
    resultSolvable: "是",
    handwriting: true,
    handwritingValue: "一致",
    score: true,
    scoreValue: "一致",
    scoreBorderValue: "对",
    scoreSolvableValue: "是",
    fixed: true,
    fixedValue: "对",
    fixedSolvableValue: "是",
    answer: true,
    answerValue: "对",
    question: true,
    questionValue: "对"
  };
  const DEFAULT_UI_STATE = {
    schemaVersion: UI_STATE_SCHEMA_VERSION,
    tools: {
      images: true,
      eval: true,
      ocr: false
    }
  };

  let root;
  let panel;
  let pageButton;
  let pageButtonResetTimer = 0;
  let evalButton;
  let evalPanel;
  let lastRouteSignature = "";
  let routeSyncing = false;
  let contentSyncTimer = 0;
  let currentConfig = { ...DEFAULT_CONFIG };
  let uiState = structuredClone(DEFAULT_UI_STATE);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "TOOLBOX_TOGGLE") {
      toggleToolbox();
      return false;
    }

    if (message?.type === "TOOLBOX_TOGGLE_TOOL") {
      (async () => {
        try {
          if (!["images", "eval", "ocr"].includes(message.tool)) {
            throw new Error("未知工具。");
          }
          await ensureUI();
          await setToolVisible(message.tool, !uiState.tools[message.tool]);
          hideMainPanel();
          sendResponse({ ok: true, visible: uiState.tools[message.tool] });
        } catch (error) {
          sendResponse({ ok: false, error: error?.message || "操作失败。" });
        }
      })();
      return true;
    }

    if (message?.type === "TOOLBOX_GET_SUPPORT") {
      sendResponse({
        ok: true,
        supported: isToolSupportedOnPage(message.tool),
        error: siteRules.unavailableMessage(message.tool)
      });
      return false;
    }

    return false;
  });

  async function toggleToolbox() {
    await ensureUI();
    const hidden = root.classList.contains("ptb-hidden");
    if (hidden) {
      root.classList.remove("ptb-hidden");
      panel.classList.add("ptb-panel-open");
    } else {
      root.classList.add("ptb-hidden");
      panel.classList.remove("ptb-panel-open");
    }
  }

  async function ensureUI() {
    if (root) return;
    await loadConfig();
    await loadUiState();
    injectStyles();

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "ptb-hidden";

    panel = document.createElement("section");
    panel.className = "ptb-panel";
    panel.innerHTML = buildPanelHtml();

    pageButton = createFloatingButton("ptb-page-float", "下载", "顺序下载（线上作业）");
    evalButton = createFloatingButton("ptb-eval-float", "评测", "评测");
    evalPanel = document.createElement("section");
    evalPanel.className = "ptb-eval-panel ptb-float-hidden";
    evalPanel.innerHTML = buildEvalPanelHtml();

    root.append(panel, pageButton, evalButton, evalPanel);
    document.body.appendChild(root);

    bindShellEvents();
    bindFloatingEvents();
    bindEvalEvents();
    renderEvalConfig();
    updateToolAvailability();
    await applyToolVisibility();
  }

  function createFloatingButton(id, text, title) {
    const button = document.createElement("button");
    button.id = id;
    button.className = "ptb-floating-tool ptb-float-hidden";
    button.type = "button";
    button.textContent = text;
    button.title = title;
    return button;
  }

  function injectStyles() {
    if (document.getElementById("__plugin_toolbox_style")) return;
    const style = document.createElement("style");
    style.id = "__plugin_toolbox_style";
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        right: 18px;
        top: 15vh;
        z-index: 2147483647;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
        color: #e5e7eb;
      }
      #${ROOT_ID}.ptb-hidden .ptb-panel {
        display: none;
      }
      .ptb-panel {
        display: none;
        position: absolute;
        right: 0;
        top: 0;
        width: min(360px, calc(100vw - 96px));
        max-height: min(760px, calc(100vh - 32px));
        overflow: hidden;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: #1b1d20;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.42);
      }
      .ptb-panel.ptb-panel-open {
        display: block;
      }
      .ptb-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 18px 20px 8px;
      }
      .ptb-title {
        font-size: 18px;
        font-weight: 700;
        color: #f8fafc;
      }
      .ptb-head-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ptb-help-btn {
        min-height: 30px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.06);
        color: #dbeafe;
        cursor: pointer;
        padding: 0 9px;
        font-size: 12px;
        font-weight: 700;
      }
      .ptb-help-btn:hover,
      .ptb-icon-btn:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .ptb-icon-btn {
        width: 30px;
        height: 30px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.06);
        color: #cbd5e1;
        cursor: pointer;
      }
      .ptb-tabs {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        padding: 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .ptb-tab {
        min-height: 34px;
        border: 0;
        border-radius: 8px;
        color: #aab4c3;
        background: rgba(255, 255, 255, 0.06);
        cursor: pointer;
        font-weight: 700;
        font-size: 13px;
      }
      .ptb-tab.ptb-active {
        color: #fff;
        background: linear-gradient(135deg, #0ea5e9, #2563eb);
      }
      .ptb-body {
        max-height: calc(min(760px, 100vh - 32px) - 60px);
        overflow: auto;
        padding: 10px 18px 22px;
      }
      .ptb-app-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 18px 12px;
        padding: 10px 0 2px;
      }
      .ptb-tool-card {
        min-width: 0;
        height: 82px;
        border: 0;
        border-radius: 14px;
        background: transparent;
        color: #e5e7eb;
        cursor: pointer;
        display: grid;
        grid-template-rows: 32px 34px;
        place-items: center;
        align-content: center;
        gap: 7px;
      }
      .ptb-tool-card:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .ptb-tool-card:disabled {
        cursor: not-allowed;
        opacity: 0.42;
      }
      .ptb-tool-card:disabled:hover {
        background: transparent;
      }
      .ptb-tool-icon {
        width: 32px;
        height: 32px;
        border-radius: 9px;
        display: grid;
        place-items: center;
        color: #fff;
        font-size: 16px;
        font-weight: 800;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
      }
      .ptb-tool-icon.links {
        background: conic-gradient(from 180deg, #22c55e, #38bdf8, #f59e0b, #22c55e);
      }
      .ptb-tool-icon.images {
        background: linear-gradient(135deg, #22c55e, #0ea5e9);
      }
      .ptb-tool-icon.eval {
        background: linear-gradient(135deg, #f43f5e, #8b5cf6);
      }
      .ptb-tool-icon.ocr {
        background: linear-gradient(135deg, #2563eb 0%, #facc15 50%, #06b6d4 100%);
      }
      .ptb-tool-icon.weekly {
        background: linear-gradient(135deg, #f59e0b, #16a34a);
      }
      .ptb-tool-name {
        width: 100%;
        color: #d8dee8;
        font-size: 13px;
        line-height: 1.25;
        text-align: center;
        min-height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .ptb-floating-tool {
        position: fixed;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2147483647;
        min-width: 76px;
        min-height: 44px;
        border: 0;
        border-radius: 8px 0 0 8px;
        color: #fff;
        background: linear-gradient(135deg, #22c55e, #16a34a);
        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.25);
        cursor: pointer;
        font-weight: 800;
      }
      #ptb-page-float {
        right: 35px;
        top: 50%;
        width: 50px;
        height: 50px;
        min-width: 50px;
        min-height: 50px;
        border-radius: 25px;
      }
      #ptb-eval-float {
        right: 35px;
        top: 12%;
        width: 50px;
        height: 50px;
        min-width: 50px;
        min-height: 50px;
        border-radius: 25px;
        background: #52c41a;
      }
      .ptb-float-hidden {
        display: none;
      }
      .ptb-eval-panel {
        position: fixed;
        right: 95px;
        top: 10vh;
        width: min(320px, calc(100vw - 108px));
        max-height: min(680px, calc(100vh - 32px));
        overflow: auto;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(17, 19, 24, 0.98);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.42);
      }
      #ptb-eval-run {
        width: 100%;
        min-height: 38px;
      }
      .ptb-view {
        display: none;
      }
      .ptb-view.ptb-active {
        display: block;
      }
      .ptb-muted {
        color: #94a3b8;
        font-size: 12px;
        line-height: 1.5;
        margin-bottom: 10px;
      }
      .ptb-label {
        display: block;
        color: #7dd3fc;
        font-weight: 700;
        font-size: 12px;
        margin-bottom: 6px;
      }
      .ptb-textarea {
        width: 100%;
        min-height: 150px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(0, 0, 0, 0.34);
        color: #e5e7eb;
        padding: 10px;
        resize: vertical;
        font: 12px/1.5 "SF Mono", Consolas, monospace;
      }
      .ptb-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 10px 0;
      }
      .ptb-btn {
        min-height: 34px;
        border: 0;
        border-radius: 8px;
        padding: 0 12px;
        font-weight: 700;
        color: #fff;
        background: #334155;
        cursor: pointer;
      }
      .ptb-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .ptb-primary {
        background: linear-gradient(135deg, #22c55e, #16a34a);
      }
      .ptb-blue {
        background: linear-gradient(135deg, #38bdf8, #2563eb);
      }
      .ptb-status {
        display: none;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
        line-height: 1.45;
        margin-top: 8px;
      }
      .ptb-status.ptb-show {
        display: block;
      }
      .ptb-status.info {
        color: #bae6fd;
        background: rgba(56, 189, 248, 0.12);
      }
      .ptb-status.success {
        color: #86efac;
        background: rgba(34, 197, 94, 0.12);
      }
      .ptb-status.error {
        color: #fca5a5;
        background: rgba(248, 113, 113, 0.12);
      }
      .ptb-list {
        display: grid;
        gap: 8px;
        margin-top: 8px;
      }
      .ptb-link-row {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr);
        gap: 8px;
        align-items: start;
        padding: 8px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.045);
      }
      .ptb-link-row img {
        width: 44px;
        height: 44px;
        object-fit: cover;
        border-radius: 6px;
        background: #0b0d10;
      }
      .ptb-link-row a {
        color: #bae6fd;
        font-size: 12px;
        line-height: 1.45;
        word-break: break-all;
        text-decoration: none;
      }
      .ptb-grid-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 128px;
        gap: 8px;
        align-items: center;
        margin-bottom: 8px;
      }
      .ptb-check {
        display: flex;
        gap: 8px;
        align-items: center;
        color: #d1d5db;
        font-size: 13px;
      }
      .ptb-select {
        width: 100%;
        min-height: 30px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.13);
        background: #1f2937;
        color: #e5e7eb;
      }
      .ptb-sub {
        padding-left: 22px;
        color: #aab4c3;
      }
      @media (max-width: 560px) {
        #${ROOT_ID} {
          right: 10px;
          top: 12px;
        }
        .ptb-panel {
          right: 0;
          top: 58px;
          width: calc(100vw - 20px);
        }
        .ptb-eval-panel {
          right: 0;
          top: 58px;
          width: calc(100vw - 20px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function buildPanelHtml() {
    return `
      <div class="ptb-head">
        <div class="ptb-title">插件盒子</div>
        <div class="ptb-head-actions">
          <button class="ptb-help-btn" type="button" data-ptb-help title="打开帮助">帮助</button>
          <button class="ptb-icon-btn" type="button" data-ptb-hide title="隐藏">x</button>
        </div>
      </div>
      <div class="ptb-body">
        <div class="ptb-app-grid">
          <button class="ptb-tool-card" type="button" data-ptb-tool="links">
            <span class="ptb-tool-icon links">L</span>
            <span class="ptb-tool-name">链接<br>预览/下载</span>
          </button>
          <button class="ptb-tool-card" type="button" data-ptb-tool="images">
            <span class="ptb-tool-icon images">↓</span>
            <span class="ptb-tool-name">顺序下载<br>（线上作业）</span>
          </button>
          <button class="ptb-tool-card" type="button" data-ptb-tool="eval">
            <span class="ptb-tool-icon eval">✓</span>
            <span class="ptb-tool-name">评测</span>
          </button>
          <button class="ptb-tool-card" type="button" data-ptb-tool="weekly">
            <span class="ptb-tool-icon weekly">W</span>
            <span class="ptb-tool-name">周报工具</span>
          </button>
          <button class="ptb-tool-card" type="button" data-ptb-tool="ocr">
            <span class="ptb-tool-icon ocr">Z</span>
            <span class="ptb-tool-name">字框标注</span>
          </button>
        </div>
      </div>
    `;
  }

  function buildEvalPanelHtml() {
    return `
      <div class="ptb-head">
        <div class="ptb-title">评测</div>
        <button class="ptb-icon-btn" type="button" data-ptb-eval-close title="收起">x</button>
      </div>
      <div class="ptb-body">
        <div class="ptb-muted">选择评测项后运行。</div>
        <div id="ptb-eval-form"></div>
        <div class="ptb-actions">
          <button class="ptb-btn ptb-primary" type="button" id="ptb-eval-run">开始评测</button>
        </div>
        <div class="ptb-status" id="ptb-eval-status"></div>
      </div>
    `;
  }

  function bindShellEvents() {
    panel.querySelector("[data-ptb-help]").addEventListener("click", () => {
      window.open(chrome.runtime.getURL("README.pdf"), "_blank", "noopener");
      hideMainPanel();
    });
    panel.querySelector("[data-ptb-hide]").addEventListener("click", () => {
      root.classList.add("ptb-hidden");
      panel.classList.remove("ptb-panel-open");
    });
    panel.querySelectorAll("[data-ptb-tool]").forEach((tool) => {
      tool.addEventListener("click", async () => {
        try {
          await openTool(tool.dataset.ptbTool);
        } catch (error) {
          showToast(error?.message || "无法呼出工具。", "error");
        }
      });
    });
    evalPanel.querySelector("[data-ptb-eval-close]").addEventListener("click", () => {
      evalPanel.classList.add("ptb-float-hidden");
    });
  }

  async function openTool(name) {
    if (name === "links") {
      window.open(chrome.runtime.getURL("link_tool.html"), "_blank", "noopener");
      hideMainPanel();
      return;
    }
    if (name === "weekly") {
      window.open(chrome.runtime.getURL("weekly_report.html"), "_blank", "noopener");
      hideMainPanel();
      return;
    }
    if (name === "images") {
      await setToolVisible("images", !uiState.tools.images);
      hideMainPanel();
      return;
    }
    if (name === "eval") {
      await setToolVisible("eval", !uiState.tools.eval);
      hideMainPanel();
      return;
    }
    if (name === "ocr") {
      await setToolVisible("ocr", !uiState.tools.ocr);
      hideMainPanel();
    }
  }

  function hideMainPanel() {
    root.classList.add("ptb-hidden");
    panel.classList.remove("ptb-panel-open");
  }

  function updateToolAvailability() {
    if (!panel) return;
    for (const name of ["images", "eval", "ocr"]) {
      const button = panel.querySelector(`[data-ptb-tool="${name}"]`);
      if (!button) continue;
      const supported = isToolSupportedOnPage(name);
      button.disabled = !supported;
      button.title = supported ? "" : siteRules.unavailableMessage(name);
    }
  }

  function isToolSupportedOnPage(name) {
    return siteRules.isToolSupported(name, location.href, document);
  }

  function bindFloatingEvents() {
    pageButton.addEventListener("click", startPageDownloadFromFloat);
    evalButton.addEventListener("click", () => {
      evalPanel.classList.toggle("ptb-float-hidden");
    });
  }

  async function startPageDownloadFromFloat() {
    if (pageButton.disabled) return;
    clearPageButtonFeedback();
    pageButton.disabled = true;
    pageButton.textContent = "提取中";
    let feedback = "";
    let feedbackTitle = "";
    try {
      const result = await extractOrderedImagesFromPage();
      if (!result.ok) {
        feedback = "未提取";
        feedbackTitle = result.error || "提取失败。";
        return;
      }
      pageButton.textContent = "下载中";
      const response = await sendDownload(result.items, null, { quiet: true });
      if (!response?.ok) {
        throw new Error(response?.error || "下载失败。");
      }
      feedback = response.failCount ? "部分完成" : "已完成";
      feedbackTitle = response.failCount
        ? `已完成 ${response.successCount} 个下载，失败 ${response.failCount} 张。`
        : `已开始 ${response.successCount} 个下载。`;
    } catch (error) {
      feedback = "失败";
      feedbackTitle = error?.message || "操作失败。";
    } finally {
      pageButton.disabled = false;
      showPageButtonFeedback(feedback || "下载", feedbackTitle);
    }
  }

  async function sendDownload(items, statusId, options = {}) {
    if (!options.quiet) {
      reportStatus(statusId, `开始下载 ${items.length} 张图片...`, "info");
    }
    const response = await chrome.runtime.sendMessage({
      type: "TOOLBOX_DOWNLOAD_LINKS",
      items
    });
    if (!response?.ok) {
      if (!options.quiet) {
        reportStatus(statusId, response?.error || "下载失败。", "error");
      }
      return response;
    }
    const tail = response.failCount ? `，失败 ${response.failCount} 张` : "";
    if (!options.quiet) {
      reportStatus(statusId, `已完成 ${response.successCount} 个下载${tail}。`, "success");
    }
    return response;
  }

  function clearPageButtonFeedback() {
    if (pageButtonResetTimer) {
      window.clearTimeout(pageButtonResetTimer);
      pageButtonResetTimer = 0;
    }
    pageButton.title = "顺序下载（线上作业）";
  }

  function showPageButtonFeedback(text, title) {
    pageButton.textContent = text;
    pageButton.title = title || "顺序下载（线上作业）";
    if (text === "下载") return;
    pageButtonResetTimer = window.setTimeout(() => {
      pageButton.textContent = "下载";
      pageButton.title = "顺序下载（线上作业）";
      pageButtonResetTimer = 0;
    }, 1800);
  }

  function isUsefulImageUrl(url) {
    return /^https?:\/\//i.test(String(url || "")) && IMAGE_EXT_RE.test(String(url || ""));
  }

  function extractFileNameFromUrl(url) {
    try {
      const pathname = new URL(url, location.href).pathname;
      return decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
    } catch (_error) {
      return "";
    }
  }

  function inferExt(url) {
    const match = extractFileNameFromUrl(url).match(/\.([a-zA-Z0-9]{2,5})$/);
    return match ? match[1].toLowerCase() : "";
  }

  function showPanelStatus(id, message, type) {
    if (!id) {
      showToast(message, type);
      return;
    }
    const el = root.querySelector(`#${id}`);
    if (!el) {
      showToast(message, type);
      return;
    }
    if (!message) {
      el.textContent = "";
      el.className = "ptb-status";
      return;
    }
    el.textContent = message;
    el.className = `ptb-status ptb-show ${type}`;
  }

  function reportStatus(id, message, type) {
    if (id) {
      showPanelStatus(id, message, type);
    } else {
      showToast(message, type);
    }
  }

  function showToast(message, type = "info") {
    if (!message) return;
    const old = document.getElementById("__plugin_toolbox_toast");
    if (old) old.remove();
    const toast = document.createElement("div");
    toast.id = "__plugin_toolbox_toast";
    toast.textContent = message;
    toast.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "max-width:340px",
      "padding:11px 14px",
      "border-radius:10px",
      "font:13px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif",
      "color:#fff",
      `background:${type === "error" ? "rgba(127,29,29,.94)" : type === "success" ? "rgba(20,83,45,.94)" : "rgba(15,23,42,.94)"}`,
      "box-shadow:0 10px 30px rgba(0,0,0,.3)"
    ].join(";");
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  function bindEvalEvents() {
    evalPanel.querySelector("#ptb-eval-run").addEventListener("click", async () => {
      const btn = evalPanel.querySelector("#ptb-eval-run");
      btn.disabled = true;
      showPanelStatus("ptb-eval-status", "", "");
      evalPanel.classList.add("ptb-float-hidden");
      try {
        await runEvaluation(currentConfig);
      } catch (error) {
        showToast(error?.message || "运行失败。", "error");
      } finally {
        btn.disabled = false;
      }
    });
  }

  function renderEvalConfig() {
    const form = evalPanel.querySelector("#ptb-eval-form");
    const items = getEvalItems();
    form.innerHTML = items.map((item) => {
      const subClass = item.isSub ? " ptb-sub" : "";
      const checkbox = item.isSub
        ? "<span></span>"
        : `<label class="ptb-check"><input type="checkbox" data-ptb-config="${item.id}">${item.label}</label>`;
      const label = item.isSub ? `<div class="ptb-check${subClass}">${item.label}</div>` : checkbox;
      return `
        <div class="ptb-grid-row">
          ${label}
          <select class="ptb-select" data-ptb-select="${item.select}" data-ptb-parent="${item.parent || item.id}">
            ${item.options.map((opt) => `<option value="${opt}">${opt}</option>`).join("")}
          </select>
        </div>
      `;
    }).join("");

    form.querySelectorAll("[data-ptb-config]").forEach((input) => {
      input.checked = !!currentConfig[input.dataset.ptbConfig];
      input.addEventListener("change", () => {
        currentConfig[input.dataset.ptbConfig] = input.checked;
        updateEvalSelectStates();
        saveConfig();
      });
    });

    form.querySelectorAll("[data-ptb-select]").forEach((select) => {
      select.value = currentConfig[select.dataset.ptbSelect];
      select.addEventListener("change", () => {
        currentConfig[select.dataset.ptbSelect] = select.value;
        saveConfig();
      });
    });

    updateEvalSelectStates();
  }

  function getEvalItems() {
    return [
      { id: "result", label: "作答结果", select: "resultAnswer", options: ["一致", "不一致", "半对", "忽略", "未作答"] },
      { id: "resultSolvable", label: "算法可解", select: "resultSolvable", options: ["是", "否"], isSub: true, parent: "result" },
      { id: "handwriting", label: "手写识别", select: "handwritingValue", options: ["一致", "不一致", "忽略"] },
      { id: "answer", label: "答案框", select: "answerValue", options: ["对", "错", "忽略"] },
      { id: "question", label: "题目框", select: "questionValue", options: ["对", "错", "忽略"] },
      { id: "score", label: "分数识别", select: "scoreValue", options: ["一致", "不一致", "忽略"] },
      { id: "scoreBorder", label: "分数框识别", select: "scoreBorderValue", options: ["对", "错", "忽略"], isSub: true, parent: "score" },
      { id: "scoreSolvable", label: "算法可解", select: "scoreSolvableValue", options: ["是", "否"], isSub: true, parent: "score" },
      { id: "fixed", label: "固定批改", select: "fixedValue", options: ["未批改", "对", "错", "半对", "忽略"] },
      { id: "fixedSolvable", label: "算法可解", select: "fixedSolvableValue", options: ["是", "否"], isSub: true, parent: "fixed" }
    ];
  }

  function updateEvalSelectStates() {
    evalPanel.querySelectorAll("[data-ptb-select]").forEach((select) => {
      select.disabled = !currentConfig[select.dataset.ptbParent];
    });
  }

  async function loadConfig() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    currentConfig = { ...DEFAULT_CONFIG, ...(data[STORAGE_KEY] || {}) };
  }

  async function saveConfig() {
    await chrome.storage.local.set({ [STORAGE_KEY]: currentConfig });
  }

  async function loadUiState() {
    const data = await chrome.storage.local.get(UI_STATE_KEY);
    const stored = data[UI_STATE_KEY] || {};
    const storedTools = stored.tools || {};
    const currentSchema = stored.schemaVersion === UI_STATE_SCHEMA_VERSION;
    uiState = {
      schemaVersion: UI_STATE_SCHEMA_VERSION,
      tools: {
        images:
          currentSchema && typeof storedTools.images === "boolean"
            ? storedTools.images
            : DEFAULT_UI_STATE.tools.images,
        eval:
          currentSchema && typeof storedTools.eval === "boolean"
            ? storedTools.eval
            : DEFAULT_UI_STATE.tools.eval,
        ocr:
          currentSchema && typeof storedTools.ocr === "boolean"
            ? storedTools.ocr
            : DEFAULT_UI_STATE.tools.ocr
      }
    };
    if (!currentSchema) await saveUiState();
  }

  async function saveUiState() {
    await chrome.storage.local.set({ [UI_STATE_KEY]: uiState });
  }

  async function setToolVisible(name, visible) {
    if (visible && !isToolSupportedOnPage(name)) {
      throw new Error(siteRules.unavailableMessage(name));
    }
    const previous = uiState.tools[name];
    uiState.tools[name] = visible;
    try {
      await applyToolVisibility({ strictOcr: name === "ocr" && visible });
      await saveUiState();
    } catch (error) {
      uiState.tools[name] = previous;
      await applyToolVisibility();
      throw error;
    }
  }

  async function applyToolVisibility(options = {}) {
    const showImages =
      uiState.tools.images && siteRules.isSequenceDownloadPage(location.href);
    const showEval =
      uiState.tools.eval && siteRules.isEvaluationPage(document);
    const showOcr =
      uiState.tools.ocr && siteRules.isOcrPage(document);
    pageButton.classList.toggle("ptb-float-hidden", !showImages);
    evalButton.classList.toggle("ptb-float-hidden", !showEval);
    if (!showEval) {
      evalPanel.classList.add("ptb-float-hidden");
    }
    const response = await setOcrVisibility(showOcr);
    if (options.strictOcr && !response?.ok) {
      throw new Error(response?.error || "当前页面不支持字框标注。");
    }
  }

  async function setOcrVisibility(visible) {
    try {
      return await chrome.runtime.sendMessage({
        type: OCR_VISIBILITY_MESSAGE,
        visible: Boolean(visible)
      });
    } catch (error) {
      return { ok: false, error: error?.message || "字框标注模块未响应。" };
    }
  }

  async function restorePersistedTools() {
    await loadUiState();
    if (
      siteRules.isSequenceDownloadPage(location.href) ||
      siteRules.isEvaluationPage(document) ||
      (uiState.tools.ocr && siteRules.isOcrPage(document))
    ) {
      await ensureUI();
      root.classList.add("ptb-hidden");
      panel.classList.remove("ptb-panel-open");
    }
  }

  async function syncRouteToolVisibility() {
    if (routeSyncing) return;
    const routeSignature = [
      siteRules.isSequenceDownloadPage(location.href),
      siteRules.isEvaluationPage(document),
      siteRules.isOcrPage(document)
    ].join(":");
    if (routeSignature === lastRouteSignature) return;
    routeSyncing = true;
    lastRouteSignature = routeSignature;
    try {
      if (
        !root &&
        (siteRules.isSequenceDownloadPage(location.href) ||
          siteRules.isEvaluationPage(document) ||
          (uiState.tools.ocr && siteRules.isOcrPage(document)))
      ) {
        await ensureUI();
      }
      if (root) {
        updateToolAvailability();
        await applyToolVisibility();
      }
    } finally {
      routeSyncing = false;
    }
  }

  async function initializeAutomaticTools() {
    await restorePersistedTools();
    await syncRouteToolVisibility();
    const observer = new MutationObserver(() => {
      window.clearTimeout(contentSyncTimer);
      contentSyncTimer = window.setTimeout(
        () => void syncRouteToolVisibility(),
        120
      );
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    window.addEventListener("hashchange", () => void syncRouteToolVisibility());
    window.addEventListener("popstate", () => void syncRouteToolVisibility());
    window.setInterval(() => void syncRouteToolVisibility(), 1500);
  }

  async function extractOrderedImagesFromPage() {
    function parseContextFromHash() {
      const match = (location.hash || "").match(
        /^#\/admin\/evaluation\/homework-correct-viewing\/([^/?#]+)\/([^/?#]+)/
      );
      return match ? { homeworkId: match[1], studentId: match[2] } : null;
    }

    function collectOrderedItemsFromApiData(data) {
      const rawItems = [];
      const idKeys = ["imageId", "imgId", "id", "fileId", "resourceId", "materialId"];

      function pickId(obj) {
        for (const key of idKeys) {
          const val = obj[key];
          if (typeof val === "string" && /^[A-Za-z0-9_-]{6,}$/.test(val)) {
            return val;
          }
        }
        return "";
      }

      function walk(value) {
        if (!value) return;
        if (Array.isArray(value)) {
          value.forEach(walk);
          return;
        }
        if (typeof value !== "object") return;

        for (const key of ["imageUrl", "url", "src", "annotatedScreenshotUrl"]) {
          if (isUsefulImageUrl(value[key])) {
            rawItems.push({
              id: pickId(value),
              url: value[key],
              fileName: extractFileNameFromUrl(value[key]),
              ext: inferExt(value[key])
            });
          }
        }
        Object.values(value).forEach(walk);
      }

      walk(data);
      return dedupItems(rawItems);
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
        if (!node || !node.parentElement) continue;
        const match = String(node.nodeValue || "").replace(/\s+/g, " ").match(/图片ID[:：]\s*([A-Za-z0-9_-]+)/);
        if (!match) continue;
        const rect = node.parentElement.getBoundingClientRect();
        entries.push({
          id: match[1],
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX
        });
      }

      entries.sort((a, b) => a.top - b.top || a.left - b.left);
      const seen = new Set();
      const ids = [];
      for (const entry of entries) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        ids.push(entry.id);
      }
      return ids;
    }

    async function getItemsFromApi() {
      const context = parseContextFromHash();
      if (!context || !siteRules.isSequenceDownloadPage(location.href)) {
        return [];
      }
      const apiUrl = `/metis-gnosis-evaluation/api/internal/homework/background/v2/${encodeURIComponent(
        context.homeworkId
      )}/${encodeURIComponent(context.studentId)}?answerSheet=false`;
      const response = await fetch(apiUrl, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`接口请求失败: ${response.status}`);
      }
      return collectOrderedItemsFromApiData(await response.json());
    }

    function getItemsFromDom() {
      const candidates = [];
      const orderedIds = getOrderedIdListFromText();
      for (const img of Array.from(document.querySelectorAll("img"))) {
        const url = img.currentSrc || img.src || "";
        if (!isUsefulImageUrl(url)) continue;
        const rect = img.getBoundingClientRect();
        const area = Math.max(0, rect.width) * Math.max(0, rect.height);
        if (area < 2500) continue;
        candidates.push({
          id: "",
          url,
          fileName: extractFileNameFromUrl(url),
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX
        });
      }
      candidates.sort((a, b) => a.top - b.top || a.left - b.left);
      const items = dedupItems(candidates);
      for (let i = 0; i < items.length; i += 1) {
        if (!items[i].id && orderedIds[i]) {
          items[i].id = orderedIds[i];
        }
      }
      return items;
    }

    try {
      const orderedIds = getOrderedIdListFromText();
      const apiItems = await getItemsFromApi();
      if (apiItems.length) {
        for (let i = 0; i < apiItems.length; i += 1) {
          if (!apiItems[i].id && orderedIds[i]) {
            apiItems[i].id = orderedIds[i];
          }
        }
        return { ok: true, items: apiItems };
      }
    } catch (_error) {
      // DOM extraction below is the fallback for pages where the API is unavailable.
    }

    const domItems = getItemsFromDom();
    if (domItems.length) {
      return { ok: true, items: domItems };
    }
    return { ok: false, error: "未提取到图片。请先滚动页面让图片加载完成。" };
  }

  function dedupItems(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      result.push(item);
    }
    return result;
  }

  function normText(text) {
    return String(text || "").replace(/\s+/g, "").trim();
  }

  function isVisibleFast(el) {
    return !!el && el.getClientRects().length > 0;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function getScrollEl() {
    return document.scrollingElement || document.documentElement;
  }

  function scrollToTop() {
    getScrollEl().scrollTop = 0;
  }

  function nearBottom() {
    const el = getScrollEl();
    return el.scrollTop + window.innerHeight >= el.scrollHeight - 10;
  }

  function clickWaitButtonIfAny() {
    const btns = Array.from(document.querySelectorAll("button, .ant-btn"));
    for (const btn of btns) {
      const text = normText(btn.textContent);
      if (text === "等待" || text === "Wait") {
        btn.click();
        return true;
      }
    }
    return false;
  }

  function extractFieldName(formItem) {
    const labelNode = formItem.querySelector(".ant-form-item-label label");
    return normText(labelNode ? labelNode.textContent : "").replace(/：|:/g, "");
  }

  function findOptionLabel(formItem, targetOption) {
    const wrappers = formItem.querySelectorAll("label.ant-radio-wrapper");
    for (const wrapper of wrappers) {
      if (!isVisibleFast(wrapper)) continue;
      const spans = wrapper.querySelectorAll(":scope > span");
      if (!spans.length) continue;
      const option = normText(spans[spans.length - 1].textContent);
      if (option !== targetOption) continue;
      const input = wrapper.querySelector('input[type="radio"]');
      if (!input) continue;
      return { wrapper, input };
    }
    return null;
  }

  function hasOption(formItem, optionText) {
    const wrappers = formItem.querySelectorAll("label.ant-radio-wrapper");
    for (const wrapper of wrappers) {
      const spans = wrapper.querySelectorAll(":scope > span");
      if (!spans.length) continue;
      if (normText(spans[spans.length - 1].textContent) === optionText) return true;
    }
    return false;
  }

  function fieldMatches(fieldName, ...prefixes) {
    return prefixes.some((prefix) => fieldName.startsWith(prefix));
  }

  function getRuleForField(fieldName, config, tabText) {
    if (tabText === "作答结果" && config.result) {
      if (fieldMatches(fieldName, "作答", "作答-")) return config.resultAnswer;
      if (fieldName === "算法可解") return config.resultSolvable;
    }
    if (tabText === "手写识别" && config.handwriting) {
      if (fieldMatches(fieldName, "识别", "识别-")) return config.handwritingValue;
    }
    if (tabText === "分数识别" && config.score) {
      if (fieldName === "分数识别") return config.scoreValue;
      if (fieldName === "分数框识别") return config.scoreBorderValue;
      if (fieldName === "算法可解") return config.scoreSolvableValue;
    }
    if (tabText === "固定批改" && config.fixed) {
      if (fieldName.startsWith("老师批改-") || fieldName === "老师批改") return config.fixedValue;
      if (fieldName === "算法可解") return config.fixedSolvableValue;
    }
    if (tabText === "答案框" && config.answer && fieldName.startsWith("答案框-")) return config.answerValue;
    if (tabText === "题目框" && config.question && fieldName.startsWith("题目框")) return config.questionValue;
    return "";
  }

  function applyOnce(config, tabText) {
    let changed = 0;
    const formItems = document.querySelectorAll(".ant-form-item");
    for (const formItem of formItems) {
      if (!isVisibleFast(formItem)) continue;
      const field = extractFieldName(formItem);
      if (!field) continue;
      const targetOption = getRuleForField(field, config, tabText);
      if (!targetOption) continue;
      if (tabText === "答案框" && field.startsWith("答案框-") && hasOption(formItem, "无留痕")) continue;
      const option = findOptionLabel(formItem, targetOption);
      if (!option || option.input.checked) continue;
      option.wrapper.click();
      changed += 1;
    }
    return changed;
  }

  async function clickTabByText(tabText) {
    const tabs = Array.from(document.querySelectorAll("[role='tab'], .ant-tabs-tab"));
    for (const tab of tabs) {
      if (normText(tab.textContent) === tabText) {
        tab.click();
        await wait(200);
        await nextFrame();
        return true;
      }
    }
    return false;
  }

  async function processForCurrentView(config, tabText) {
    scrollToTop();
    await nextFrame();
    let total = 0;
    let stable = 0;
    const el = getScrollEl();
    let lastScrollTop = -1;

    for (let i = 0; i < 250; i += 1) {
      const n = applyOnce(config, tabText);
      total += n;
      stable = n === 0 ? stable + 1 : 0;

      if (nearBottom() && stable >= 2) break;
      if (el.scrollTop === lastScrollTop && stable >= 2) break;
      lastScrollTop = el.scrollTop;
      el.scrollBy(0, Math.floor(window.innerHeight * 1.2));
      await nextFrame();
      if (i % 20 === 0) await wait(10);
    }

    scrollToTop();
    return total;
  }

  async function runEvaluation(config) {
    const tabsToRun = [];
    if (config.result) tabsToRun.push("作答结果");
    if (config.handwriting) tabsToRun.push("手写识别");
    if (config.answer) tabsToRun.push("答案框");
    if (config.question) tabsToRun.push("题目框");
    if (config.score) tabsToRun.push("分数识别");
    if (config.fixed) tabsToRun.push("固定批改");

    if (!tabsToRun.length) {
      showPanelStatus("ptb-eval-status", "未选择评测项。", "error");
      return;
    }

    let waitClicked = 0;
    let keepWaitLoop = true;
    const waiter = (async () => {
      while (keepWaitLoop && waitClicked < 3) {
        if (clickWaitButtonIfAny()) {
          waitClicked += 1;
          await wait(200);
        } else {
          await wait(300);
        }
      }
    })();

    let totalChanged = 0;
    for (const tabText of tabsToRun) {
      const switched = await clickTabByText(tabText);
      if (!switched) continue;
      totalChanged += await processForCurrentView(config, tabText);
    }

    keepWaitLoop = false;
    await waiter;
    showToast(`评测完成：更改 ${totalChanged} 项。`, "success");
  }

  initializeAutomaticTools().catch((error) => {
    console.warn("[插件盒子] 自动呼出工具失败", error);
  });
})();
