import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const extensionPath = path.join(root, 'dist')
const chromePath = process.env.CHROME_PATH ?? chromium.executablePath()

if (!existsSync(extensionPath)) throw new Error('dist does not exist; run npm run build first')
if (!existsSync(chromePath)) throw new Error('Run npx playwright install chromium --no-shell or set CHROME_PATH to Chrome for Testing')

const profilePath = await mkdtemp(path.join(os.tmpdir(), 'tabstash-extension-check-'))
let context
const errors = []
try {
context = await chromium.launchPersistentContext(profilePath, {
  executablePath: chromePath,
  headless: true,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    '--disable-extensions-except=' + extensionPath,
    '--load-extension=' + extensionPath,
    '--no-first-run',
    '--no-default-browser-check',
  ],
})
  context.setDefaultTimeout(15000)
  context.setDefaultNavigationTimeout(15000)
  await mkdir('artifacts', { recursive: true })
  // All test tabs are synthetic. No public website or personal browser profile is used.
  await context.route('https://example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Fixture tab</title>Fixture tab' }))
  let serviceWorker = context.serviceWorkers()[0]
  if (!serviceWorker) serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 })
  const extensionId = new URL(serviceWorker.url()).hostname
  const pages = []

  for (const [name, route, width] of [
    ['popup', 'src/popup/index.html', 480],
    ['options', 'src/options/index.html#sessions', 1280],
  ]) {
    const page = await context.newPage()
    await page.setViewportSize({ width, height: name === 'popup' ? 600 : 800 })
    page.on('pageerror', (error) => errors.push(`${name} pageerror: ${error.message}`))
    await page.goto(`chrome-extension://${extensionId}/${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.save-form button:not(:disabled)')
    pages.push({
      name,
      url: page.url(),
      version: await page.evaluate(() => chrome.runtime.getManifest().version),
      bodyText: (await page.locator('body').innerText()).slice(0, 120),
      overflowX: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    })
    await page.close()
  }

  const popup = await context.newPage()
  console.log('Check: persistent cross-page language')
  await popup.setViewportSize({ width: 480, height: 600 })
  const manager = await context.newPage()
  for (const page of [popup, manager]) page.on('pageerror', error => errors.push(error.message))
  const extensionURL = `chrome-extension://${extensionId}`
  await popup.goto(`${extensionURL}/src/popup/index.html`)
  await manager.goto(`${extensionURL}/src/options/index.html#settings`)
  await manager.locator('select').selectOption('en')
  await popup.getByRole('button', { name: 'Preview & save', exact: true }).waitFor()
  await popup.reload()
  await popup.getByRole('button', { name: 'Preview & save', exact: true }).waitFor()
  const message = async (request) => manager.evaluate(request => chrome.runtime.sendMessage(request), request)
  const success = async (request) => {
    const response = await message(request)
    assert.equal(response.ok, true, JSON.stringify(response))
    return response
  }
  const originalPage = await context.newPage()
  await originalPage.goto('https://example.test/one')
  console.log('Check: current/all-window capture')
  const secondWindow = await manager.evaluate(() => chrome.windows.create({ url: 'https://example.test/two', focused: false }))

  async function saveSession(name, scope, expectedName = name) {
    await popup.locator('.save-form input').fill(name)
    await popup.locator('.save-form select').selectOption(scope)
    await popup.getByRole('button', { name: 'Preview & save', exact: true }).click()
    await popup.locator('.preview-panel').waitFor()
    assert.ok(await popup.locator('.excluded-details').count(), 'extension pages must be excluded')
    await popup.getByRole('button', { name: 'Confirm save', exact: true }).click()
    await popup.getByRole('heading', { name: expectedName, exact: true }).waitFor()
  }
  await popup.bringToFront()
  await saveSession('', 'current-window', 'Session 1')
  const automaticSession = (await success({ type: 'list-sessions' })).sessions.find(item => item.name === 'Session 1')
  assert.ok(automaticSession, 'blank names should use the first available English session number')
  await success({ type: 'delete-session', id: automaticSession.id })
  await popup.waitForFunction(() => !Array.from(document.querySelectorAll('.session-item h3')).some(element => element.textContent === 'Session 1'))
  console.log('Blank-name automatic numbering passed')
  await saveSession('Current fixture', 'current-window')
  console.log('Current-window save passed')
  await saveSession('All windows fixture', 'all-windows')
  console.log('All-window save passed')
  const saved = (await success({ type: 'list-sessions' })).sessions
  assert.equal(saved.length, 2)
  assert.equal(saved.find(item => item.name === 'Current fixture').windows.length, 1)
  const allSession = saved.find(item => item.name === 'All windows fixture')
  assert.equal(allSession.windows.length, 2)
  assert.equal(allSession.windows.flatMap(window => window.tabs).length, 2)

  await manager.locator('nav a[href="#sessions"]').click()
  console.log('Check: rename and details')
  const row = manager.locator('.session-item').filter({ hasText: 'All windows fixture' })
  await row.getByRole('button', { name: 'Rename session', exact: true }).click()
  await manager.locator('.rename-form input').fill('Renamed fixture')
  await manager.locator('.rename-form').getByRole('button', { name: 'Save', exact: true }).click()
  await popup.getByRole('heading', { name: 'Renamed fixture', exact: true }).waitFor()
  await manager.locator('.session-item').filter({ hasText: 'Renamed fixture' }).locator('summary').click()
  await manager.waitForFunction(() => document.querySelectorAll('.saved-tabs a').length === 2)
  assert.equal(await manager.locator('.saved-tabs a').count(), 2)

  console.log('Check: manager search by session name and URL')
  await manager.locator('.search-field input').fill('Renamed')
  await manager.waitForFunction(() => document.querySelectorAll('.session-item').length === 1)
  assert.equal(await manager.locator('.session-item h3').innerText(), 'Renamed fixture')
  await manager.locator('.search-field input').fill('example.test')
  await manager.waitForFunction(() => document.querySelectorAll('.session-item').length === 2)
  await manager.locator('.search-field input').fill('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')
  await manager.waitForFunction(() => document.querySelectorAll('.session-item').length === 0)
  await manager.locator('.search-field input').fill('')

  const windowIds = () => manager.evaluate(async () => (await chrome.windows.getAll({ windowTypes: ['normal'] })).map(window => window.id))
  const originalIds = await windowIds()
  console.log('Check: preserve and merge restore')
  for (const [mode, expectedCount] of [['preserve-windows', 2], ['merge-window', 1]]) {
    await popup.locator('.session-item').filter({ hasText: 'Renamed fixture' }).getByRole('button', { name: 'Restore', exact: true }).click()
    await popup.locator('.restore-mode-field select').selectOption(mode)
    await popup.getByRole('button', { name: 'Start restore', exact: true }).click()
    await popup.getByRole('heading', { name: 'Restore complete', exact: true }).waitFor()
    const ids = await windowIds()
    assert.equal(ids.length, originalIds.length + expectedCount)
    assert.ok(originalIds.every(id => ids.includes(id)))
    assert.equal(originalPage.url(), 'https://example.test/one')
    await manager.evaluate(async ids => {
      for (const id of ids) await chrome.windows.remove(id)
    }, ids.filter(id => !originalIds.includes(id)))
    await popup.getByRole('button', { name: 'Dismiss message' }).click()
  }

  await manager.locator('nav a[href="#backup"]').click()
  console.log('Check: backup download and import')
  const downloading = manager.waitForEvent('download')
  await manager.getByRole('button', { name: 'Export backup', exact: true }).click()
  const download = await downloading
  const backupBytes = await readFile(await download.path())
  const backup = JSON.parse(backupBytes.toString())
  assert.equal(backup.sessions.length, 2)
  await manager.locator('nav a[href="#sessions"]').click()
  for (const session of backup.sessions) {
    const item = manager.locator('.session-item').filter({ has: manager.getByRole('heading', { name: session.name, exact: true }) })
    manager.once('dialog', dialog => dialog.accept())
    await item.getByRole('button', { name: 'Delete session', exact: true }).click()
    await item.waitFor({ state: 'detached' })
  }
  assert.equal((await success({ type: 'list-sessions' })).sessions.length, 0)
  await manager.locator('nav a[href="#backup"]').click()
  await manager.locator('input[type="file"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backupBytes })
  await manager.getByRole('button', { name: 'Confirm import', exact: true }).click()
  await manager.getByRole('status').filter({ hasText: 'Import complete' }).waitFor()
  assert.deepEqual((await success({ type: 'export-backup' })).document.sessions, backup.sessions)

  for (let index = 0; index < 3; index++) {
    const document = { ...backup, sessions: [{ ...backup.sessions[0], id: crypto.randomUUID(), name: `Capacity ${index}` }] }
    const preview = await success({ type: 'preview-import', document })
    await success({ type: 'import-backup', document, previewToken: preview.previewToken })
  }
  console.log('Check: capacity and language persistence')
  await popup.waitForFunction(() => document.querySelectorAll('.session-item').length === 5)
  assert.equal(await popup.locator('.save-form button').isDisabled(), true)
  const preview = await success({ type: 'preview-session', scope: 'all-windows' })
  const overflow = await message({ type: 'save-session', scope: 'all-windows', name: 'Sixth', confirm: true, previewToken: preview.previewToken })
  assert.equal(overflow.code, 'limit-reached')
  assert.equal((await success({ type: 'list-sessions' })).sessions.length, 5)
  assert.ok(await popup.locator('.popup-shell').evaluate(element => element.getBoundingClientRect().height <= 600))
  await popup.screenshot({ path: 'artifacts/extension-popup-en.png' })

  await manager.locator('nav a[href="#settings"]').click()
  await manager.locator('select').selectOption('zh-CN')
  await popup.getByRole('button', { name: '预览并保存', exact: true }).waitFor()
  await manager.reload()
  assert.equal(await manager.locator('select').inputValue(), 'zh-CN')
  await popup.screenshot({ path: 'artifacts/extension-popup-zh-CN.png' })
  assert.equal(await manager.locator('a[href="https://gitee.com/moreandmoregames/tabstash/issues/"]').count(), 2)
  await manager.evaluate(id => chrome.windows.remove(id), secondWindow.id)

  const result = {
    extensionId,
    serviceWorker: serviceWorker.url(),
    pages,
    checks: ['persistent cross-page language', 'blank-name automatic numbering', 'current/all-window save with exclusions', 'rename and cross-page refresh', 'manager search and confirmed deletion', 'preserve/merge restore without modifying original windows', 'real backup download and reimport', 'five-session UI and backend limit', 'public feedback links'],
    errors,
  }
  console.log(JSON.stringify(result, null, 2))
  assert.deepEqual(errors, [])
  assert.ok(pages.every(page => page.version === '0.2.0' && !page.overflowX))
} finally {
  await context?.close()
  const tempRoot = path.resolve(os.tmpdir())
  assert.equal(path.dirname(path.resolve(profilePath)), tempRoot)
  assert.ok(path.basename(profilePath).startsWith('tabstash-extension-check-'))
  await rm(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
