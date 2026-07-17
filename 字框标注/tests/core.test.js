"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core.js");

test("parses character indices from page accessibility labels", () => {
  assert.equal(core.parseCharacterIndex("第 1 字，已有框"), 0);
  assert.equal(core.parseCharacterIndex("第 387 字 ！ 的字框"), 386);
  assert.equal(core.parseCharacterIndex("无字符序号"), null);
});

test("parses integer and decimal region titles", () => {
  assert.deepEqual(core.parseRegionTitle("根  x:569 y:379 w:52 h:60"), {
    x: 569,
    y: 379,
    w: 52,
    h: 60,
  });
  assert.deepEqual(core.parseRegionTitle("x:-1.5 y:2 w:3.25 h:4"), {
    x: -1.5,
    y: 2,
    w: 3.25,
    h: 4,
  });
  assert.equal(core.parseRegionTitle("没有坐标"), null);
});

test("fixed boxes are centered and clamped to image boundaries", () => {
  assert.deepEqual(
    core.fixedRegion({
      centerX: 500,
      centerY: 400,
      requestedWidth: 50,
      requestedHeight: 60,
      naturalWidth: 1000,
      naturalHeight: 800,
    }),
    { x: 475, y: 370, w: 50, h: 60 },
  );
  assert.deepEqual(
    core.fixedRegion({
      centerX: 4,
      centerY: 3,
      requestedWidth: 50,
      requestedHeight: 60,
      naturalWidth: 1000,
      naturalHeight: 800,
    }),
    { x: 0, y: 0, w: 50, h: 60 },
  );
  assert.deepEqual(
    core.fixedRegion({
      centerX: 999,
      centerY: 799,
      requestedWidth: 5000,
      requestedHeight: 5000,
      naturalWidth: 1000,
      naturalHeight: 800,
    }),
    { x: 0, y: 0, w: 1000, h: 800 },
  );
});

test("dimension and proportional scale normalization reject invalid values", () => {
  assert.equal(core.normalizeDimension("55.6", 50), 56);
  assert.equal(core.normalizeDimension(0, 50), 50);
  assert.equal(core.normalizeDimension(5001, 50), 50);
  assert.deepEqual(core.fixedSizeFromScale(100), {
    width: 50,
    height: 60,
    scalePercent: 100,
  });
  assert.deepEqual(core.fixedSizeFromScale(110), {
    width: 55,
    height: 66,
    scalePercent: 110,
  });
  assert.deepEqual(core.fixedSizeFromScale(90), {
    width: 45,
    height: 54,
    scalePercent: 90,
  });
  assert.equal(core.normalizeScalePercent(5), 40);
  assert.equal(core.normalizeScalePercent(999), 300);
  assert.equal(core.normalizeScalePercent("bad", 120), 120);
});

test("recognizes common Chinese and English punctuation", () => {
  for (const value of ["，", "。", "！", "？", "；", "：", "、", "“", "”", "（", "）", ",", ".", "!", "?", ";", ":", "\"", "'", "…", "——"]) {
    assert.equal(core.isCommonPunctuation(value), true, value);
  }
  for (const value of ["中", "A", "1", "中。", ""]) {
    assert.equal(core.isCommonPunctuation(value), false, value);
  }
});

test("finds the next non-punctuation character", () => {
  const characters = ["钢", "琴", "，", "。", "被", "！"];
  assert.equal(core.findNextContentIndex(characters, -1), 0);
  assert.equal(core.findNextContentIndex(characters, 0), 1);
  assert.equal(core.findNextContentIndex(characters, 1), 4);
  assert.equal(core.findNextContentIndex(characters, 4), null);
  assert.equal(core.findNextContentIndex(["，", "钢"], -1), 1);
  assert.equal(core.findNextContentIndex(null, 0), null);
});

test("finds the previous non-punctuation character", () => {
  const characters = ["钢", "，", "。", "琴", "被"];
  assert.equal(core.findPreviousContentIndex(characters, characters.length), 4);
  assert.equal(core.findPreviousContentIndex(characters, 4), 3);
  assert.equal(core.findPreviousContentIndex(characters, 3), 0);
  assert.equal(core.findPreviousContentIndex(characters, 0), null);
  assert.equal(core.findPreviousContentIndex(null, 0), null);
});

test("takes five framed character indices from the current character", () => {
  assert.deepEqual(
    core.takeNextCharacterIndices([0, 2, 3, 6, 7, 8, 10], 2, 5),
    [2, 3, 6, 7, 8],
  );
  assert.deepEqual(core.takeNextCharacterIndices([1, 4], 4, 5), [4]);
  assert.deepEqual(core.takeNextCharacterIndices([1, 4], 9, 5), []);
});
