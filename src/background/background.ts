chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'tabstash:ping') {
    sendResponse({ type: 'tabstash:pong', ok: true })
  }
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'save-session') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/index.html') })
  }
})
