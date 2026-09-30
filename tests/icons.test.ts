import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

describe('packaged brand icons', () => {
  it.each([16, 32, 48, 128])('fully decodes the %ipx PNG with transparent margins', async (size) => {
    const file = await readFile(new URL(`../public/icon${size}.png`, import.meta.url))
    const decoder = sharp(file, { failOn: 'warning' })
    const metadata = await decoder.metadata()
    const { data, info } = await decoder.raw().toBuffer({ resolveWithObject: true })

    expect(metadata.format).toBe('png')
    expect(metadata.hasAlpha).toBe(true)
    expect(info).toMatchObject({ width: size, height: size, channels: 4 })
    expect(data.length).toBe(size * size * 4)

    let opaquePixels = 0
    let whitePixels = 0
    let tealPixels = 0
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 4
        const [red, green, blue, alpha] = data.subarray(offset, offset + 4)
        if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
          expect(alpha).toBe(0)
        }
        if (alpha === 255) {
          opaquePixels += 1
          if (red > 245 && green > 245 && blue > 245) whitePixels += 1
          if (green > red + 40 && blue > red + 20) tealPixels += 1
        }
      }
    }

    expect(opaquePixels).toBeGreaterThan(size * size * 0.25)
    expect(whitePixels).toBeGreaterThan(size * size * 0.04)
    expect(tealPixels).toBeGreaterThan(size * size * 0.15)
  })
})
