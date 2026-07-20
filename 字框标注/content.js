(() => {
  "use strict";

  const ROOT_ID = "ocr-box-helper-root";
  const TOAST_ID = "ocr-box-helper-clear-toast";
  const VISIBILITY_REQUEST_KEY = "__OCR_BOX_HELPER_REQUESTED_VISIBLE__";
  const VISIBILITY_MESSAGE = "ocr-box-helper-visibility";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== VISIBILITY_MESSAGE) return false;
    const root = document.getElementById(ROOT_ID);
    if (message.action === "get") {
      sendResponse({
        ready: Boolean(root),
        visible: root
          ? root.dataset.interfaceVisible !== "false"
          : window[VISIBILITY_REQUEST_KEY] !== false,
      });
      return false;
    }
    if (message.action === "set") {
      const visible = Boolean(message.visible);
      window[VISIBILITY_REQUEST_KEY] = visible;
      if (root) root.dataset.interfaceVisible = String(visible);
      if (!visible) {
        const toast = document.getElementById(TOAST_ID);
        if (toast) {
          toast.dataset.visible = "false";
          toast.setAttribute("aria-hidden", "true");
        }
      }
      sendResponse({ ready: Boolean(root), visible });
      return false;
    }
    return false;
  });

  if (window.__OCR_BOX_HELPER_ACTIVE__) return;
  window.__OCR_BOX_HELPER_ACTIVE__ = true;

  const core = globalThis.OCRBoxHelperCore;
  if (!core) throw new Error("字框标注助手核心模块未加载");

  const SURFACE_SELECTOR =
    '[role="img"][aria-label="作文正文逐字标注图片"]';
  const CHAR_LIST_SELECTOR = '[aria-label="逐字选择列表"]';
  const BOX_SELECTOR = 'button[aria-label$=" 的字框"]';
  const SINGLE_MODE_IDLE_MS = 5000;
  const SETTINGS_SCHEMA_VERSION = 2;
  const SETTINGS_DEFAULTS = {
    drawMode: "native",
    autoAdvance: true,
    reverseAdvance: false,
    fixedScalePercent: 100,
    settingsSchemaVersion: 0,
  };
  const MODES = new Set(["single-fixed", "native"]);

  const state = {
    settings: { ...SETTINGS_DEFAULTS },
    root: null,
    surface: null,
    list: null,
    pageKey: location.pathname,
    available: false,
    editable: false,
    busy: false,
    forwardingPointer: false,
    singlePending: null,
    singleModeIdleTimer: null,
    clearToken: null,
    clearToastTimer: null,
    collapsed: false,
    advancedExpanded: false,
    statusText: "正在连接标注页面…",
    statusTone: "info",
    availabilityKey: "",
    syncQueued: false,
  };

  const ui = {};

  function storageGet(defaults) {
    return new Promise((resolve) => {
      chrome.storage.local.get(defaults, (items) => {
        if (chrome.runtime.lastError) {
          resolve({ ...defaults });
          return;
        }
        resolve(items);
      });
    });
  }

  function storageSet(values) {
    return new Promise((resolve) => {
      chrome.storage.local.set(values, () => resolve());
    });
  }

  function normalizeSettings(value) {
    const storedSchemaVersion = Number(value.settingsSchemaVersion) || 0;
    const drawMode =
      storedSchemaVersion >= SETTINGS_SCHEMA_VERSION && MODES.has(value.drawMode)
        ? value.drawMode
        : SETTINGS_DEFAULTS.drawMode;
    return {
      drawMode,
      autoAdvance:
        typeof value.autoAdvance === "boolean"
          ? value.autoAdvance
          : SETTINGS_DEFAULTS.autoAdvance,
      reverseAdvance:
        typeof value.reverseAdvance === "boolean"
          ? value.reverseAdvance
          : SETTINGS_DEFAULTS.reverseAdvance,
      fixedScalePercent: core.normalizeScalePercent(
        value.fixedScalePercent,
        SETTINGS_DEFAULTS.fixedScalePercent,
      ),
      settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
    };
  }

  function buildToolbar() {
    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.dataset.interfaceVisible = String(
      window[VISIBILITY_REQUEST_KEY] !== false,
    );
    root.setAttribute("aria-label", "字框标注助手");
    root.innerHTML = `
      <div class="ocr-box-helper__panel">
        <header class="ocr-box-helper__header">
          <h2 class="ocr-box-helper__title">字框标注助手</h2>
          <div class="ocr-box-helper__header-actions">
            <button class="ocr-box-helper__collapse" type="button" data-action="collapse" aria-expanded="true">收起</button>
          </div>
        </header>
        <div class="ocr-box-helper__body">
          <section>
            <span class="ocr-box-helper__label">绘框模式</span>
            <div class="ocr-box-helper__modes" role="group" aria-label="绘框模式">
              <button class="ocr-box-helper__mode" type="button" data-action="toggle-mode">单击画框</button>
            </div>
          </section>

          <section class="ocr-box-helper__size-section">
            <span class="ocr-box-helper__label">单击画框尺寸（默认 50 × 60）</span>
            <div class="ocr-box-helper__scale-row" role="group" aria-label="单击画框尺寸缩放">
              <button class="ocr-box-helper__button ocr-box-helper__scale" type="button" data-action="shrink-size" aria-label="缩小单击画框">− 缩小</button>
              <output class="ocr-box-helper__size-value" data-role="fixed-size" aria-live="polite"></output>
              <button class="ocr-box-helper__button ocr-box-helper__scale" type="button" data-action="enlarge-size" aria-label="放大单击画框">+ 放大</button>
            </div>
          </section>

          <button class="ocr-box-helper__advanced-toggle" type="button" data-action="toggle-advanced">▶ 高级选项</button>
          <div class="ocr-box-helper__advanced-content" data-expanded="false">
            <label class="ocr-box-helper__switch-row">
              <span>成框后跳过标点并自动选字</span>
              <input class="ocr-box-helper__switch" data-action="auto-advance" type="checkbox">
            </label>

            <label class="ocr-box-helper__switch-row">
              <span>反向标注（成框后选择上一字）</span>
              <input class="ocr-box-helper__switch" data-action="reverse-advance" type="checkbox">
            </label>
          </div>

          <div class="ocr-box-helper__delete-actions">
            <button class="ocr-box-helper__button ocr-box-helper__batch-delete" type="button" data-action="delete-five" aria-label="从当前字符开始连续删除五个字框">连续删除 5 个</button>
            <button class="ocr-box-helper__button ocr-box-helper__danger" type="button" data-action="clear-all">清空全部字框</button>
          </div>

          <div class="ocr-box-helper__status" data-role="status" data-tone="info" role="status" aria-live="polite"></div>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    ensureClearToast();
    state.root = root;
    ui.toggleModeButton = root.querySelector('[data-action="toggle-mode"]');
    ui.shrinkSizeButton = root.querySelector('[data-action="shrink-size"]');
    ui.enlargeSizeButton = root.querySelector('[data-action="enlarge-size"]');
    ui.fixedSize = root.querySelector('[data-role="fixed-size"]');
    ui.advancedToggle = root.querySelector('[data-action="toggle-advanced"]');
    ui.advancedContent = root.querySelector('.ocr-box-helper__advanced-content');
    ui.autoAdvance = root.querySelector('[data-action="auto-advance"]');
    ui.reverseAdvance = root.querySelector('[data-action="reverse-advance"]');
    ui.deleteFiveButton = root.querySelector('[data-action="delete-five"]');
    ui.clearAllButton = root.querySelector('[data-action="clear-all"]');
    ui.status = root.querySelector('[data-role="status"]');
    ui.collapseButton = root.querySelector('[data-action="collapse"]');

    ui.toggleModeButton.addEventListener("click", () => {
      const nextMode = state.settings.drawMode === "single-fixed" ? "native" : "single-fixed";
      changeMode(nextMode);
    });
    ui.shrinkSizeButton.addEventListener("click", () => changeFixedScale(-10));
    ui.enlargeSizeButton.addEventListener("click", () => changeFixedScale(10));
    ui.advancedToggle.addEventListener("click", () => {
      state.advancedExpanded = !state.advancedExpanded;
      renderToolbar();
    });
    ui.autoAdvance.addEventListener("change", async () => {
      state.settings.autoAdvance = ui.autoAdvance.checked;
      await storageSet({ autoAdvance: state.settings.autoAdvance });
      setStatus(
        state.settings.autoAdvance
          ? "成框后自动选字已开启。"
          : "成框后自动选字已关闭，仍可使用页面原有左右键。",
        "success",
      );
      renderToolbar();
    });
    ui.reverseAdvance.addEventListener("change", async () => {
      state.settings.reverseAdvance = ui.reverseAdvance.checked;
      await storageSet({ reverseAdvance: state.settings.reverseAdvance });
      setStatus(
        state.settings.reverseAdvance
          ? "反向标注已开启：成框后将选择上一字。"
          : "反向标注已关闭：成框后将选择下一字。",
        "success",
      );
      renderToolbar();
    });
    ui.deleteFiveButton.addEventListener("click", deleteNextFiveBoxes);
    ui.clearAllButton.addEventListener("click", clearAllBoxes);
    ui.collapseButton.addEventListener("click", () => {
      state.collapsed = !state.collapsed;
      renderToolbar();
    });
    renderToolbar();
  }

  async function changeMode(mode) {
    if (!MODES.has(mode)) return;
    if (isGestureActive()) {
      setStatus("请先完成当前指针操作，再切换模式。", "warning");
      return;
    }
    const previousMode = state.settings.drawMode;
    state.settings.drawMode = mode;
    if (mode !== "single-fixed") clearSingleModeIdleTimer();
    await storageSet({ drawMode: mode });
    renderToolbar();
    if (previousMode === "native" && mode === "single-fixed") {
      await advanceWhenResumingSingleMode();
      armSingleModeIdleTimer();
      return;
    }
    const messages = {
      "single-fixed": "单击画框：点击字的中心即可成框。",
      native: "助手已暂停，页面原生拖拽和移动功能可用。",
    };
    setStatus(messages[mode], "success");
    if (mode === "single-fixed") armSingleModeIdleTimer();
  }

  async function advanceWhenResumingSingleMode() {
    if (!state.available || !state.list) {
      setStatus("已切换到单击画框，等待标注页面加载。", "warning");
      return;
    }
    const currentIndex = getCurrentIndex();
    const direction = state.settings.reverseAdvance ? "backward" : "forward";
    const initialIndex =
      currentIndex ?? (direction === "backward" ? getCharacterButtons().length : -1);
    const result = await selectAdjacentContentCharacter(initialIndex, direction);
    const adjacentLabel = direction === "backward" ? "上一字" : "下一字";
    const edgeLabel = direction === "backward" ? "第一个" : "最后一个";
    if (result.status === "end") {
      setStatus(`已切换到单击画框；当前已是${edgeLabel}非标点字符。`, "success");
      return;
    }
    if (result.status === "unavailable") {
      setStatus(`已切换到单击画框，但${adjacentLabel}控件不可用。`, "warning");
      return;
    }
    if (result.status === "timeout") {
      setStatus(`已切换到单击画框，但自动选择${adjacentLabel}超时。`, "warning");
      return;
    }
    if (currentIndex === null) {
      setStatus(
        `已切换到单击画框并选择第 ${result.targetIndex + 1} 字。`,
        "success",
      );
      return;
    }
    setStatus(
      result.skipped > 0
        ? `已切换到单击画框，跳过 ${result.skipped} 个标点，已选择第 ${result.targetIndex + 1} 字。`
        : `已切换到单击画框，已选择第 ${result.targetIndex + 1} 字。`,
      "success",
    );
  }

  async function changeFixedScale(delta) {
    const current = state.settings.fixedScalePercent;
    const next = core.normalizeScalePercent(current + delta, current);
    if (next === current) return;
    state.settings.fixedScalePercent = next;
    await storageSet({ fixedScalePercent: next });
    const size = getFixedSize();
    setStatus(
      `单击画框已按比例调整为 ${size.width} × ${size.height}（${next}%）。`,
      "success",
    );
    renderToolbar();
  }

  function renderToolbar() {
    if (!state.root) return;
    const mode = state.settings.drawMode;
    state.root.dataset.collapsed = String(state.collapsed);
    ui.collapseButton.textContent = state.collapsed ? "展开" : "收起";
    ui.collapseButton.setAttribute("aria-expanded", String(!state.collapsed));

    const isActive = mode === "single-fixed";
    ui.toggleModeButton.textContent = isActive ? "暂停助手" : "单击画框";
    ui.toggleModeButton.setAttribute("aria-pressed", String(isActive));
    ui.toggleModeButton.disabled = state.busy;

    const size = getFixedSize();
    ui.fixedSize.textContent = `${size.width} × ${size.height} · ${size.scalePercent}%`;
    const sizeDisabled = state.busy || mode !== "single-fixed";
    ui.shrinkSizeButton.disabled = sizeDisabled || size.scalePercent <= 40;
    ui.enlargeSizeButton.disabled = sizeDisabled || size.scalePercent >= 300;

    ui.advancedToggle.textContent = state.advancedExpanded ? "\u25BC 高级选项" : "\u25B6 高级选项";
    ui.advancedContent.dataset.expanded = String(state.advancedExpanded);

    ui.autoAdvance.checked = state.settings.autoAdvance;
    ui.autoAdvance.disabled = state.busy;
    ui.reverseAdvance.checked = state.settings.reverseAdvance;
    ui.reverseAdvance.disabled = state.busy;
    ui.deleteFiveButton.disabled =
      state.busy || !state.available || !state.editable;
    ui.clearAllButton.disabled =
      state.busy || !state.available || !state.editable || isGestureActive();
    ui.status.textContent = state.statusText;
    ui.status.dataset.tone = state.statusTone;
  }

  function setStatus(text, tone = "info") {
    state.statusText = text;
    state.statusTone = tone;
    if (ui.status) {
      ui.status.textContent = text;
      ui.status.dataset.tone = tone;
    }
  }

  function clearSingleModeIdleTimer() {
    if (state.singleModeIdleTimer === null) return;
    window.clearTimeout(state.singleModeIdleTimer);
    state.singleModeIdleTimer = null;
  }

  function canArmSingleModeIdleTimer() {
    return (
      state.settings.drawMode === "single-fixed" &&
      state.available &&
      state.editable &&
      !state.busy &&
      !state.singlePending
    );
  }

  function armSingleModeIdleTimer() {
    clearSingleModeIdleTimer();
    if (!canArmSingleModeIdleTimer()) return;
    state.singleModeIdleTimer = window.setTimeout(() => {
      state.singleModeIdleTimer = null;
      if (!canArmSingleModeIdleTimer()) return;
      state.settings.drawMode = "native";
      setStatus("5 秒内未进行单击画框，已自动切换到暂停助手。", "warning");
      renderToolbar();
      void storageSet({ drawMode: "native" });
    }, SINGLE_MODE_IDLE_MS);
  }

  function ensureSingleModeIdleTimer() {
    if (!canArmSingleModeIdleTimer()) {
      clearSingleModeIdleTimer();
      return;
    }
    if (state.singleModeIdleTimer === null) armSingleModeIdleTimer();
  }

  function ensureClearToast() {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.dataset.tone = "info";
      toast.dataset.visible = "false";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.setAttribute("aria-hidden", "true");
      document.body.appendChild(toast);
    }
    ui.clearToast = toast;
    return toast;
  }

  function showClearToast(text, tone = "info", autoHideMs = 0) {
    const toast = ensureClearToast();
    if (state.clearToastTimer !== null) {
      window.clearTimeout(state.clearToastTimer);
      state.clearToastTimer = null;
    }
    toast.textContent = text;
    toast.dataset.tone = tone;
    toast.dataset.visible = "true";
    toast.setAttribute("aria-hidden", "false");
    if (autoHideMs > 0) {
      state.clearToastTimer = window.setTimeout(() => {
        toast.dataset.visible = "false";
        toast.setAttribute("aria-hidden", "true");
        state.clearToastTimer = null;
      }, autoHideMs);
    }
  }

  function findExactButton(text) {
    const matches = Array.from(document.querySelectorAll("button")).filter(
      (button) => button.textContent.trim() === text,
    );
    return matches.length === 1 ? matches[0] : null;
  }

  function getCurrentIndex() {
    const current = state.list?.querySelector('button[aria-current="true"]');
    return current ? parseCharacterIndex(current) : null;
  }

  function parseCharacterIndex(element) {
    const titleIndex = core.parseCharacterIndex(
      element?.getAttribute("title") || "",
    );
    if (titleIndex !== null) return titleIndex;
    return core.parseCharacterIndex(element?.getAttribute("aria-label") || "");
  }

  function parseRegionTitle(title) {
    return core.parseRegionTitle(title);
  }

  function getRegion(index) {
    if (!state.surface || index === null) return null;
    const boxes = Array.from(state.surface.querySelectorAll(BOX_SELECTOR));
    const box = boxes.find((element) => parseCharacterIndex(element) === index);
    return box ? parseRegionTitle(box.getAttribute("title")) : null;
  }

  function getFramedButtons(list = state.list) {
    return list
      ? Array.from(list.querySelectorAll('button[title$="，已有框"]'))
      : [];
  }

  function getFixedSize() {
    return core.fixedSizeFromScale(state.settings.fixedScalePercent);
  }

  function getImageMetrics() {
    if (!state.surface) return null;
    const image = state.surface.querySelector('img[aria-hidden="true"]');
    const rect = state.surface.getBoundingClientRect();
    if (
      !image ||
      !image.naturalWidth ||
      !image.naturalHeight ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return null;
    }
    return {
      rect,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      scaleX: rect.width / image.naturalWidth,
      scaleY: rect.height / image.naturalHeight,
    };
  }

  function clientToImagePoint(clientX, clientY) {
    const metrics = getImageMetrics();
    if (!metrics) return null;
    return {
      x: Math.round(
        clamp(
          (clientX - metrics.rect.left) / metrics.scaleX,
          0,
          metrics.naturalWidth,
        ),
      ),
      y: Math.round(
        clamp(
          (clientY - metrics.rect.top) / metrics.scaleY,
          0,
          metrics.naturalHeight,
        ),
      ),
    };
  }

  function imageToClientPoint(point, metrics = getImageMetrics()) {
    if (!metrics) return null;
    return {
      x: metrics.rect.left + point.x * metrics.scaleX,
      y: metrics.rect.top + point.y * metrics.scaleY,
    };
  }

  function fixedGeometryAt(clientX, clientY) {
    const metrics = getImageMetrics();
    if (!metrics) return null;
    const center = clientToImagePoint(clientX, clientY);
    if (!center) return null;
    const fixedSize = getFixedSize();
    const region = core.fixedRegion({
      centerX: center.x,
      centerY: center.y,
      requestedWidth: fixedSize.width,
      requestedHeight: fixedSize.height,
      naturalWidth: metrics.naturalWidth,
      naturalHeight: metrics.naturalHeight,
    });
    const { x, y, w: width, h: height } = region;
    return {
      region,
      startClient: imageToClientPoint({ x, y }, metrics),
      endClient: imageToClientPoint({ x: x + width, y: y + height }, metrics),
    };
  }

  function clamp(value, min, max) {
    return core.clamp(value, min, max);
  }

  function isGestureActive() {
    return Boolean(state.singlePending);
  }

  function ensureCurrentCharacter() {
    const currentIndex = getCurrentIndex();
    if (currentIndex !== null) return currentIndex;
    const first = state.list?.querySelector("button");
    if (first) {
      first.click();
      setStatus("已选择第一个字符，请再次点击图片绘框。", "warning");
    } else {
      setStatus("没有可选择的正文字符。", "error");
    }
    return null;
  }

  function dispatchPointer(type, sourceEvent, point, buttons) {
    if (!state.surface || !point) return false;
    const screenOffsetX = sourceEvent.screenX - sourceEvent.clientX;
    const screenOffsetY = sourceEvent.screenY - sourceEvent.clientY;
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: sourceEvent.pointerId,
      pointerType: sourceEvent.pointerType,
      isPrimary: sourceEvent.isPrimary,
      clientX: point.x,
      clientY: point.y,
      screenX: point.x + screenOffsetX,
      screenY: point.y + screenOffsetY,
      button: sourceEvent.button,
      buttons,
      width: sourceEvent.width,
      height: sourceEvent.height,
      pressure: type === "pointerup" ? 0 : sourceEvent.pressure,
      tiltX: sourceEvent.tiltX,
      tiltY: sourceEvent.tiltY,
    });
    state.forwardingPointer = true;
    try {
      return state.surface.dispatchEvent(event);
    } finally {
      state.forwardingPointer = false;
    }
  }

  function stopOriginalPointer(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onSurfacePointerDown(event) {
    if (
      state.forwardingPointer ||
      !event.isTrusted ||
      state.settings.drawMode === "native" ||
      state.busy ||
      !state.available ||
      !state.editable ||
      event.button !== 0 ||
      !event.isPrimary
    ) {
      return;
    }

    const currentIndex = ensureCurrentCharacter();
    if (currentIndex === null) {
      stopOriginalPointer(event);
      return;
    }

    const geometry = fixedGeometryAt(event.clientX, event.clientY);
    if (!geometry) {
      stopOriginalPointer(event);
      setStatus("图片尚未加载完成，暂时不能生成固定框。", "error");
      return;
    }
    stopOriginalPointer(event);
    clearSingleModeIdleTimer();
    state.singlePending = {
      pageKey: state.pageKey,
      index: currentIndex,
      pointerId: event.pointerId,
      endClient: geometry.endClient,
    };
    dispatchPointer("pointerdown", event, geometry.startClient, event.buttons || 1);
  }

  function onSurfacePointerUp(event) {
    if (
      state.forwardingPointer ||
      !event.isTrusted ||
      state.settings.drawMode === "native" ||
      state.busy
    ) {
      return;
    }

    const pending = state.singlePending;
    if (!pending || pending.pointerId !== event.pointerId) return;
    stopOriginalPointer(event);
    dispatchPointer("pointerup", event, pending.endClient, 0);
    state.singlePending = null;
    void scheduleFinalize(pending.index, pending.pageKey).finally(() => {
      ensureSingleModeIdleTimer();
    });
  }

  function onSurfacePointerCancel() {
    if (state.forwardingPointer || state.settings.drawMode === "native") return;
    const wasActive = isGestureActive();
    state.singlePending = null;
    if (wasActive) {
      setStatus("本次指针操作已中断，请重新绘制当前字符。", "warning");
      renderToolbar();
    }
    ensureSingleModeIdleTimer();
  }

  async function scheduleFinalize(index, pageKey) {
    if (index === null) {
      setStatus("未能识别当前字符，请重新绘制。", "error");
      return;
    }
    try {
      await waitForCondition(() => {
        if (pageKey !== state.pageKey) return false;
        const region = getRegion(index);
        return region && region.w > 0 && region.h > 0 ? region : false;
      });
    } catch {
      if (pageKey !== state.pageKey) return;
      setStatus("字框未成功生成或尺寸为 0，请重新绘制当前字符。", "error");
      return;
    }

    if (pageKey !== state.pageKey) return;
    if (!state.settings.autoAdvance || getCurrentIndex() !== index) {
      setStatus(`第 ${index + 1} 字已写入当前未保存草稿。`, "success");
      return;
    }

    const direction = state.settings.reverseAdvance ? "backward" : "forward";
    const adjacentLabel = direction === "backward" ? "上一字" : "下一字";
    const sideLabel = direction === "backward" ? "前面" : "后面";
    const result = await selectAdjacentContentCharacter(index, direction);
    if (result.status === "end") {
      setStatus(
        `第 ${index + 1} 字已写入草稿；${sideLabel}没有需要标注的非标点字符。`,
        "success",
      );
      return;
    }
    if (result.status === "unavailable") {
      setStatus(
        `第 ${index + 1} 字已写入草稿，但${adjacentLabel}控件不可用。`,
        "warning",
      );
      return;
    }
    if (result.status === "timeout") {
      setStatus(
        `第 ${index + 1} 字已写入草稿，但自动选择${adjacentLabel}超时。`,
        "warning",
      );
      return;
    }
    setStatus(
      result.skipped > 0
        ? `第 ${index + 1} 字已成框，跳过 ${result.skipped} 个标点，已选择第 ${result.targetIndex + 1} 字。`
        : `第 ${index + 1} 字已成框，已选择第 ${result.targetIndex + 1} 字。`,
      "success",
    );
  }

  function getCharacterButtons(list = state.list) {
    return list
      ? Array.from(list.querySelectorAll("button")).filter(
          (button) => parseCharacterIndex(button) !== null,
        )
      : [];
  }

  async function selectAdjacentContentCharacter(currentIndex, direction) {
    const characterButtons = getCharacterButtons();
    const characters = characterButtons.map((button) =>
      button.textContent.trim(),
    );
    const targetIndex =
      direction === "backward"
        ? core.findPreviousContentIndex(characters, currentIndex)
        : core.findNextContentIndex(characters, currentIndex);
    if (targetIndex === null) return { status: "end" };

    const target = characterButtons.find(
      (button) => parseCharacterIndex(button) === targetIndex,
    );
    if (!target || target.disabled) return { status: "unavailable" };

    target.click();
    try {
      await waitForCondition(() => getCurrentIndex() === targetIndex, 1000);
    } catch {
      return { status: "timeout" };
    }
    return {
      status: "selected",
      targetIndex,
      skipped: Math.abs(targetIndex - currentIndex) - 1,
    };
  }

  async function settleGestureForBatchDeletion() {
    resetGestureForRemount();
    renderToolbar();
  }

  async function deleteNextFiveBoxes() {
    if (state.busy) return;
    if (!state.available || !state.editable || !state.list) {
      showClearToast("当前页面不可编辑，不能连续删除字框。", "error", 6500);
      return;
    }

    await settleGestureForBatchDeletion();
    const currentIndex = getCurrentIndex() ?? 0;
    const framedIndices = getFramedButtons()
      .map((button) => parseCharacterIndex(button))
      .filter((index) => index !== null);
    const targetIndices = core.takeNextCharacterIndices(
      framedIndices,
      currentIndex,
      5,
    );
    if (targetIndices.length === 0) {
      showClearToast("从当前字符开始，后面已经没有可删除的字框。", "success", 4500);
      return;
    }

    const pageKey = state.pageKey;
    const list = state.list;
    const token = { pageKey, list, cancelled: false };
    state.clearToken = token;
    state.busy = true;
    clearSingleModeIdleTimer();
    showClearToast(`正在连续删除：0 / ${targetIndices.length}`, "warning");
    renderToolbar();

    let deleted = 0;
    let lastDeletedIndex = null;
    try {
      for (const targetIndex of targetIndices) {
        await deleteBoxAtIndex(targetIndex, list, token);
        deleted += 1;
        lastDeletedIndex = targetIndex;
        showClearToast(
          `正在连续删除：${deleted} / ${targetIndices.length}`,
          "warning",
        );
      }

      assertClearStillValid(token);
      const movedToNext =
        lastDeletedIndex !== null && selectCharacter(lastDeletedIndex + 1);
      showClearToast(
        movedToNext
          ? `已连续删除 ${deleted} 个字框；已移到下一字符，尚未保存。`
          : `已连续删除 ${deleted} 个字框；当前已到末尾，尚未保存。`,
        "success",
        4500,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      showClearToast(
        `连续删除在 ${deleted} / ${targetIndices.length} 处中止：${message}。`,
        "error",
        7500,
      );
    } finally {
      token.cancelled = true;
      if (state.clearToken === token) state.clearToken = null;
      state.busy = false;
      ensureSingleModeIdleTimer();
      renderToolbar();
    }
  }

  async function clearAllBoxes() {
    if (state.busy) return;
    if (isGestureActive()) {
      showClearToast("请先完成当前字框，再执行清空。", "warning", 4500);
      return;
    }
    if (!state.available || !state.editable || !state.list) {
      showClearToast("当前页面不可编辑，不能清空字框。", "error", 6500);
      return;
    }

    const initialCount = getFramedButtons().length;
    if (initialCount === 0) {
      selectFirstCharacter();
      showClearToast("当前页面已经没有字框。", "success", 4000);
      return;
    }

    const pageKey = state.pageKey;
    const list = state.list;
    const token = { pageKey, list, cancelled: false };
    state.clearToken = token;
    state.busy = true;
    clearSingleModeIdleTimer();
    showClearToast(`正在清空：0 / ${initialCount}`, "warning");
    renderToolbar();

    let deleted = 0;
    try {
      while (getFramedButtons(list).length > 0) {
        assertClearStillValid(token);
        const target = getFramedButtons(list)[0];
        const targetIndex = parseCharacterIndex(target);
        if (targetIndex === null) throw new Error("无法识别带框字符序号");
        await deleteBoxAtIndex(targetIndex, list, token);
        deleted += 1;
        showClearToast(`正在清空：${deleted} / ${initialCount}`, "warning");
      }

      assertClearStillValid(token);
      selectFirstCharacter();
      showClearToast(
        `已清空 ${deleted} 个字框并选择第一个字符；尚未保存，刷新可恢复。`,
        "success",
        4500,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      showClearToast(
        `清空在 ${deleted} / ${initialCount} 处中止：${message}。当前仍只是未保存草稿，可刷新恢复。`,
        "error",
        7500,
      );
    } finally {
      token.cancelled = true;
      if (state.clearToken === token) state.clearToken = null;
      state.busy = false;
      ensureSingleModeIdleTimer();
      renderToolbar();
    }
  }

  async function deleteBoxAtIndex(targetIndex, list, token) {
    assertClearStillValid(token);
    const target = getCharacterButtons(list).find(
      (button) => parseCharacterIndex(button) === targetIndex,
    );
    if (!target) throw new Error(`无法找到第 ${targetIndex + 1} 字`);

    target.click();
    await waitForCondition(() => {
      const deleteButton = findExactButton("删除字框");
      return (
        getCurrentIndex() === targetIndex && deleteButton && !deleteButton.disabled
      );
    });
    assertClearStillValid(token);

    const before = getFramedButtons(list).length;
    const deleteButton = findExactButton("删除字框");
    if (!deleteButton || deleteButton.disabled) {
      throw new Error(`第 ${targetIndex + 1} 字的删除按钮不可用`);
    }
    deleteButton.click();
    await waitForCondition(() => getFramedButtons(list).length === before - 1);
  }

  function assertClearStillValid(token) {
    if (
      token.cancelled ||
      state.pageKey !== token.pageKey ||
      state.list !== token.list ||
      !document.contains(token.list)
    ) {
      throw new Error("页面已切换或标注组件已重建");
    }
  }

  function waitForCondition(predicate, timeoutMs = 1600) {
    const started = performance.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        let value = null;
        try {
          value = predicate();
        } catch {
          value = null;
        }
        if (value) {
          resolve(value);
          return;
        }
        if (performance.now() - started >= timeoutMs) {
          reject(new Error("页面响应超时"));
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }

  function selectCharacter(index) {
    const target = getCharacterButtons().find(
      (button) => parseCharacterIndex(button) === index,
    );
    target?.click();
    return Boolean(target);
  }

  function selectFirstCharacter() {
    selectCharacter(0);
  }

  function isPageEditable() {
    if (!state.surface) return false;
    if (findExactButton("保存中…")) return false;
    const saveButton = findExactButton("保存标注");
    return Boolean(
      (saveButton && !saveButton.disabled) ||
        state.surface.classList.contains("cursor-crosshair"),
    );
  }

  function attachSurface(surface) {
    surface.addEventListener("pointerdown", onSurfacePointerDown, true);
    surface.addEventListener("pointerup", onSurfacePointerUp, true);
    surface.addEventListener("pointercancel", onSurfacePointerCancel, true);
  }

  function detachSurface(surface) {
    surface.removeEventListener("pointerdown", onSurfacePointerDown, true);
    surface.removeEventListener("pointerup", onSurfacePointerUp, true);
    surface.removeEventListener("pointercancel", onSurfacePointerCancel, true);
  }

  function resetGestureForRemount() {
    state.singlePending = null;
  }

  function syncPage() {
    state.syncQueued = false;
    if (!state.root || !document.contains(state.root)) buildToolbar();

    const nextPageKey = location.pathname;
    if (nextPageKey !== state.pageKey) {
      clearSingleModeIdleTimer();
      state.clearToken && (state.clearToken.cancelled = true);
      state.pageKey = nextPageKey;
      state.availabilityKey = "";
      resetGestureForRemount();
      setStatus("正在连接新的样本页面…", "info");
    }

    const nextSurface = document.querySelector(SURFACE_SELECTOR);
    const nextList = document.querySelector(CHAR_LIST_SELECTOR);
    if (nextSurface !== state.surface) {
      if (state.surface) detachSurface(state.surface);
      state.surface = nextSurface;
      resetGestureForRemount();
      if (state.surface) attachSurface(state.surface);
    }
    state.list = nextList;

    state.available = Boolean(
      state.surface &&
        state.list &&
        state.list.querySelectorAll("button").length > 0,
    );
    state.editable = state.available && isPageEditable();

    const availabilityKey = `${state.pageKey}:${state.available}:${state.editable}`;
    if (!state.busy && availabilityKey !== state.availabilityKey) {
      state.availabilityKey = availabilityKey;
      if (!state.available) {
        setStatus("未找到兼容的字框标注组件，等待页面加载。", "warning");
      } else if (!state.editable) {
        setStatus("当前页面处于只读或保存中状态，助手绘框已禁用。", "warning");
      } else {
        const messages = {
          "single-fixed": "单击画框：点击字的中心即可成框。",
          native: "助手已暂停，页面原生拖拽和移动功能可用。",
        };
        setStatus(messages[state.settings.drawMode], "success");
      }
    }
    ensureSingleModeIdleTimer();
    renderToolbar();
  }

  function scheduleSync() {
    if (state.syncQueued) return;
    state.syncQueued = true;
    requestAnimationFrame(syncPage);
  }

  async function initialize() {
    state.settings = normalizeSettings(await storageGet(SETTINGS_DEFAULTS));
    await storageSet({
      drawMode: state.settings.drawMode,
      settingsSchemaVersion: state.settings.settingsSchemaVersion,
    });
    buildToolbar();
    syncPage();

    const observer = new MutationObserver((mutations) => {
      if (
        state.root &&
        mutations.every((mutation) => state.root.contains(mutation.target))
      ) {
        return;
      }
      scheduleSync();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleSync);
  }

  initialize().catch((error) => {
    console.error("[字框标注助手] 初始化失败", error);
  });
})();
