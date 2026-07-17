(function exposeCore(root, factory) {
  const api = factory();
  root.OCRBoxHelperCore = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  function normalizeDimension(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 1 && number <= 5000
      ? Math.round(number)
      : fallback;
  }

  function normalizeScalePercent(value, fallback = 100) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return clamp(Math.round(number / 10) * 10, 40, 300);
  }

  function fixedSizeFromScale(scalePercent) {
    const normalized = normalizeScalePercent(scalePercent);
    return {
      width: Math.max(1, Math.round((50 * normalized) / 100)),
      height: Math.max(1, Math.round((60 * normalized) / 100)),
      scalePercent: normalized,
    };
  }

  function parseCharacterIndex(source) {
    const match = String(source || "").match(/^第\s*(\d+)\s*字/);
    return match ? Number(match[1]) - 1 : null;
  }

  function parseRegionTitle(title) {
    const match = String(title).match(
      /\bx:([-+]?\d+(?:\.\d+)?)\s+y:([-+]?\d+(?:\.\d+)?)\s+w:([-+]?\d+(?:\.\d+)?)\s+h:([-+]?\d+(?:\.\d+)?)/,
    );
    if (!match) return null;
    const region = {
      x: Number(match[1]),
      y: Number(match[2]),
      w: Number(match[3]),
      h: Number(match[4]),
    };
    return Object.values(region).every(Number.isFinite) ? region : null;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function fixedRegion({
    centerX,
    centerY,
    requestedWidth,
    requestedHeight,
    naturalWidth,
    naturalHeight,
  }) {
    const width = Math.min(
      naturalWidth,
      normalizeDimension(requestedWidth, 50),
    );
    const height = Math.min(
      naturalHeight,
      normalizeDimension(requestedHeight, 60),
    );
    return {
      x: clamp(Math.round(centerX - width / 2), 0, naturalWidth - width),
      y: clamp(Math.round(centerY - height / 2), 0, naturalHeight - height),
      w: width,
      h: height,
    };
  }

  function isCommonPunctuation(value) {
    const character = String(value ?? "").trim();
    return character.length > 0 && /^\p{P}+$/u.test(character);
  }

  function findNextContentIndex(characters, currentIndex) {
    if (!Array.isArray(characters) || !Number.isInteger(currentIndex)) {
      return null;
    }
    for (let index = currentIndex + 1; index < characters.length; index += 1) {
      if (!isCommonPunctuation(characters[index])) return index;
    }
    return null;
  }

  function findPreviousContentIndex(characters, currentIndex) {
    if (!Array.isArray(characters) || !Number.isInteger(currentIndex)) {
      return null;
    }
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      if (!isCommonPunctuation(characters[index])) return index;
    }
    return null;
  }

  function takeNextCharacterIndices(indices, currentIndex, limit = 5) {
    if (!Array.isArray(indices)) return [];
    const start = Number.isInteger(currentIndex) ? currentIndex : 0;
    const count = Number.isInteger(limit) && limit > 0 ? limit : 5;
    return indices
      .filter((index) => Number.isInteger(index) && index >= start)
      .sort((a, b) => a - b)
      .slice(0, count);
  }

  return Object.freeze({
    clamp,
    findNextContentIndex,
    findPreviousContentIndex,
    fixedRegion,
    fixedSizeFromScale,
    isCommonPunctuation,
    normalizeDimension,
    normalizeScalePercent,
    parseCharacterIndex,
    parseRegionTitle,
    takeNextCharacterIndices,
  });
});
