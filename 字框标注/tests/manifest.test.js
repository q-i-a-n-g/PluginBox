"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const extensionRoot = path.resolve(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"),
);

test("manifest is a minimal MV3 content-script extension", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage", "activeTab", "scripting"]);
  assert.deepEqual(manifest.background, { service_worker: "background.js" });
  assert.deepEqual(manifest.action, {
    default_title: "显示或隐藏字框标注助手",
  });
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
});

test("manifest is restricted to the intended sample route", () => {
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].matches, [
    "https://metis-aione-test.zhenguanyu.com/metis-aione-eval/samples/*",
  ]);
  assert.deepEqual(manifest.content_scripts[0].js, ["core.js", "content.js"]);
  assert.deepEqual(manifest.content_scripts[0].css, ["content.css"]);
  assert.equal(manifest.content_scripts[0].run_at, "document_idle");
});

test("every declared extension asset exists", () => {
  const assets = [
    manifest.background.service_worker,
    ...manifest.content_scripts[0].js,
    ...manifest.content_scripts[0].css,
  ];
  for (const asset of assets) {
    assert.equal(
      fs.existsSync(path.join(extensionRoot, asset)),
      true,
      `${asset} is missing`,
    );
  }
});

test("content script does not call server or browser network APIs", () => {
  for (const filename of ["content.js", "background.js"]) {
    const source = fs.readFileSync(path.join(extensionRoot, filename), "utf8");
    assert.doesNotMatch(source, /\bfetch\s*\(/, filename);
    assert.doesNotMatch(source, /\bXMLHttpRequest\b/, filename);
    assert.doesNotMatch(source, /\/api\/samples\//, filename);
  }
});

test("content script falls back to box aria-label for character indices", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "content.js"), "utf8");
  assert.match(source, /if \(titleIndex !== null\) return titleIndex;/);
  assert.match(
    source,
    /core\.parseCharacterIndex\(element\?\.getAttribute\("aria-label"\)/,
  );
});

test("clear-all runs without confirmation and reports through a toast", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "content.js"), "utf8");
  assert.doesNotMatch(source, /window\.confirm\s*\(/);
  assert.match(source, /ocr-box-helper-clear-toast/);
  assert.match(source, /showClearToast\(`正在清空：/);
});

test("punctuation clear deletes every framed Chinese or English punctuation", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "content.js"), "utf8");
  const styles = fs.readFileSync(path.join(extensionRoot, "content.css"), "utf8");
  const deleteFivePosition = source.indexOf('data-action="delete-five"');
  const punctuationPosition = source.indexOf('data-action="clear-punctuation"');
  const clearAllPosition = source.indexOf('data-action="clear-all"');
  assert.ok(
    deleteFivePosition >= 0 &&
      deleteFivePosition < punctuationPosition &&
      punctuationPosition < clearAllPosition,
  );
  assert.match(source, /function getFramedPunctuationIndices/);
  assert.match(source, /core\.isCommonPunctuation\(button\.textContent\.trim\(\)\)/);
  assert.match(source, /await deleteBoxAtIndex\(targetIndex, list, token\)/);
  assert.match(source, /正在清空标点：/);
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test("extension action can inject and toggle the helper", () => {
  const background = fs.readFileSync(
    path.join(extensionRoot, "background.js"),
    "utf8",
  );
  assert.match(background, /chrome\.action\.onClicked\.addListener/);
  assert.match(background, /chrome\.scripting\.executeScript/);
  assert.match(background, /sendVisibilityMessage\(tab\.id, "set", !current\.visible\)/);
});

test("native pause is the default and compact mode toggle is used", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "content.js"), "utf8");
  assert.match(source, /drawMode: "native"/);
  assert.match(source, /SETTINGS_SCHEMA_VERSION = 2/);
  assert.match(source, /data-action="toggle-mode"/);
  assert.doesNotMatch(source, /data-mode="single-fixed"/);
  assert.doesNotMatch(source, /data-mode="native"/);
  assert.doesNotMatch(source, /data-mode="two-point"/);
  assert.doesNotMatch(source, /state\.twoPoint/);
  assert.match(
    source,
    /previousMode === "native" && mode === "single-fixed"/,
  );
});

test("batch delete removes five boxes starting at the current character", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "content.js"), "utf8");
  assert.match(source, /data-action="delete-five"/);
  assert.match(source, /core\.takeNextCharacterIndices\(/);
  assert.match(source, /lastDeletedIndex \+ 1/);
  assert.doesNotMatch(
    source,
    /ui\.deleteFiveButton\.disabled\s*=\s*[^;]*drawMode/,
  );
});

test("reverse annotation is opt-in and selects the previous character", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "content.js"), "utf8");
  assert.match(source, /reverseAdvance: false/);
  assert.match(source, /data-action="reverse-advance"/);
  assert.match(source, /core\.findPreviousContentIndex\(/);
  assert.match(source, /direction === "backward"/);
});

test("single draw mode pauses after five idle seconds without polling", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "content.js"), "utf8");
  assert.match(source, />单击画框<\/button>/);
  assert.match(source, /SINGLE_MODE_IDLE_MS = 5000/);
  assert.match(source, /singleModeIdleTimer = window\.setTimeout/);
  assert.match(source, /state\.settings\.drawMode = "native"/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
});
