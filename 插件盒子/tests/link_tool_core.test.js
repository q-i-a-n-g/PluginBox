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

test("parses the 18 comma-separated image links from a.txt in order", () => {
  const expected = [
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/3w8LaMULAe2cFaefVe9HmF.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/bA8VfUWgGvAVWkerAUWQK9.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/2iHKLz3Mk4URdMFya2TkJH.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/fdvFSBuuYq7UhnXR3EXuk3.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/qfbHy8cKLhnh3k5CH8HXHd.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/ZYoX8LwQpr6XHHQpHCf2ge.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/W6LeytDfTqqfDx4TrUeAJ6.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/JqnWPt9Kkame4yoZgeejnZ.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/TsqW95Pg23D9zDQheBXNLb.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/7hMaxZbTB6p7ePRFqtSjGU.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/dzvXx5kWKo6gTULPFBoQRd.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/4WiNK7uUKYTr2dpY6E7qBn.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/tSef9SmPgWxQdWs3wunD2B.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/w9L7zt3QPqBBZ5LyiTCjbf.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/rTbmqszG7AeFszw6VoqvyR.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/wWthTLmURtTmgVGUPjM5uR.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/FLoQ7bvjptnQwoDHg7SY7Y.jpg",
    "https://metis-test.fbcontent.cn/metis-gnosis-evaluation/userImage/s6wHBxZFmjeEzJ9BkeJRZh.jpg",
  ];

  const actual = parseDirectImageLinks(expected.join(","));

  assert.equal(actual.length, 18);
  assert.deepEqual(actual, expected);
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

test("preview and download are independent and Excel export is removed", () => {
  const html = fs.readFileSync(
    path.join(extensionRoot, "link_tool.html"),
    "utf8",
  );
  const controller = fs.readFileSync(
    path.join(extensionRoot, "link_tool.js"),
    "utf8",
  );
  const standalone = fs.readFileSync(
    path.resolve(extensionRoot, "..", "link_extrac", "link_extractor.html"),
    "utf8",
  );

  assert.match(html, /id="downloadBtn" type="button">下载<\/button>/);
  assert.match(controller, /const downloadLinks = parseDirectImageLinks\(input\.value\)/);
  assert.match(controller, /items: downloadLinks\.map/);
  assert.doesNotMatch(html, /导出 Excel|exportBtn|class="export"/i);
  assert.doesNotMatch(controller, /exportExcel|exportBtn|application\/vnd\.ms-excel/i);

  assert.match(standalone, /id="downloadBtn" type="button">下载<\/button>/);
  assert.match(standalone, /const downloadLinks = parseImageLinks\(inputText\.value\)/);
  assert.match(standalone, /downloadWithBlobQueue\(downloadLinks\)/);
  assert.doesNotMatch(standalone, /导出 Excel|exportExcel|exportBtn|XLSX|xlsx\.full/i);

  const inlineScripts = Array.from(
    standalone.matchAll(/<script>([\s\S]*?)<\/script>/g),
    (match) => match[1],
  );
  assert.equal(inlineScripts.length, 1);
  assert.doesNotThrow(() => new Function(inlineScripts[0]));
});
