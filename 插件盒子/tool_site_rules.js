(function exposeSiteRules(root, factory) {
  const api = factory();
  root.PluginToolboxSiteRules = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  const SEQUENCE_DOWNLOAD_PREFIX =
    "https://mapi.yuanfudao.com/evaluation/#/admin/evaluation/homework-correct-viewing/";
  const EVALUATION_TAB_NAMES = new Set([
    "作答结果",
    "手写识别",
    "答案框",
    "题目框",
    "分数识别",
    "固定批改"
  ]);
  const EVALUATION_FIELD_PREFIXES = [
    "作答",
    "识别",
    "答案框",
    "题目框",
    "分数识别",
    "分数框识别",
    "老师批改",
    "算法可解"
  ];
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
  function hrefOf(value) {
    if (typeof value === "string") return value;
    return typeof location === "object" ? location.href : "";
  }

  function isSequenceDownloadPage(url) {
    return hrefOf(url).startsWith(SEQUENCE_DOWNLOAD_PREFIX);
  }

  function normalizedText(value) {
    return String(value || "").replace(/\s+/g, "").replace(/[：:]/g, "");
  }

  function queryAll(root, selector) {
    try {
      return Array.from(root?.querySelectorAll?.(selector) || []);
    } catch (_error) {
      return [];
    }
  }

  function isEvaluationPage(root) {
    const tabs = queryAll(root, "[role='tab'], .ant-tabs-tab");
    const hasEvaluationTab = tabs.some(
      (tab) =>
        EVALUATION_TAB_NAMES.has(normalizedText(tab.textContent)) &&
        (tab.matches?.(".ant-tabs-tab") ||
          tab.closest?.(".ant-tabs, .ant-tabs-nav"))
    );
    if (!hasEvaluationTab) return false;

    const formItems = queryAll(root, ".ant-form-item");
    return formItems.some((formItem) => {
      const label = formItem.querySelector?.(".ant-form-item-label label");
      const fieldName = normalizedText(label?.textContent);
      if (
        !EVALUATION_FIELD_PREFIXES.some((prefix) =>
          fieldName.startsWith(prefix)
        )
      ) {
        return false;
      }

      const options = queryAll(formItem, "label.ant-radio-wrapper");
      const recognizedOptions = options.filter((option) => {
        if (!option.querySelector?.('input[type="radio"]')) return false;
        const spans = queryAll(option, ":scope > span");
        return EVALUATION_OPTION_NAMES.has(
          normalizedText(spans[spans.length - 1]?.textContent)
        );
      });
      return recognizedOptions.length >= 2;
    });
  }

  function isOcrPage(root) {
    try {
      return Boolean(
        root?.querySelector?.(
          '[role="img"][aria-label="作文正文逐字标注图片"]'
        ) &&
          root?.querySelector?.('[aria-label="逐字选择列表"]') &&
          root?.querySelector?.('textarea[aria-label="正文文本"]')
      );
    } catch (_error) {
      return false;
    }
  }

  function isToolSupported(tool, url, contentRoot) {
    if (tool === "images") return isSequenceDownloadPage(url);
    if (tool === "eval") return isEvaluationPage(contentRoot);
    if (tool === "ocr") return isOcrPage(contentRoot);
    return true;
  }

  function unavailableMessage(tool) {
    if (tool === "images") {
      return "顺序下载仅支持线上作业批改详情页。";
    }
    if (tool === "eval") {
      return "当前网页未识别到可评测的任务内容。";
    }
    if (tool === "ocr") {
      return "当前网页未识别到作文正文单字框标注内容。";
    }
    return "当前页面不支持此工具。";
  }

  return Object.freeze({
    SEQUENCE_DOWNLOAD_PREFIX,
    isEvaluationPage,
    isOcrPage,
    isSequenceDownloadPage,
    isToolSupported,
    unavailableMessage
  });
});
