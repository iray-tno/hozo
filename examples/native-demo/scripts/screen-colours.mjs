// How many distinct colours a screenshot has, and a threshold to judge it by.
//
// The iOS smoke test needs an outcome rather than a message. An app whose
// JavaScript threw before rendering still launches, still stays alive, and
// on a release build still logs everything a healthy one logs -- what it
// does not do is draw. The screen is then one flat colour, and that is the
// difference this measures.
//
// The lesson is from the Android job, which spent four CI runs reasoning
// about an invisible symptom because its success test matched a *message*
// (`grep -q 'UI hierchary dumped'`) rather than an outcome (a non-empty
// file arrived). AOSP's own misspelling of that message is what settled
// it: the message was never a contract.
//
// No image library, because a PNG from `simctl` is the easy case of the
// format and `node:zlib` already has the hard part. Everything here is
// enough to read that case and refuses anything else rather than guessing.

import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

/** Bytes per pixel, by PNG colour type. Only the ones `simctl` writes. */
const CHANNELS = { 2: 3, 6: 4 }

function chunks(file) {
  if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG')
  const found = []
  let at = 8
  while (at < file.length) {
    const length = file.readUInt32BE(at)
    found.push({
      type: file.toString('ascii', at + 4, at + 8),
      data: file.subarray(at + 8, at + 8 + length),
    })
    at += length + 12
  }
  return found
}

/**
 * Undoes the per-row filters, which is the whole of PNG decoding once zlib
 * has run. The filter of a row is chosen by the encoder per row, so all
 * five have to be here even though `simctl` mostly emits one.
 */
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0
      let value = row[x]
      if (filter === 1) value += a
      else if (filter === 2) value += b
      else if (filter === 3) value += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) throw new Error(`unknown PNG row filter ${filter}`)
      out[y * stride + x] = value & 0xff
    }
  }
  return { pixels: out, stride }
}

export function distinctColours(file) {
  const parsed = chunks(readFileSync(file))
  const header = parsed.find((chunk) => chunk.type === 'IHDR')
  if (!header) throw new Error('no IHDR')
  const width = header.data.readUInt32BE(0)
  const height = header.data.readUInt32BE(4)
  const depth = header.data[8]
  const colourType = header.data[9]
  const interlace = header.data[12]
  const bpp = CHANNELS[colourType]
  if (depth !== 8 || !bpp || interlace !== 0) {
    throw new Error(
      `unsupported PNG: depth ${depth}, colour type ${colourType}, interlace ${interlace}`,
    )
  }
  const raw = inflateSync(
    Buffer.concat(parsed.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data)),
  )
  const { pixels, stride } = unfilter(raw, width, height, bpp)

  // A sample rather than every pixel: a phone screenshot is two million of
  // them and the question is "more than one colour", which a grid answers
  // as well as a census does and in a fraction of the time.
  const colours = new Set()
  const step = Math.max(1, Math.floor(Math.min(width, height) / 200))
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const at = y * stride + x * bpp
      colours.add((pixels[at] << 16) | (pixels[at + 1] << 8) | pixels[at + 2])
    }
  }
  return { width, height, colours: colours.size }
}

if (process.argv[1]?.endsWith('screen-colours.mjs')) {
  const [file, minimum = '8'] = process.argv.slice(2)
  if (!file) {
    console.error('usage: screen-colours.mjs <screenshot.png> [minimum distinct colours]')
    process.exit(2)
  }
  const { width, height, colours } = distinctColours(file)
  console.log(`${file}: ${width}x${height}, ${colours} distinct colours sampled`)
  if (colours < Number(minimum)) {
    // A launched app that drew nothing is the failure this exists for: it
    // logs what a working one logs, and the screen is one flat colour.
    console.error(
      `::error::the screen has ${colours} colours, fewer than the ${minimum} a drawn screen has`,
    )
    process.exit(1)
  }
}
