"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const rules = require("../tool_site_rules.js");

const extensionRoot = path.resolve(__dirname, "..");
const read = (filename) =>
  fs.readFileSync(path.join(extensionRoot, filename), "utf8");

test("顺序下载仅匹配线上作业批改详情页", () => {
  assert.equal(
    rules.isSequenceDownloadPage(
      "https://mapi.yuanfudao.com/evaluation/#/admin/evaluation/homework-correct-viewing/3752208/2117085",
    ),
    true,
  );
  assert.equal(
    rules.isSequenceDownloadPage(
      "https://mapi.yuanfudao.com/evaluation/#/admin/evaluation/holepage/3752208/2117085/1",
    ),
    false,
  );
  assert.equal(
    rules.isSequenceDownloadPage(
      "https://example.com/evaluation/#/admin/evaluation/homework-correct-viewing/3752208/2117085",
    ),
    false,
  );
});

function createEvaluationDocument() {
  const option = (text) => ({
    querySelector: (selector) =>
      selector === 'input[type="radio"]' ? {} : null,
    querySelectorAll: (selector) =>
      selector === ":scope > span"
        ? [{ textContent: "" }, { textContent: text }]
        : [],
  });
  const formItem = {
    querySelector: (selector) =>
      selector === ".ant-form-item-label label"
        ? { textContent: "作答结果：" }
        : null,
    querySelectorAll: (selector) =>
      selector === "label.ant-radio-wrapper"
        ? [option("一致"), option("不一致")]
        : [],
  };
  const tab = {
    textContent: "作答结果",
    matches: (selector) => selector === ".ant-tabs-tab",
    closest: () => null,
  };
  return {
    querySelectorAll: (selector) => {
      if (selector === "[role='tab'], .ant-tabs-tab") return [tab];
      if (selector === ".ant-form-item") return [formItem];
      return [];
    },
  };
}

test("评测按网页功能结构识别，不再依赖 URL", () => {
  const page = createEvaluationDocument();
  assert.equal(rules.isEvaluationPage(page), true);
  assert.equal(
    rules.isToolSupported("eval", "https://temporary.example/task/123", page),
    true,
  );
  assert.equal(
    rules.isToolSupported(
      "eval",
      "https://mapi.yuanfudao.com/evaluation/#/evaluation/cardPage/1/2/1",
      { querySelectorAll: () => [] },
    ),
    false,
  );
});

test("字框标注按原网页三个核心区域识别", () => {
  const selectors = new Set([
    '[role="img"][aria-label="作文正文逐字标注图片"]',
    '[aria-label="逐字选择列表"]',
    'textarea[aria-label="正文文本"]',
  ]);
  const page = {
    querySelector: (selector) => (selectors.has(selector) ? {} : null),
  };
  assert.equal(rules.isOcrPage(page), true);
  assert.equal(
    rules.isToolSupported("ocr", "https://temporary.example/ocr/123", page),
    true,
  );
  selectors.delete('textarea[aria-label="正文文本"]');
  assert.equal(rules.isOcrPage(page), false);
});

test("网页脚本和弹窗共享内容规则并默认启用顺序下载与评测", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const contentEntry = manifest.content_scripts.find((entry) =>
    entry.js?.includes("content.js"),
  );
  assert.deepEqual(contentEntry.js, ["tool_site_rules.js", "content.js"]);

  const content = read("content.js");
  const popup = read("popup.js");
  const popupHtml = read("popup.html");
  const background = read("background.js");
  assert.match(content, /UI_STATE_SCHEMA_VERSION = 3/);
  assert.match(content, /images: true/);
  assert.match(content, /eval: true/);
  assert.match(content, /siteRules\.isSequenceDownloadPage\(location\.href\)/);
  assert.match(content, /siteRules\.isEvaluationPage\(document\)/);
  assert.match(content, /siteRules\.isOcrPage\(document\)/);
  assert.match(content, /TOOLBOX_GET_SUPPORT/);
  assert.match(content, /window\.setInterval\(\(\) => void syncRouteToolVisibility\(\), 1500\)/);
  assert.match(popup, /isToolSupportedOnTab\(tab, tool\)/);
  assert.match(popup, /TOOLBOX_GET_SUPPORT/);
  assert.ok(
    popupHtml.indexOf('src="tool_site_rules.js"') <
      popupHtml.indexOf('src="popup.js"'),
  );
  assert.match(background, /files: \["tool_site_rules\.js", "content\.js"\]/);
  assert.match(background, /hasOcrPageContent/);
});

test("独立评测插件同步使用内容识别和 SPA 异步监听", () => {
  const standalone = fs.readFileSync(
    path.resolve(
      extensionRoot,
      "..",
      "评测插件",
      "评测助手（AI&答题卡）",
      "content.js",
    ),
    "utf8",
  );
  assert.match(standalone, /function isEvaluationPage\(\)/);
  assert.match(standalone, /hasEvaluationTabStructure/);
  assert.match(standalone, /hasEvaluationFormStructure/);
  assert.match(standalone, /new MutationObserver\(scheduleAvailabilityCheck\)/);
  assert.doesNotMatch(standalone, /allowed\.some/);
  assert.doesNotMatch(standalone, /holepage\//);
  assert.doesNotMatch(standalone, /cardPage\//);
});
