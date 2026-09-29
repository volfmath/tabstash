import { createBackgroundDependencies } from './handler'
import { registerMessageListener } from './listener'

const dependencies = createBackgroundDependencies()
registerMessageListener(chrome.runtime, dependencies)
