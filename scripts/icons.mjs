// Regenerates public/icon-192.png and icon-512.png from public/icon.svg.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(`${root}/public/icon.svg`, 'utf8')
const executablePath = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync)
const browser = await chromium.launch(executablePath ? { executablePath } : {})
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<body style="margin:0"><div style="width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div></body>`,
  )
  const buf = await page.screenshot({ omitBackground: true })
  writeFileSync(`${root}/public/icon-${size}.png`, buf)
  await page.close()
}
await browser.close()
console.log('icons written')
