chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_EVAL_HELPER" }, () => {
      // Ignore errors (e.g. on chrome:// pages or tabs without content script)
      void chrome.runtime.lastError;
    });
  }
});
