// End-to-end smoke test: serves the production build and drives it in
// headless Chromium at an iPhone-sized viewport. Exits non-zero on failure.
import { chromium } from 'playwright'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4317
const BASE = `http://localhost:${PORT}/drumboss/`
const shots = process.env.SHOT_DIR || root

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
})
const fail = async (msg) => {
  console.error(`FAIL: ${msg}`)
  server.kill()
  process.exit(1)
}
process.on('exit', () => server.kill())

// wait for the server
for (let i = 0; ; i++) {
  try {
    const r = await fetch(BASE)
    if (r.ok) break
  } catch { /* not up yet */ }
  if (i > 50) await fail('preview server never came up')
  await new Promise((r) => setTimeout(r, 200))
}

const executablePath = ['/opt/pw-browsers/chromium'].find(existsSync)
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
page.on('pageerror', (e) => fail(`page error: ${e.message}`))

await page.goto(BASE)
await page.waitForSelector('.grid')

// 1. grid structure + starter groove present
const cells = await page.locator('.cell').count()
if (cells !== 128) await fail(`expected 128 cells, got ${cells}`)
const onCells = await page.locator('.cell.on').count()
if (onCells < 10) await fail(`starter groove missing: only ${onCells} active steps`)
console.log(`✓ grid renders (${cells} cells, ${onCells} active)`)

// 2. toggling a step
const cell = page.locator('[data-cell="5-1"]')
const wasOn = await cell.evaluate((el) => el.classList.contains('on'))
await cell.tap()
if ((await cell.evaluate((el) => el.classList.contains('on'))) === wasOn) await fail('step did not toggle')
await cell.tap()
if ((await cell.evaluate((el) => el.classList.contains('on'))) !== wasOn) await fail('step did not toggle back')
console.log('✓ step toggling works')

// 3. play → scheduler ticks advance, playhead visible
await page.locator('.play').tap()
await page.waitForTimeout(1500)
const ticks = await page.evaluate(() => window.__db.engine.ticks)
if (!(ticks > 8)) await fail(`scheduler not ticking (ticks=${ticks})`)
if ((await page.locator('.cell.now').count()) === 0) await fail('no playhead column')
await page.screenshot({ path: `${shots}/shot-grid.png` })
console.log(`✓ playback runs (${ticks} steps scheduled), playhead sweeps`)

// 4. dice produces a new pattern
const before = await page.evaluate(() => JSON.stringify(window.__db.useStore.getState().project.patterns[0]))
await page.locator('.dice').tap()
const after = await page.evaluate(() => JSON.stringify(window.__db.useStore.getState().project.patterns[0]))
if (before === after) await fail('dice did not change the pattern')
const kickOn = await page.evaluate(() => window.__db.useStore.getState().project.patterns[0].tracks[0].steps[0].on)
if (!kickOn) await fail('diced groove lost its downbeat kick')
console.log('✓ dice rolls a new groove (kick still lands on 1)')

// 5. kit hot-swap while playing
const ticksBefore = await page.evaluate(() => window.__db.engine.ticks)
await page.locator('.kit-chip').tap()
await page.waitForSelector('.kit-card')
await page.screenshot({ path: `${shots}/shot-kits.png` })
await page.locator('.kit-card', { hasText: 'Neon Warehouse' }).tap()
await page.locator('.sheet-title .chip').tap()
await page.waitForTimeout(900)
const ticksAfter = await page.evaluate(() => window.__db.engine.ticks)
if (!(ticksAfter > ticksBefore)) await fail('transport stopped during kit hot-swap')
const kitId = await page.evaluate(() => window.__db.useStore.getState().project.kitId)
if (kitId !== 'house') await fail(`kit did not switch (got ${kitId})`)
console.log('✓ kit hot-swaps mid-playback without stopping')

// 6. share URL round-trip + remix fork
const shareUrl = await page.evaluate(() => window.__db.useStore.getState().shareURL())
const name = await page.evaluate(() => window.__db.useStore.getState().project.name)
const page2 = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
await page2.goto(shareUrl)
await page2.waitForSelector('.share-banner')
const sharedName = await page2.evaluate(() => window.__db.useStore.getState().project.name)
if (sharedName !== name) await fail(`shared beat name mismatch: ${sharedName} != ${name}`)
// velocities quantize to 1% in the link, so compare re-encoded payloads
const reShared = await page2.evaluate(() => new URL(window.__db.useStore.getState().shareURL()).hash)
if (reShared !== new URL(shareUrl).hash) await fail('shared beat did not round-trip')
await page2.locator('.share-banner .chip').tap()
if ((await page2.locator('.share-banner').count()) !== 0) await fail('remix did not clear the share banner')
await page2.close()
console.log('✓ share URL round-trips byte-identical; remix forks it')

// 7. perform pads
await page.locator('.transport .chip', { hasText: 'Pads' }).tap()
await page.waitForSelector('.pad')
const pads = await page.locator('.pad').count()
if (pads !== 16) await fail(`expected 16 pads, got ${pads}`)
await page.locator('.pad').first().tap()
await page.screenshot({ path: `${shots}/shot-pads.png` })
console.log('✓ perform pads render and trigger')

// 8. stop cleanly
await page.locator('.play').tap()
const playing = await page.evaluate(() => window.__db.engine.playing)
if (playing) await fail('engine still playing after stop')
console.log('✓ stop works')

await browser.close()
server.kill()
console.log('\nALL SMOKE CHECKS PASSED')
process.exit(0)
