(function exposeSiteRules(root, factory) {
  const api = factory();
  root.PluginToolboxSiteRules = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  const SEQUENCE_DOWNLOAD_PREFIX =
    "https://mapi.yuanfudao.com/evaluation/#/admin/evaluation/homework-correct-viewing/";
  const EVALUATION_PREFIXES = Object.freeze([
    "https://mapi.yuanfudao.com/evaluation/#/admin/evaluation/holepage/",
    "https://mapi.yuanfudao.com/evaluation/#/evaluation/holepage/",
    "https://mapi.yuanfudao.com/evaluation/#/admin/evaluation/cardPage/",
    "https://mapi.yuanfudao.com/evaluation/#/evaluation/cardPage/",
    "https://metis-match--mapi.online-venv.yuanfudao.com/evaluation/#/admin/evaluation/holepage/",
    "https://metis-match--mapi.online-venv.yuanfudao.com/evaluation/#/evaluation/holepage/",
    "https://metis-match--mapi.online-venv.yuanfudao.com/evaluation/#/admin/evaluation/cardPage/",
    "https://metis-match--mapi.online-venv.yuanfudao.com/evaluation/#/evaluation/cardPage/"
  ]);
  const RELEVANT_HOSTS = new Set([
    "mapi.yuanfudao.com",
    "metis-match--mapi.online-venv.yuanfudao.com"
  ]);

  function hrefOf(value) {
    if (typeof value === "string") return value;
    return typeof location === "object" ? location.href : "";
  }

  function isSequenceDownloadPage(url) {
    return hrefOf(url).startsWith(SEQUENCE_DOWNLOAD_PREFIX);
  }

  function isEvaluationPage(url) {
    const href = hrefOf(url);
    return EVALUATION_PREFIXES.some((prefix) => href.startsWith(prefix));
  }

  function isRelevantHost(url) {
    try {
      return RELEVANT_HOSTS.has(new URL(hrefOf(url)).hostname);
    } catch (_error) {
      return false;
    }
  }

  function isToolSupported(tool, url) {
    if (tool === "images") return isSequenceDownloadPage(url);
    if (tool === "eval") return isEvaluationPage(url);
    return true;
  }

  function unavailableMessage(tool) {
    if (tool === "images") {
      return "顺序下载仅支持线上作业批改详情页。";
    }
    if (tool === "eval") {
      return "评测仅支持 holepage 或 cardPage 评测详情页。";
    }
    return "当前页面不支持此工具。";
  }

  return Object.freeze({
    EVALUATION_PREFIXES,
    SEQUENCE_DOWNLOAD_PREFIX,
    isEvaluationPage,
    isRelevantHost,
    isSequenceDownloadPage,
    isToolSupported,
    unavailableMessage
  });
});
