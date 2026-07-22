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

test("评测仅匹配生产和 online-venv 的 holepage/cardPage", () => {
  const supported = [
    "https://mapi.yuanfudao.com/evaluation/#/admin/evaluation/holepage/1/2/1",
    "https://mapi.yuanfudao.com/evaluation/#/evaluation/cardPage/1/2/1",
    "https://metis-match--mapi.online-venv.yuanfudao.com/evaluation/#/admin/evaluation/cardPage/1/2/1",
    "https://metis-match--mapi.online-venv.yuanfudao.com/evaluation/#/evaluation/holepage/1/2/1",
  ];
  for (const url of supported) {
    assert.equal(rules.isEvaluationPage(url), true, url);
  }
  assert.equal(
    rules.isEvaluationPage(
      "https://mapi.yuanfudao.com/evaluation/#/admin/evaluation/homework-correct-viewing/1/2",
    ),
    false,
  );
  assert.equal(
    rules.isEvaluationPage(
      "https://example.com/evaluation/#/admin/evaluation/holepage/1/2/1",
    ),
    false,
  );
});

test("网页脚本和弹窗共享规则并默认启用两个按钮", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const contentEntry = manifest.content_scripts.find((entry) =>
    entry.js?.includes("content.js"),
  );
  assert.deepEqual(contentEntry.js, ["tool_site_rules.js", "content.js"]);

  const content = read("content.js");
  const popup = read("popup.js");
  const popupHtml = read("popup.html");
  const background = read("background.js");
  assert.match(content, /UI_STATE_SCHEMA_VERSION = 2/);
  assert.match(content, /images: true/);
  assert.match(content, /eval: true/);
  assert.match(content, /siteRules\.isSequenceDownloadPage\(location\.href\)/);
  assert.match(content, /siteRules\.isEvaluationPage\(location\.href\)/);
  assert.match(content, /window\.setInterval\(\(\) => void syncRouteToolVisibility\(\), 1500\)/);
  assert.match(popup, /siteRules\.isToolSupported\(tool, tab\.url \|\| ""\)/);
  assert.ok(
    popupHtml.indexOf('src="tool_site_rules.js"') <
      popupHtml.indexOf('src="popup.js"'),
  );
  assert.match(background, /files: \["tool_site_rules\.js", "content\.js"\]/);
});
