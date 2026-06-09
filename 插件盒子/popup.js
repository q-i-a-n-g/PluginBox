const statusEl = document.getElementById("status");

document.querySelector("[data-help]").addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("README.pdf") });
  window.close();
});

document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => openTool(button.dataset.tool));
});

async function openTool(tool) {
  if (tool === "links") {
    await chrome.tabs.create({ url: chrome.runtime.getURL("link_tool.html") });
    window.close();
    return;
  }

  if (tool === "weekly") {
    await chrome.tabs.create({ url: chrome.runtime.getURL("weekly_report.html") });
    window.close();
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showError("未找到当前标签页。");
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "TOOLBOX_TOGGLE_TOOL",
      tool
    });
    if (!response?.ok) {
      showError(response?.error || "无法呼出工具。");
      return;
    }
    window.close();
  } catch (_error) {
    showError("当前页面不支持此工具，可先打开目标网页。");
  }
}

function showError(message) {
  statusEl.textContent = message;
  statusEl.className = "status show";
}
