(() => {
  if (window.__XYJ_EVAL_HELPER_LOADED__) {
    return;
  }
  window.__XYJ_EVAL_HELPER_LOADED__ = true;

  const STORAGE_KEY = "xyj_eval_helper_config_v1";
  const ROOT_ID = "__xyj_eval_helper";
  const DEFAULT_CONFIG = {
    referenceAnswer: "原题",
    missedBlankCount: "0",
    blankOption: "正确",
    missedQuestionCount: "0"
  };
  const BLANK_OPTIONS = ["正确", "错误", "部分正确", "未作答", "不可批改"];
  const ALLOWED_HASH_PREFIXES = [
    "#/task/question-eval/"
  ];

  let currentConfig = { ...DEFAULT_CONFIG };
  let manualShow = false;
  let root;
  let panel;
  let runButton;

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "XYJ_EVAL_TOGGLE") {
      return false;
    }

    manualShow = !manualShow;
    updateVisibility();
    if (manualShow) {
      showToast("小猿家评测按钮已呼出");
    }
    return false;
  });

  function normText(text) {
    return String(text || "").replace(/\s+/g, "").trim();
  }

  function isVisible(el) {
    return !!el && el.getClientRects().length > 0;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function isAllowedPage() {
    return manualShow || ALLOWED_HASH_PREFIXES.some((prefix) => window.location.hash.startsWith(prefix));
  }

  async function loadConfig() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    currentConfig = { ...DEFAULT_CONFIG, ...(data[STORAGE_KEY] || {}) };
    if (!BLANK_OPTIONS.includes(currentConfig.blankOption)) {
      currentConfig.blankOption = DEFAULT_CONFIG.blankOption;
    }
  }

  async function saveConfig() {
    await chrome.storage.local.set({ [STORAGE_KEY]: currentConfig });
  }

  function injectStyles() {
    if (document.getElementById("__xyj_eval_helper_style")) return;

    const style = document.createElement("style");
    style.id = "__xyj_eval_helper_style";
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        right: 34px;
        top: 12%;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
        color: #262626;
      }
      #${ROOT_ID}.xyj-hidden {
        display: none;
      }
      .xyj-trigger {
        width: 52px;
        height: 52px;
        border: 0;
        border-radius: 50%;
        background: #ff6000;
        color: #fff;
        cursor: pointer;
        box-shadow: 0 8px 22px rgba(255, 96, 0, 0.36);
        font-size: 14px;
        font-weight: 700;
        transition: transform 0.16s ease, box-shadow 0.16s ease;
      }
      .xyj-trigger:hover {
        transform: translateY(-1px) scale(1.04);
        box-shadow: 0 10px 26px rgba(255, 96, 0, 0.44);
      }
      .xyj-panel {
        display: none;
        position: absolute;
        right: 66px;
        top: -10px;
        width: 326px;
        overflow: hidden;
        border: 1px solid #f0f0f0;
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 12px 34px rgba(0, 0, 0, 0.16);
      }
      .xyj-panel.xyj-open {
        display: block;
      }
      .xyj-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 13px 16px;
        background: #fff7f0;
        border-bottom: 1px solid #f2e5dc;
      }
      .xyj-title {
        font-size: 15px;
        font-weight: 700;
        color: #262626;
      }
      .xyj-close {
        width: 26px;
        height: 26px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #8c8c8c;
        cursor: pointer;
        font-size: 20px;
        line-height: 22px;
      }
      .xyj-close:hover {
        background: rgba(0, 0, 0, 0.06);
        color: #595959;
      }
      .xyj-body {
        display: grid;
        gap: 12px;
        padding: 16px;
      }
      .xyj-row {
        display: grid;
        grid-template-columns: 96px minmax(0, 1fr);
        align-items: center;
        gap: 10px;
      }
      .xyj-label {
        color: #595959;
        font-size: 13px;
        font-weight: 600;
      }
      .xyj-select,
      .xyj-input {
        width: 100%;
        height: 30px;
        box-sizing: border-box;
        border: 1px solid #d9d9d9;
        border-radius: 6px;
        background: #fff;
        color: #262626;
        font-size: 13px;
        outline: none;
        padding: 0 9px;
      }
      .xyj-select:focus,
      .xyj-input:focus {
        border-color: #ff8a3d;
        box-shadow: 0 0 0 2px rgba(255, 96, 0, 0.12);
      }
      .xyj-footer {
        padding: 0 16px 16px;
      }
      .xyj-run {
        width: 100%;
        height: 36px;
        border: 0;
        border-radius: 8px;
        background: #ff6000;
        color: #fff;
        cursor: pointer;
        font-size: 14px;
        font-weight: 700;
      }
      .xyj-run:hover {
        background: #ff7a1a;
      }
      .xyj-run:disabled {
        background: #bfbfbf;
        cursor: not-allowed;
      }
      .xyj-toast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        max-width: 340px;
        padding: 11px 14px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.84);
        color: #fff;
        font-size: 13px;
        line-height: 1.45;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function buildUI() {
    if (root) return;
    injectStyles();

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "xyj-hidden";
    root.innerHTML = `
      <button class="xyj-trigger" type="button" title="小猿家评测助手">评测</button>
      <section class="xyj-panel" aria-label="小猿家评测助手">
        <div class="xyj-head">
          <span class="xyj-title">小猿家评测助手</span>
          <button class="xyj-close" type="button" title="关闭">×</button>
        </div>
        <div class="xyj-body">
          <label class="xyj-row">
            <span class="xyj-label">参考答案</span>
            <select class="xyj-select" data-key="referenceAnswer">
              <option value="原题">原题</option>
              <option value="相似题">相似题</option>
              <option value="不可参考">不可参考</option>
            </select>
          </label>
          <label class="xyj-row">
            <span class="xyj-label">漏空数</span>
            <input class="xyj-input" data-key="missedBlankCount" min="0" step="1" type="number">
          </label>
          <label class="xyj-row">
            <span class="xyj-label">各小空</span>
            <select class="xyj-select" data-key="blankOption">
              <option value="正确">正确</option>
              <option value="错误">错误</option>
              <option value="部分正确">部分正确</option>
              <option value="未作答">未作答</option>
              <option value="不可批改">不可批改</option>
            </select>
          </label>
          <label class="xyj-row">
            <span class="xyj-label">漏题数</span>
            <input class="xyj-input" data-key="missedQuestionCount" min="0" step="1" type="number">
          </label>
        </div>
        <div class="xyj-footer">
          <button class="xyj-run" type="button">开始评测</button>
        </div>
      </section>
    `;

    document.body.appendChild(root);
    panel = root.querySelector(".xyj-panel");
    runButton = root.querySelector(".xyj-run");

    root.querySelector(".xyj-trigger").addEventListener("click", () => {
      panel.classList.toggle("xyj-open");
    });
    root.querySelector(".xyj-close").addEventListener("click", () => {
      panel.classList.remove("xyj-open");
    });

    root.querySelectorAll("[data-key]").forEach((control) => {
      const key = control.dataset.key;
      control.value = currentConfig[key];
      control.addEventListener("change", () => {
        currentConfig[key] = control.value;
        void saveConfig();
      });
    });

    runButton.addEventListener("click", async () => {
      await runFromButton();
    });
  }

  async function runFromButton() {
    runButton.disabled = true;
    runButton.textContent = "运行中...";
    panel.classList.remove("xyj-open");

    try {
      syncConfigFromUI();
      await saveConfig();
      const result = await run(currentConfig);
      showToast(`评测完成：参考答案 ${result.referenceChanged ? "已设置" : "未变更"}，漏空数 ${result.blankCountChanged ? "已设置" : "未变更"}，小空 ${result.blankChanged} 项，漏题数 ${result.questionCountChanged ? "已设置" : "未变更"}`);
    } catch (error) {
      console.error(error);
      showToast(error?.message || "运行出错，请查看控制台");
    } finally {
      runButton.disabled = false;
      runButton.textContent = "开始评测";
    }
  }

  function syncConfigFromUI() {
    root.querySelectorAll("[data-key]").forEach((control) => {
      currentConfig[control.dataset.key] = control.value;
    });
  }

  async function run(config) {
    const result = {
      referenceChanged: false,
      blankCountChanged: false,
      blankChanged: 0,
      questionCountChanged: false
    };

    result.referenceChanged = clickRadioInSection("参考答案", config.referenceAnswer);
    result.blankCountChanged = setNumberNearText("漏空数", config.missedBlankCount);
    result.blankChanged = await applyAnswerItems(config.blankOption);
    result.questionCountChanged = setNumberNearText("漏题数", config.missedQuestionCount);

    return result;
  }

  function clickRadioInSection(sectionText, optionText) {
    const sections = Array.from(document.querySelectorAll(".section_WinEr, .ant-form-item, div, section"))
      .filter((el) => isVisible(el) && normText(el.textContent).includes(sectionText));

    for (const section of sections) {
      const option = findRadioLabel(section, optionText);
      if (option) {
        return clickRadioLabel(option);
      }
    }

    const globalOption = findRadioLabel(document, optionText, (label) => {
      const text = normText(label.closest(".ant-radio-group")?.textContent || "");
      return text.includes("原题") && text.includes("相似题") && text.includes("不可参考");
    });
    return globalOption ? clickRadioLabel(globalOption) : false;
  }

  function findRadioLabel(rootNode, optionText, groupPredicate = null) {
    const labels = Array.from(rootNode.querySelectorAll("label.ant-radio-wrapper"));
    for (const label of labels) {
      if (!isVisible(label)) continue;
      const group = label.closest(".ant-radio-group");
      if (groupPredicate && !groupPredicate(label, group)) continue;
      if (normText(label.querySelector(".ant-radio-label")?.textContent || label.textContent) === optionText) {
        return label;
      }
    }
    return null;
  }

  function clickRadioLabel(label) {
    const input = label.querySelector('input[type="radio"]');
    if (input?.checked) {
      return false;
    }
    label.click();
    return true;
  }

  function setNumberNearText(labelText, value) {
    const normalizedValue = normalizeCount(value);
    const candidates = Array.from(document.querySelectorAll("span, div, label"))
      .filter((el) => isVisible(el) && normText(el.textContent).includes(labelText))
      .sort((a, b) => normText(a.textContent).length - normText(b.textContent).length);

    for (const candidate of candidates) {
      const input = findInputNumber(candidate) ||
        findInputNumber(candidate.parentElement) ||
        findInputNumber(candidate.closest(".footer_zX1vw, [class*='blank-tools_'], [class*='miss-blank-count_']"));
      if (!input) continue;
      return setNativeValue(input, normalizedValue);
    }
    return false;
  }

  function findInputNumber(rootNode) {
    if (!rootNode) return null;
    if (rootNode.matches?.("input.ant-input-number-input, input[role='spinbutton']")) {
      return rootNode;
    }
    return rootNode.querySelector?.("input.ant-input-number-input, input[role='spinbutton']") || null;
  }

  function normalizeCount(value) {
    const number = Number.parseInt(String(value || "0"), 10);
    return String(Number.isFinite(number) && number >= 0 ? number : 0);
  }

  function setNativeValue(input, value) {
    const oldValue = input.value;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter" }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter" }));
    input.blur();
    return oldValue !== value;
  }

  async function applyAnswerItems(optionText) {
    let totalChanged = 0;
    const seen = new Set();

    for (const scrollEl of getScrollTargets()) {
      let stable = 0;
      let lastTop = -1;

      setScrollTop(scrollEl, 0);
      await nextFrame();

      for (let i = 0; i < 140; i += 1) {
        const changed = applyVisibleAnswerItems(optionText, seen);
        totalChanged += changed;
        stable = changed === 0 ? stable + 1 : 0;

        const currentTop = getScrollTop(scrollEl);
        if (isNearBottom(scrollEl) && stable >= 2) break;
        if (currentTop === lastTop && stable >= 2) break;

        lastTop = currentTop;
        scrollByAmount(scrollEl, Math.max(360, Math.floor(window.innerHeight * 0.8)));
        await nextFrame();
        if (i % 15 === 0) await wait(20);
      }

      setScrollTop(scrollEl, 0);
    }

    totalChanged += applyVisibleAnswerItems(optionText, seen);
    return totalChanged;
  }

  function applyVisibleAnswerItems(optionText, seen) {
    let changed = 0;
    const items = Array.from(document.querySelectorAll("[class*='answer-item_']"));

    for (const item of items) {
      if (!isVisible(item)) continue;
      const key = normText(item.querySelector("[class*='answer-item-index_']")?.textContent || item.textContent);
      if (seen.has(key)) continue;

      const option = findRadioLabel(item, optionText);
      if (!option) continue;
      seen.add(key);
      if (clickRadioLabel(option)) {
        changed += 1;
      }
    }

    return changed;
  }

  function getScrollTargets() {
    const targets = [document.scrollingElement || document.documentElement];
    const all = Array.from(document.querySelectorAll("main, aside, section, div"));
    for (const el of all) {
      if (!isVisible(el)) continue;
      const style = window.getComputedStyle(el);
      const canScroll = /(auto|scroll)/.test(`${style.overflowY}${style.overflow}`);
      if (canScroll && el.scrollHeight > el.clientHeight + 40) {
        targets.push(el);
      }
    }
    return targets;
  }

  function getScrollTop(el) {
    return el === document.scrollingElement || el === document.documentElement ? window.scrollY : el.scrollTop;
  }

  function setScrollTop(el, top) {
    if (el === document.scrollingElement || el === document.documentElement) {
      window.scrollTo(0, top);
      return;
    }
    el.scrollTop = top;
  }

  function scrollByAmount(el, amount) {
    if (el === document.scrollingElement || el === document.documentElement) {
      window.scrollBy(0, amount);
      return;
    }
    el.scrollBy(0, amount);
  }

  function isNearBottom(el) {
    if (el === document.scrollingElement || el === document.documentElement) {
      const scrollEl = document.scrollingElement || document.documentElement;
      return window.scrollY + window.innerHeight >= scrollEl.scrollHeight - 12;
    }
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 12;
  }

  function showToast(message, durationMs = 2800) {
    const old = document.querySelector(".xyj-toast");
    if (old) old.remove();
    const toast = document.createElement("div");
    toast.className = "xyj-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), durationMs);
  }

  function updateVisibility() {
    if (!root) buildUI();
    const allowed = isAllowedPage();
    root.classList.toggle("xyj-hidden", !allowed);
    if (!allowed && panel) {
      panel.classList.remove("xyj-open");
    }
  }

  async function init() {
    await loadConfig();
    buildUI();
    updateVisibility();
    window.addEventListener("hashchange", updateVisibility);
    setInterval(updateVisibility, 1500);
  }

  void init();
})();
