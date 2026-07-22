"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const extensionRoot = path.resolve(__dirname, "..");
const read = (filename) =>
  fs.readFileSync(path.join(extensionRoot, filename), "utf8");
const manifest = JSON.parse(read("manifest.json"));

test("字框标注资源由插件盒子按需注入", () => {
  const entry = manifest.content_scripts.find((item) =>
    item.js?.includes("ocr_box_tool.js"),
  );
  assert.equal(entry, undefined);

  for (const asset of ["ocr_box_core.js", "ocr_box_tool.js", "ocr_box_tool.css"]) {
    assert.equal(fs.existsSync(path.join(extensionRoot, asset)), true, asset);
  }

  const background = read("background.js");
  assert.match(background, /files: \["ocr_box_tool\.css"\]/);
  assert.match(background, /files: \["ocr_box_core\.js"\]/);
  assert.match(background, /files: \["ocr_box_tool\.js"\]/);
});

test("字框标注使用单独插件的功能标识并保留盒子样式", () => {
  const source = read("ocr_box_tool.js");
  const styles = read("ocr_box_tool.css");
  assert.match(source, /window\[VISIBILITY_REQUEST_KEY\] !== false/);
  assert.match(source, /ROOT_ID = "ocr-box-helper-root"/);
  assert.match(source, /TOAST_ID = "ocr-box-helper-clear-toast"/);
  assert.match(styles, /#ocr-box-helper-root\[data-interface-visible="false"\]/);
  assert.doesNotMatch(styles, /#ptb-ocr-box-helper-root/);
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

test("盒子版保留完整字框功能并使用新版紧凑控制", () => {
  const source = read("ocr_box_tool.js");
  const styles = read("ocr_box_tool.css");

  for (const marker of [
    'data-action="toggle-mode"',
    'data-action="toggle-advanced"',
    'data-action="shrink-size"',
    'data-action="enlarge-size"',
    'data-action="auto-advance"',
    'data-action="reverse-advance"',
    'data-action="delete-five"',
    'data-action="clear-punctuation"',
    'data-action="clear-all"',
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /advancedExpanded: false/);
  assert.doesNotMatch(source, /data-mode="single-fixed"/);
  assert.doesNotMatch(source, /data-mode="native"/);
  assert.match(source, /SINGLE_MODE_IDLE_MS = 5000/);
  assert.match(source, /core\.findNextContentIndex/);
  assert.match(source, /core\.findPreviousContentIndex/);
  assert.match(source, /core\.isCommonPunctuation/);
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bXMLHttpRequest\b/);
});
