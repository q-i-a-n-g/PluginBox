"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const extensionRoot = path.resolve(__dirname, "..");
const read = (filename) =>
  fs.readFileSync(path.join(extensionRoot, filename), "utf8");
const manifest = JSON.parse(read("manifest.json"));

test("字框标注资源已加入插件盒子并限制在目标页面", () => {
  const entry = manifest.content_scripts.find((item) =>
    item.js?.includes("ocr_box_tool.js"),
  );
  assert.ok(entry);
  assert.deepEqual(entry.matches, [
    "https://metis-aione-test.zhenguanyu.com/metis-aione-eval/samples/*",
  ]);
  assert.deepEqual(entry.js, ["ocr_box_core.js", "ocr_box_tool.js"]);
  assert.deepEqual(entry.css, ["ocr_box_tool.css"]);

  for (const asset of [...entry.js, ...entry.css]) {
    assert.equal(fs.existsSync(path.join(extensionRoot, asset)), true, asset);
  }
});

test("字框标注默认隐藏并使用独立界面标识", () => {
  const source = read("ocr_box_tool.js");
  const styles = read("ocr_box_tool.css");
  assert.match(source, /window\[VISIBILITY_REQUEST_KEY\] === true/);
  assert.match(source, /ROOT_ID = "ptb-ocr-box-helper-root"/);
  assert.match(styles, /#ptb-ocr-box-helper-root\[data-interface-visible="false"\]/);
  assert.doesNotMatch(styles, /^#ocr-box-helper-root\b/m);
});

test("盒子入口可切换字框标注并保存显示状态", () => {
  const content = read("content.js");
  const popup = read("popup.html");
  const background = read("background.js");
  assert.match(content, /ocr: false/);
  assert.match(content, /setToolVisible\("ocr", !uiState\.tools\.ocr\)/);
  assert.match(content, /chrome\.storage\.local\.set\(\{ \[UI_STATE_KEY\]: uiState \}\)/);
  assert.match(content, /ptb-tool-icon ocr">Z</);
  assert.match(popup, /data-tool="ocr"/);
  assert.match(popup, /icon ocr">Z</);
  assert.match(popup, /#2563eb 0%, #facc15 50%, #06b6d4 100%/);
  assert.match(background, /TOOLBOX_SET_OCR_VISIBILITY/);
  assert.match(background, /chrome\.scripting\.executeScript/);
  assert.match(background, /OCR_SAMPLE_PATH_PREFIX/);
});

test("盒子版保留完整字框功能并按新顺序显示模式", () => {
  const source = read("ocr_box_tool.js");
  const singlePosition = source.indexOf('data-mode="single-fixed"');
  const pausePosition = source.indexOf('data-mode="native"');
  assert.ok(singlePosition >= 0 && singlePosition < pausePosition);

  for (const marker of [
    'data-action="shrink-size"',
    'data-action="enlarge-size"',
    'data-action="auto-advance"',
    'data-action="reverse-advance"',
    'data-action="delete-five"',
    'data-action="clear-all"',
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /SINGLE_MODE_IDLE_MS = 5000/);
  assert.match(source, /core\.findNextContentIndex/);
  assert.match(source, /core\.findPreviousContentIndex/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bXMLHttpRequest\b/);
});
