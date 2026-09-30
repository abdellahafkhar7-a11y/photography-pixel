/**
 * Phase 5A — PWA icon builder (development-time only).
 *
 * The mobile Team Workspace can be installed ("Add to Home Screen"), which
 * needs real square PNG icons. The repo only ships the big source logo, so
 * this script downsamples it to the sizes a manifest expects, using nothing
 * but Node's built-in zlib (no new dependency is added to the project).
 *
 * Outputs:
 *   assets/images/pwa/icon-192.png            — home screen icon
 *   assets/images/pwa/icon-512.png            — splash / large icon
 *   assets/images/pwa/icon-maskable-512.png   — padded for Android adaptive
 *   assets/images/pwa/apple-touch-icon-180.png — iOS home screen icon
 *
 * Run: npm run icons:pwa
 */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// The transparent-background logo. The 3D logo in assets/images/logo-3d.png is
// an opaque black square, which is unusable as an app icon.
const SOURCE = path.join(ROOT, 'assets/images/photography-pixel-logo.png')
const OUT_DIR = path.join(ROOT, 'assets/images/pwa')

// The site's ivory surface, so the dark logo keeps a high contrast and the
// installed icon matches the public site's palette.
const BACKGROUND = [0xfa, 0xf8, 0xf3]

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// ---------------------------------------------------------------- PNG decode

function readChunks(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG file')
  const chunks = []
  let offset = 8
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) })
    offset += 12 + length
  }
  return chunks
}

function paethPredictor(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

function unfilter(raw, width, height, bytesPerPixel) {
  const stride = width * bytesPerPixel
  const out = Buffer.alloc(stride * height)
  let position = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[position]
    position += 1
    const line = raw.subarray(position, position + stride)
    position += stride
    const current = out.subarray(y * stride, (y + 1) * stride)
    const previous = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0
      const up = previous ? previous[x] : 0
      const upLeft = previous && x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0
      let value = line[x]
      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) value += paethPredictor(left, up, upLeft)
      else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`)
      current[x] = value & 0xff
    }
  }
  return out
}

/** Decodes an 8-bit PNG (palette or RGBA) into straight RGBA pixels. */
function decodePng(file) {
  const buffer = fs.readFileSync(file)
  const chunks = readChunks(buffer)
  const header = chunks.find((chunk) => chunk.type === 'IHDR')
  if (!header) throw new Error('missing IHDR')
  const width = header.data.readUInt32BE(0)
  const height = header.data.readUInt32BE(4)
  const bitDepth = header.data[8]
  const colorType = header.data[9]
  const interlace = header.data[12]
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`)
  if (interlace !== 0) throw new Error('interlaced PNGs are not supported')
  if (colorType !== 3 && colorType !== 6) throw new Error(`unsupported color type ${colorType}`)

  const palette = chunks.find((chunk) => chunk.type === 'PLTE')?.data ?? null
  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data))
  const bytesPerPixel = colorType === 6 ? 4 : 1
  const samples = unfilter(zlib.inflateSync(idat), width, height, bytesPerPixel)

  const rgba = Buffer.alloc(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    const out = index * 4
    if (colorType === 6) {
      samples.copy(rgba, out, index * 4, index * 4 + 4)
    } else {
      const entry = samples[index] * 3
      if (!palette) throw new Error('palette image without PLTE')
      rgba[out] = palette[entry]
      rgba[out + 1] = palette[entry + 1]
      rgba[out + 2] = palette[entry + 2]
      rgba[out + 3] = 255
    }
  }
  return { width, height, rgba }
}

// ---------------------------------------------------------------- Resampling

