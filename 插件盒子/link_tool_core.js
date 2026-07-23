(function attachLinkToolCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PluginToolboxLinkCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLinkToolCore() {
  "use strict";

  const IMAGE_EXT_RE =
    /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif)(?:[?#].*)?$/i;
  const URL_CANDIDATE_RE = /https?:\/\/[^\s"'<>，。；、)\]}]+/gi;

  function parseDirectImageLinks(text) {
    const seen = new Set();
    const links = [];
    const normalized = String(text || "")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&");
    const matches = normalized.match(URL_CANDIDATE_RE) || [];

    for (const candidate of matches) {
      const link = candidate.replace(/[),.;:!?，。；：！？]+$/g, "");
      if (seen.has(link) || !IMAGE_EXT_RE.test(link)) continue;
      try {
        const parsed = new URL(link);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      } catch (_error) {
        continue;
      }
      seen.add(link);
      links.push(link);
    }
    return links;
  }

  return { parseDirectImageLinks };
});
