// The decoder, against PNGs whose answer is known by construction.
//
// Without this the screen check is the kind of assertion this repository
// keeps catching itself writing: one that cannot fail. A decoder that
// mis-unfilters produces noise, noise has many distinct colours, and "many
// colours" is exactly the verdict that passes. So the flat image matters
// more than the busy one -- it is the case a broken decoder gets wrong.

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { deflateSync } from 'node:zlib'

import { distinctColours } from './screen-colours.mjs'

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/**
 * A PNG of `width` x `height` RGB pixels, one row filter for the lot.
 *
 * `filter` is the point of the parameter: encoders pick per row, and a
 * decoder that only handles `None` reads every other filter as garbage --
 * which looks like a richly coloured screen.
 */
function png(width, height, colourAt, filter = 0) {
  const stride = width * 3
  const rows = []
  const previous = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const raw = Buffer.alloc(stride)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colourAt(x, y)
      raw[x * 3] = r
      raw[x * 3 + 1] = g
      raw[x * 3 + 2] = b
    }
    const encoded = Buffer.alloc(stride)
    for (let x = 0; x < stride; x++) {
      const left = x >= 3 ? raw[x - 3] : 0
      const up = previous[x]
      if (filter === 0) encoded[x] = raw[x]
      else if (filter === 1) encoded[x] = (raw[x] - left) & 0xff
      else if (filter === 2) encoded[x] = (raw[x] - up) & 0xff
      else throw new Error(`this fixture writer has no filter ${filter}`)
    }
    raw.copy(previous)
    rows.push(Buffer.concat([Buffer.from([filter]), encoded]))
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // colour type: RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function counted(image) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hozo-screen-'))
  try {
    const file = path.join(dir, 'screen.png')
    writeFileSync(file, image)
    return distinctColours(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a screen that drew nothing is one colour', () => {
  // The failure the check exists for: the app launched, stayed alive, and
  // rendered nothing.
  assert.equal(counted(png(400, 800, () => [255, 255, 255])).colours, 1)
})

test('a screen with something on it is many', () => {
  const image = png(400, 800, (x, y) => [(x * 7) % 256, (y * 5) % 256, 128])
  const { colours, width, height } = counted(image)
  assert.equal(width, 400)
  assert.equal(height, 800)
  assert.ok(colours > 8, `expected a busy screen, got ${colours} colours`)
})

for (const filter of [1, 2]) {
  test(`row filter ${filter} decodes to the same flat colour`, () => {
    // A decoder that ignored the filter would read these as differences
    // rather than pixels, and differences are noise: it would report a
    // drawn screen for a blank one, which is the one verdict that must not
    // be reachable by being wrong.
    assert.equal(counted(png(120, 200, () => [18, 52, 86], filter)).colours, 1)
  })
}
