import { createBackgroundDependencies } from './handler'
import { registerMessageListener } from './listener'
import { openSavePopupOrOptions } from './shortcut'

const dependencies = createBackgroundDependencies()
registerMessageListener(chrome.runtime, dependencies)

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'open-save-popup') return
  await openSavePopupOrOptions({
    openPopup: () => chrome.action.openPopup(),
    openOptionsPage: () => chrome.runtime.openOptionsPage(),
  })
})