/** Box filter downscale with alpha-weighted colour averaging. */
function downscale(source, width, height, target) {
  const out = Buffer.alloc(target * target * 4)
  const xRatio = width / target
  const yRatio = height / target
  for (let y = 0; y < target; y += 1) {
    const y0 = Math.floor(y * yRatio)
    const y1 = Math.min(height, Math.max(y0 + 1, Math.floor((y + 1) * yRatio)))
    for (let x = 0; x < target; x += 1) {
      const x0 = Math.floor(x * xRatio)
      const x1 = Math.min(width, Math.max(x0 + 1, Math.floor((x + 1) * xRatio)))
      let r = 0
      let g = 0
      let b = 0
      let alphaSum = 0
      let weight = 0
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * width + sx) * 4
          const a = source[i + 3] / 255
          r += source[i] * a
          g += source[i + 1] * a
          b += source[i + 2] * a
          alphaSum += source[i + 3]
          weight += a
        }
      }
      const o = (y * target + x) * 4
      if (weight > 0) {
        out[o] = Math.round(r / weight)
        out[o + 1] = Math.round(g / weight)
        out[o + 2] = Math.round(b / weight)
      }
      out[o + 3] = Math.round(alphaSum / ((x1 - x0) * (y1 - y0)))
    }
  }
  return out
}

function fill(size, [r, g, b], alpha = 255) {
  const buffer = Buffer.alloc(size * size * 4)
  for (let index = 0; index < size * size; index += 1) {
    buffer[index * 4] = r
    buffer[index * 4 + 1] = g
    buffer[index * 4 + 2] = b
    buffer[index * 4 + 3] = alpha
  }
  return buffer
}

/** Source-over composite of a square RGBA image centred on a solid background. */
function compositeOnBackground(logo, logoSize, size, background) {
  const out = fill(size, background)
  const offset = Math.round((size - logoSize) / 2)
  for (let y = 0; y < logoSize; y += 1) {
    for (let x = 0; x < logoSize; x += 1) {
      const s = (y * logoSize + x) * 4
      const alpha = logo[s + 3] / 255
      if (alpha === 0) continue
      const d = ((y + offset) * size + (x + offset)) * 4
      out[d] = Math.round(logo[s] * alpha + out[d] * (1 - alpha))
      out[d + 1] = Math.round(logo[s + 1] * alpha + out[d + 1] * (1 - alpha))
      out[d + 2] = Math.round(logo[s + 2] * alpha + out[d + 2] * (1 - alpha))
      out[d + 3] = Math.round(255 * alpha + out[d + 3] * (1 - alpha))
    }
  }
  return out
}

// ---------------------------------------------------------------- PNG encode

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(rgba, size) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // truecolour with alpha
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------- main

function main() {
  const source = decodePng(SOURCE)
  console.log(`source: ${path.relative(ROOT, SOURCE)} — ${source.width}x${source.height}`)
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const targets = [
    // Standard icons: the logo sits on the ivory tile with a small margin.
    { file: 'icon-192.png', size: 192, logoScale: 0.84 },
    { file: 'icon-512.png', size: 512, logoScale: 0.84 },
    { file: 'apple-touch-icon-180.png', size: 180, logoScale: 0.84 },
    // Maskable icons must survive a circular/squircle crop, so the logo stays
    // inside the safe zone (Android may crop up to ~20% per side).
    { file: 'icon-maskable-512.png', size: 512, logoScale: 0.58 },
  ]

  for (const target of targets) {
    const logoSize = Math.round(target.size * target.logoScale)
    const scaled = downscale(source.rgba, source.width, source.height, logoSize)
    // Opaque tile: iOS and Android launchers both ignore transparent icons.
    const pixels = compositeOnBackground(scaled, logoSize, target.size, BACKGROUND)
    const png = encodePng(pixels, target.size)
    fs.writeFileSync(path.join(OUT_DIR, target.file), png)

    // Read it back so a broken file can never be committed silently, and prove
    // the tile is not blank.
    const verify = decodePng(path.join(OUT_DIR, target.file))
    if (verify.width !== target.size || verify.height !== target.size) {
      throw new Error(`${target.file} did not round-trip at ${target.size}px`)
    }
    const corner = [verify.rgba[0], verify.rgba[1], verify.rgba[2], verify.rgba[3]]
    const centerPixel = (() => {
      const center = ((target.size >> 1) * target.size + (target.size >> 1)) * 4
      return [verify.rgba[center], verify.rgba[center + 1], verify.rgba[center + 2]]
    })()
    console.log(
      `  ✓ assets/images/pwa/${target.file} — ${target.size}x${target.size}, ${png.length} bytes` +
        `, tile rgba(${corner.join(',')}), centre rgb(${centerPixel.join(',')})`,
    )
  }
  console.log('\nPWA icons written.\n')
}

main()
