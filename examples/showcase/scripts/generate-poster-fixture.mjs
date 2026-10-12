import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

function chunk(type, data) {
  const name = Buffer.from(type)
  let crc = 0xffffffff
  for (const byte of Buffer.concat([name, data])) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([length, name, data, checksum])
}

/** Original opaque teal diamond, deliberately unlike the decoded purple square. */
export function posterFixture() {
  const width = 320
  const height = 180
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2 // RGB; each scanline's first byte is filter None.
  const rows = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const diamond = Math.abs(x - 160) + Math.abs(y - 90) <= 55
      const colour = diamond ? [20, 184, 166] : [15, 23, 42]
      rows.set(colour, y * (width * 3 + 1) + 1 + x * 3)
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('../assets/hozo-video-poster.png', import.meta.url), posterFixture())
}
