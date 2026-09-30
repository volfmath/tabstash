import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { iconSizes, publicDirectory, verifyIcon, verifyIcons } from './verify-icons.mjs'

const source = await readFile(resolve(publicDirectory, 'brand.svg'))
const generated = []

for (const size of iconSizes) {
  const bytes = await sharp(source, { density: 72, failOn: 'warning' })
    .resize(size, size)
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer()
  await verifyIcon(bytes, size)
  generated.push({ size, bytes })
}

// Validate all outputs before replacing any checked-in asset.
for (const { size, bytes } of generated) {
  await writeFile(resolve(publicDirectory, `icon${size}.png`), bytes)
}

await verifyIcons()
