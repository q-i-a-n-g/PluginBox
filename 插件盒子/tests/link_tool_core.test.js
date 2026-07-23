"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { parseDirectImageLinks } = require("../link_tool_core.js");
const extensionRoot = path.resolve(__dirname, "..");

test("accepts plain image links and optional numeric sequence markers", () => {
  const first =
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/yK8qXhdThfuLRB9B5NxMyS.jpg";
  const second =
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/HVDEqXc3mKV84iiYp4uwfD.jpg";
  const third = "https://metis-test.fbcontent.cn/path/third.webp#preview";
  assert.deepEqual(
    parseDirectImageLinks(`003 ${first}\n${second} 004\n5. ${third} 006：`),
    [first, second, third],
  );
});

test("keeps input order and removes duplicate links", () => {
  const first = "https://example.com/1.jpg";
  const second = "https://example.com/2.jpg";
  assert.deepEqual(
    parseDirectImageLinks(`${second}\n001 ${first}\n${second} 999`),
    [second, first],
  );
});

test("extracts image links from JSON and arbitrary surrounding text", () => {
  assert.deepEqual(
    parseDirectImageLinks(
      [
        '{"url":"https://example.com/a.jpg"}',
        "图片 https://example.com/b.jpg",
        "https:\\/\\/example.com/c.jpg 备注",
        "https://example.com/not-image.txt",
      ].join("\n"),
    ),
    [
      "https://example.com/a.jpg",
      "https://example.com/b.jpg",
      "https://example.com/c.jpg",
    ],
  );
});

test("decodes HTML ampersands before validating and deduplicating", () => {
  assert.deepEqual(
    parseDirectImageLinks(
      [
        "001 https://example.com/a.jpg?x=1&amp;y=2",
        "https://example.com/a.jpg?x=1&y=2 002",
      ].join("\n"),
    ),
    ["https://example.com/a.jpg?x=1&y=2"],
  );
});

test("link preview loads the parser before its page controller", () => {
  const html = fs.readFileSync(
    path.join(extensionRoot, "link_tool.html"),
    "utf8",
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"),
  );
  assert.ok(
    html.indexOf('src="link_tool_core.js"') <
      html.indexOf('src="link_tool.js"'),
  );
  assert.match(html, /placeholder="粘贴链接到这里\.\.\."/);
  assert.ok(
    manifest.web_accessible_resources[0].resources.includes(
      "link_tool_core.js",
    ),
  );
});
