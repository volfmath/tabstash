import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'

export const iconSizes = [16, 32, 48, 128]
export const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url))

export async function verifyIcon(bytes, size) {
  const decoder = sharp(bytes, { failOn: 'warning' })
  const metadata = await decoder.metadata()
  assert.equal(metadata.format, 'png', 'Icon must be a PNG')
  assert.equal(metadata.hasAlpha, true, 'Icon must preserve transparency')

  // Reading metadata alone accepts some broken PNGs; decode every pixel.
  const { data, info } = await decoder.raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.width, size, 'Unexpected icon width')
  assert.equal(info.height, size, 'Unexpected icon height')
  assert.equal(info.channels, 4, 'Icon must decode to RGBA')
  assert.equal(data.length, size * size * 4, 'Incomplete decoded image')

  let opaquePixels = 0
  let transparentPixels = 0
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const alpha = data[(y * size + x) * 4 + 3]
      if (alpha === 255) opaquePixels += 1
      if (alpha === 0) transparentPixels += 1
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
        assert.equal(alpha, 0, 'Outer margin must stay transparent')
      }
    }
  }
  assert.ok(opaquePixels > size * size / 4, 'Icon is blank or too faint')
  assert.ok(transparentPixels > 0, 'Icon has no transparent background')
  return { size, bytes: bytes.length, opaquePixels, transparentPixels }
}

export async function verifyIcons(directory = publicDirectory) {
  for (const size of iconSizes) {
    const path = resolve(directory, `icon${size}.png`)
    const result = await verifyIcon(await readFile(path), size)
    console.log(`icon${size}.png: ${size}x${size} RGBA, full decode OK, ${result.bytes} bytes, ${result.transparentPixels} transparent pixels`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await verifyIcons(process.argv[2] ? resolve(process.argv[2]) : publicDirectory)
}
