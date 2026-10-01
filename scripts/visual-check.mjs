import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseURL = process.env.TABSTASH_PREVIEW_URL ?? 'http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, channel: 'chromium' })
await mkdir('artifacts', { recursive: true })
const failures = []

async function capture(locale, name, route, viewport, count, preview = false) {
  const context = await browser.newContext({ viewport, locale })
  await context.addInitScript(({ locale, count }) => {
    const sessions = Array.from({ length: count }, (_, index) => ({
      id: `123e4567-e89b-42d3-a456-42661417400${index}`,
      name: `Research ${index + 1} ${'long-session-name'.repeat(8)}`,
      createdAt: '2026-09-30T00:00:00.000Z',
      windows: [{ tabs: [{ url: 'https://example.test/one', title: 'Research page' }] }],
    }))
    globalThis.chrome = {
      runtime: {
        getManifest: () => ({ version: '0.2.1' }),
        openOptionsPage: () => {},
        getURL: (path) => new URL(`/${path}`, location.origin).href,
        sendMessage: async ({ type }) => {
          if (type === 'list-sessions') return { ok: true, sessions }
          if (type === 'list-restore-tasks') return { ok: true, tasks: [] }
          if (type === 'preview-session') return {
            ok: true, previewToken: 'visual', preview: {
              windows: sessions[0].windows, includedTabCount: 1,
              excludedTabs: [{ url: 'chrome://settings/' + 'long-url'.repeat(20), title: 'Browser settings', reason: 'unsupported-url' }],
            },
          }
          return { ok: false, code: 'unknown-error', message: 'visual mock' }
        },
      },
      storage: {
        local: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener: () => {}, removeListener: () => {} },
      },
      i18n: { getUILanguage: () => locale },
    }
  }, { locale, count })
  try {
    const page = await context.newPage()
    page.on('pageerror', error => failures.push(`${name}: ${error.message}`))
    await page.goto(`${baseURL}/${route}`, { waitUntil: 'networkidle' })
    if (preview) {
      await page.locator('.save-form input').fill('Preview ' + 'LongName'.repeat(12))
      await page.locator('.save-form button').click()
      await page.locator('.excluded-details summary').click()
    }
    const result = await page.evaluate(() => ({
      width: innerWidth,
      popupWidth: document.querySelector('.popup-shell')?.getBoundingClientRect().width,
      saveFormColumns: getComputedStyle(document.querySelector('.popup-shell .save-form') ?? document.body).gridTemplateColumns,
      sessionActionsWrapped: [...document.querySelectorAll('.popup-shell .session-actions')].some(element => element.scrollHeight > element.clientHeight + 2),
      overflowX: document.documentElement.scrollWidth > innerWidth,
      popupHeight: document.querySelector('.popup-shell')?.getBoundingClientRect().height,
      missingImages: [...document.images].filter(img => !img.complete || !img.naturalWidth).length,
    }))
    await page.screenshot({ path: `artifacts/${name}-${locale}.png`, fullPage: true })
    console.log(`${name}-${locale}: ${JSON.stringify(result)}`)
    if (result.overflowX || result.missingImages || result.popupHeight > 600 || (name.startsWith('popup-') && !name.includes('preview') && (result.popupWidth < 450 || result.sessionActionsWrapped || !result.saveFormColumns.includes('px')))) failures.push(`${name}-${locale}: layout or image check failed`)
    assert.equal(result.width, viewport.width)
  } finally {
    await context.close()
  }
}

try {
  for (const locale of ['en', 'zh-CN']) {
    for (const count of [0, 5]) await capture(locale, `popup-${count}`, 'src/popup/index.html', { width: 480, height: 600 }, count)
    await capture(locale, 'popup-preview', 'src/popup/index.html', { width: 480, height: 600 }, 1, true)
    for (const view of ['sessions', 'backup', 'settings']) {
      for (const width of [1280, 390, 320]) {
        await capture(locale, `manager-${view}-${width}`, `src/options/index.html#${view}`, { width, height: 800 }, 5)
      }
    }
  }
  assert.deepEqual(failures, [])
} finally {
  await browser.close()
}
