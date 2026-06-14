chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      files: ["content.js"]
    },
    () => {
      const injectError = chrome.runtime.lastError;
      if (injectError) return;

      chrome.tabs.sendMessage(tab.id, { type: "XYJ_EVAL_TOGGLE" }, () => {
        void chrome.runtime.lastError;
      });
    }
  );
});
