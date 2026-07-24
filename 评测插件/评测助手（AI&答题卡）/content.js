(() => {
  const STORAGE_KEY = "eval_helper_config_v3";
  
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

  function normText(text) {
    return (text || "").replace(/\s+/g, "").trim();
  }

  function isVisibleFast(el) {
    return !!el && el.getClientRects().length > 0;
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  function showToast(message, durationMs = 2600) {
    const old = document.getElementById("__eval_helper_toast");
    if (old) old.remove();
    const toast = document.createElement("div");
    toast.id = "__eval_helper_toast";
    toast.textContent = message;
    toast.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "background:rgba(0,0,0,0.85)",
      "color:#fff",
      "padding:12px 16px",
      "border-radius:10px",
      "font-size:13px",
      "line-height:1.4",
      "box-shadow:0 8px 32px rgba(0,0,0,0.3)",
      "max-width:320px",
      "pointer-events:none",
      "transition: opacity 0.3s ease"
    ].join(";");
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), durationMs);
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
    const raw = normText(labelNode ? labelNode.textContent : "");
    return raw.replace(/：|:/g, "");
  }

  function findOptionLabel(formItem, targetOption) {
    const wrappers = formItem.querySelectorAll("label.ant-radio-wrapper");
    for (let i = 0; i < wrappers.length; i++) {
      const wrapper = wrappers[i];
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
    for (let i = 0; i < wrappers.length; i++) {
      const spans = wrappers[i].querySelectorAll(":scope > span");
      if (!spans.length) continue;
      const text = normText(spans[spans.length - 1].textContent);
      if (text === optionText) return true;
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
    for (let i = 0; i < formItems.length; i++) {
      const formItem = formItems[i];
      if (!isVisibleFast(formItem)) continue;
      const field = extractFieldName(formItem);
      if (!field) continue;
      const targetOption = getRuleForField(field, config, tabText);
      if (!targetOption) continue;

      if (tabText === "答案框" && field.startsWith("答案框-") && hasOption(formItem, "无留痕")) {
        continue;
      }

      const option = findOptionLabel(formItem, targetOption);
      if (!option) continue;
      if (option.input.checked) continue;
      option.wrapper.click();
      changed++;
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
    const maxScrolls = 250;

    for (let i = 0; i < maxScrolls; i++) {
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

  async function run(config) {
    const tabsToRun = [];
    if (config.result) tabsToRun.push("作答结果");
    if (config.handwriting) tabsToRun.push("手写识别");
    if (config.answer) tabsToRun.push("答案框");
    if (config.question) tabsToRun.push("题目框");
    if (config.score) tabsToRun.push("分数识别");
    if (config.fixed) tabsToRun.push("固定批改");

    if (!tabsToRun.length) {
      showToast("未选择评测项");
      return;
    }

    const waitLoopLimit = 3;
    let waitClicked = 0;
    let keepWaitLoop = true;
    const waiter = (async () => {
      while (keepWaitLoop && waitClicked < waitLoopLimit) {
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

    showToast(`评测完成：更改 ${totalChanged} 项`);
  }

  // UI Code
  function injectStyles() {
    if (document.getElementById("__eval_helper_styles")) return;
    const style = document.createElement("style");
    style.id = "__eval_helper_styles";
    style.textContent = `
      #eval-helper-trigger {
        position: fixed;
        right: 35px;
        top: 12%;
        width: 50px;
        height: 50px;
        background: #52c41a;
        color: white;
        border-radius: 25px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 99999;
        box-shadow: 0 4px 12px rgba(82,196,26,0.4);
        font-size: 14px;
        font-weight: bold;
        transition: all 0.3s;
        user-select: none;
      }
      #eval-helper-trigger:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 16px rgba(82,196,26,0.5);
      }
      #eval-helper-panel {
        position: fixed;
        right: 95px;
        top: 10%;
        width: 320px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        z-index: 100000;
        overflow: hidden;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }
      #eval-helper-panel.visible {
        display: block;
        animation: panel-fade-in 0.2s ease-out;
      }
      @keyframes panel-fade-in {
        from { opacity: 0; transform: translateX(10px); }
        to { opacity: 1; transform: translateX(0); }
      }
      .eh-header {
        background: #f0f2f5;
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #e8e8e8;
      }
      .eh-title {
        font-weight: 600;
        color: #262626;
        font-size: 15px;
      }
      .eh-close {
        cursor: pointer;
        color: #8c8c8c;
        font-size: 18px;
        line-height: 1;
      }
      .eh-close:hover { color: #595959; }
      .eh-body {
        padding: 16px;
        max-height: 500px;
        overflow-y: auto;
      }
      .eh-row {
        display: flex;
        align-items: center;
        margin-bottom: 12px;
      }
      .eh-left {
        flex: 1;
        display: flex;
        align-items: center;
      }
      .eh-right {
        width: 120px;
        margin-left: 10px;
      }
      .eh-checkbox {
        margin-right: 8px;
        cursor: pointer;
        width: 16px;
        height: 16px;
      }
      .eh-label {
        font-size: 14px;
        color: #595959;
        cursor: pointer;
      }
      .eh-label.sub-title {
        font-size: 12px;
        color: #8c8c8c;
        margin-left: 10px;
      }
      .eh-select {
        width: 100%;
        height: 28px;
        border: 1px solid #d9d9d9;
        border-radius: 4px;
        font-size: 13px;
        color: #595959;
        outline: none;
      }
      .eh-select:disabled {
        background: #f5f5f5;
        color: #bfbfbf;
      }
      .eh-footer {
        padding: 16px;
        border-top: 1px solid #e8e8e8;
        display: flex;
        justify-content: center;
      }
      .eh-btn {
        width: 100%;
        height: 36px;
        background: #1890ff;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background 0.3s;
      }
      .eh-btn:hover { background: #40a9ff; }
      .eh-btn:disabled { background: #bfbfbf; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }

  let currentConfig = { ...DEFAULT_CONFIG };

  async function loadConfig() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    if (data[STORAGE_KEY]) {
      currentConfig = { ...DEFAULT_CONFIG, ...data[STORAGE_KEY] };
    }
  }

  async function saveConfig() {
    await chrome.storage.local.set({ [STORAGE_KEY]: currentConfig });
  }

  function createUI() {
    injectStyles();

    // Trigger Button
    const trigger = document.createElement("div");
    trigger.id = "eval-helper-trigger";
    trigger.textContent = "评测";
    document.body.appendChild(trigger);

    // Panel
    const panel = document.createElement("div");
    panel.id = "eval-helper-panel";
    
    const header = `
      <div class="eh-header">
        <span class="eh-title">评测助手（AI&答卡）</span>
        <span class="eh-close">&times;</span>
      </div>
    `;

    const bodyItems = [
      { id: "result", label: "作答结果", select: "resultAnswer", options: ["一致", "不一致", "半对", "忽略", "未作答"] },
      { id: "resultSolvable", label: "算法可解", select: "resultSolvable", options: ["是", "否"], isSub: true, parent: "result" },
      { id: "handwriting", label: "手写识别", select: "handwritingValue", options: ["一致", "不一致", "忽略"] },
      { id: "answer", label: "答案框", select: "answerValue", options: ["对", "错", "忽略"] },
      { id: "question", label: "题目框", select: "questionValue", options: ["对", "错", "忽略"] },
      { id: "score", label: "分数识别", select: "scoreValue", options: ["一致", "不一致", "忽略"] },
      { id: "scoreBorder", label: "分数框识别", select: "scoreBorderValue", options: ["对", "错", "忽略"], isSub: true, parent: "score" },
      { id: "scoreSolvable", label: "算法可解", select: "scoreSolvableValue", options: ["是", "否"], isSub: true, parent: "score" },
      { id: "fixed", label: "固定批改", select: "fixedValue", options: ["未批改", "对", "错", "半对", "忽略"] },
      { id: "fixedSolvable", label: "算法可解", select: "fixedSolvableValue", options: ["是", "否"], isSub: true, parent: "fixed" },
    ];

    let bodyHtml = '<div class="eh-body">';
    bodyItems.forEach(item => {
      const isSub = item.isSub;
      const labelPrefix = isSub ? "- " : "";
      const labelClass = isSub ? "eh-label sub-title" : "eh-label";
      const rowStyle = isSub ? "" : "margin-top: 8px;";
      
      bodyHtml += `
        <div class="eh-row" style="${rowStyle}">
          <div class="eh-left">
            ${!isSub ? `<input type="checkbox" class="eh-checkbox" id="eh-cb-${item.id}">` : '<div style="width:24px"></div>'}
            <label class="${labelClass}" for="${!isSub ? `eh-cb-${item.id}` : ''}">${labelPrefix}${item.label}</label>
          </div>
          <div class="eh-right">
            <select class="eh-select" id="eh-sel-${item.select}">
              ${item.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
            </select>
          </div>
        </div>
      `;
    });
    bodyHtml += '</div>';

    const footer = `
      <div class="eh-footer">
        <button class="eh-btn" id="eh-run-btn">开始评测</button>
      </div>
    `;

    panel.innerHTML = header + bodyHtml + footer;
    document.body.appendChild(panel);

    // Event Listeners
    trigger.addEventListener("click", () => {
      panel.classList.toggle("visible");
    });

    panel.querySelector(".eh-close").addEventListener("click", () => {
      panel.classList.remove("visible");
    });

    // Update UI from config
    bodyItems.forEach(item => {
      if (!item.isSub) {
        const cb = panel.querySelector(`#eh-cb-${item.id}`);
        cb.checked = currentConfig[item.id];
        cb.addEventListener("change", (e) => {
          currentConfig[item.id] = e.target.checked;
          updateSelectStates();
          saveConfig();
        });
      }
      const sel = panel.querySelector(`#eh-sel-${item.select}`);
      sel.value = currentConfig[item.select];
      sel.addEventListener("change", (e) => {
        currentConfig[item.select] = e.target.value;
        saveConfig();
      });
    });

    function updateSelectStates() {
      bodyItems.forEach(item => {
        const parentId = item.isSub ? item.parent : item.id;
        const enabled = currentConfig[parentId];
        panel.querySelector(`#eh-sel-${item.select}`).disabled = !enabled;
      });
    }

    updateSelectStates();

    panel.querySelector("#eh-run-btn").addEventListener("click", async () => {
      const btn = panel.querySelector("#eh-run-btn");
      btn.disabled = true;
      btn.textContent = "运行中...";
      panel.classList.remove("visible");
      
      try {
        await run(currentConfig);
      } catch (e) {
        console.error(e);
        showToast("运行出错，请查看控制台");
      } finally {
        btn.disabled = false;
        btn.textContent = "开始评测";
      }
    });
  }

  let manualShow = false;
  let availabilityCheckTimer = 0;

  const EVALUATION_TAB_NAMES = new Set([
    "作答结果",
    "手写识别",
    "答案框",
    "题目框",
    "分数识别",
    "固定批改"
  ]);

  const EVALUATION_OPTION_NAMES = new Set([
    "一致",
    "不一致",
    "半对",
    "忽略",
    "未作答",
    "是",
    "否",
    "对",
    "错",
    "未批改",
    "无留痕"
  ]);

  function isEvaluationField(fieldName) {
    return (
      fieldMatches(
        fieldName,
        "作答",
        "识别",
        "答案框-",
        "题目框",
        "老师批改-"
      ) ||
      fieldName === "算法可解" ||
      fieldName === "分数识别" ||
      fieldName === "分数框识别" ||
      fieldName === "老师批改"
    );
  }

  function hasEvaluationTabStructure() {
    const tabs = document.querySelectorAll(".ant-tabs-tab, [role='tab']");
    for (const tab of tabs) {
      if (!EVALUATION_TAB_NAMES.has(normText(tab.textContent))) continue;
      if (tab.matches(".ant-tabs-tab") || tab.closest(".ant-tabs, .ant-tabs-nav")) {
        return true;
      }
    }
    return false;
  }

  function hasEvaluationFormStructure() {
    const formItems = document.querySelectorAll(".ant-form-item");
    for (const formItem of formItems) {
      const fieldName = extractFieldName(formItem);
      if (!fieldName || !isEvaluationField(fieldName)) continue;

      const optionLabels = formItem.querySelectorAll("label.ant-radio-wrapper");
      if (optionLabels.length < 2) continue;

      let recognizedOptions = 0;
      for (const optionLabel of optionLabels) {
        const input = optionLabel.querySelector('input[type="radio"]');
        const spans = optionLabel.querySelectorAll(":scope > span");
        if (!input || !spans.length) continue;
        const optionName = normText(spans[spans.length - 1].textContent);
        if (EVALUATION_OPTION_NAMES.has(optionName)) recognizedOptions++;
      }
      if (recognizedOptions >= 2) return true;
    }
    return false;
  }

  function isEvaluationPage() {
    return hasEvaluationTabStructure() && hasEvaluationFormStructure();
  }

  function checkAvailability() {
    const isAllowed = manualShow || isEvaluationPage();
    const trigger = document.getElementById("eval-helper-trigger");
    const panel = document.getElementById("eval-helper-panel");

    if (isAllowed) {
      if (!trigger) {
        createUI();
      } else {
        trigger.style.display = "flex";
      }
    } else {
      if (trigger) trigger.style.display = "none";
      if (panel) panel.classList.remove("visible");
    }
  }

  function scheduleAvailabilityCheck() {
    clearTimeout(availabilityCheckTimer);
    availabilityCheckTimer = window.setTimeout(checkAvailability, 120);
  }

  async function init() {
    await loadConfig();
    checkAvailability();

    const observer = new MutationObserver(scheduleAvailabilityCheck);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Fallback for SPA updates that reuse nodes without producing useful mutations.
    setInterval(checkAvailability, 2000);

    // Manual trigger listener
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "TOGGLE_EVAL_HELPER") {
        manualShow = !manualShow;
        checkAvailability();
        if (manualShow) {
          showToast("手动模式：评测按钮已呼出");
        }
      }
    });
  }

  init();
})();
