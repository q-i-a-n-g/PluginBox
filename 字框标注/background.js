"use strict";

const SAMPLE_ORIGIN = "https://metis-aione-test.zhenguanyu.com";
const SAMPLE_PATH_PREFIX = "/metis-aione-eval/samples/";
const VISIBILITY_MESSAGE = "ocr-box-helper-visibility";

function isSupportedSamplePage(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === SAMPLE_ORIGIN &&
      parsed.pathname.startsWith(SAMPLE_PATH_PREFIX)
    );
  } catch {
    return false;
  }
}

function sendVisibilityMessage(tabId, action, visible) {
  return chrome.tabs.sendMessage(tabId, {
    type: VISIBILITY_MESSAGE,
    action,
    ...(typeof visible === "boolean" ? { visible } : {}),
  });
}

async function injectHelper(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content.css"],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["core.js"],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !isSupportedSamplePage(tab.url)) return;

  try {
    const current = await sendVisibilityMessage(tab.id, "get");
    if (current?.ready) {
      await sendVisibilityMessage(tab.id, "set", !current.visible);
      return;
    }
    await sendVisibilityMessage(tab.id, "set", true);
    return;
  } catch {
    // The page was already open before this extension version was loaded.
  }

  try {
    await injectHelper(tab.id);
    await sendVisibilityMessage(tab.id, "set", true);
  } catch (error) {
    console.warn("[字框标注助手] 无法在当前页面呼出界面", error);
  }
});
