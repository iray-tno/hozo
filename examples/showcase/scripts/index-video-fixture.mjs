// This is a bounded repair for our single-fragment Chrome recording, not an
// application media parser. Media3 1.9 ignores mfra and needs sidx for seeking:
// https://github.com/androidx/media/issues/3088
// Preserve the encoded samples, timing and relative moof data offsets exactly.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function fixtureBoxes(buffer, start = 0, end = buffer.length) {
  const boxes = []
  let at = start
  while (at < end) {
    assert.ok(at + 8 <= end, 'truncated fixture box')
    const size = buffer.readUInt32BE(at)
    assert.ok(size >= 8 && at + size <= end, 'invalid fixture box size')
    boxes.push({ type: buffer.toString('ascii', at + 4, at + 8), at, size, data: at + 8 })
    at += size
  }
  assert.equal(at, end)
  return boxes
}

export function indexVideoFixture(buffer) {
  const boxes = fixtureBoxes(buffer)
  assert.deepEqual(
    boxes.map((box) => box.type),
    ['ftyp', 'moov', 'moof', 'mdat', 'mfra'],
  )
  const [, moov, moof, mdat, mfra] = boxes
  const child = (parent, type) => {
    const matches = fixtureBoxes(buffer, parent.data, parent.at + parent.size).filter(
      (box) => box.type === type,
    )
    assert.equal(matches.length, 1, `expected one ${type}`)
    return matches[0]
  }
  assert.equal(
    fixtureBoxes(buffer, moov.data, moov.at + moov.size).filter((box) => box.type === 'trak')
      .length,
    1,
  )
  const mdhd = child(child(child(moov, 'trak'), 'mdia'), 'mdhd')
  assert.equal(buffer.readUInt32BE(mdhd.data), 0x01000000)
  const timescale = buffer.readUInt32BE(mdhd.data + 20)
  assert.ok(timescale > 0)
  const traf = child(moof, 'traf')
  const tfhd = child(traf, 'tfhd')
  // No absolute data offsets need changing when inserting the segment index.
  assert.equal(buffer.readUInt32BE(tfhd.data), 0x00020020)
  const track = buffer.readUInt32BE(tfhd.data + 4)
  const tfdt = child(traf, 'tfdt')
  assert.equal(buffer.readUInt32BE(tfdt.data), 0x01000000)
  assert.equal(buffer.readBigUInt64BE(tfdt.data + 4), 0n)
  const trun = child(traf, 'trun')
  // Explicit durations and sizes, with a sync first sample and relative offset.
  assert.equal(buffer.readUInt32BE(trun.data), 0x01000305)
  const count = buffer.readUInt32BE(trun.data + 4)
  assert.equal(trun.size, 24 + count * 8)
  assert.ok(count > 0)
  assert.equal(buffer.readInt32BE(trun.data + 8), moof.size + 8)
  assert.equal(buffer.readUInt32BE(trun.data + 12), 0x02000000)
  let duration = 0
  let sampleBytes = 0
  for (let i = 0; i < count; i++) {
    duration += buffer.readUInt32BE(trun.data + 16 + i * 8)
    sampleBytes += buffer.readUInt32BE(trun.data + 20 + i * 8)
  }
  assert.equal(sampleBytes, mdat.size - 8)
  assert.ok(duration > 0 && duration <= 0xffffffff)

  const sidx = Buffer.alloc(44)
  sidx.writeUInt32BE(sidx.length, 0)
  sidx.write('sidx', 4)
  sidx.writeUInt32BE(track, 12)
  sidx.writeUInt32BE(timescale, 16)
  // Version 0, earliest presentation 0, first offset 0, one reference.
  sidx.writeUInt16BE(1, 30)
  sidx.writeUInt32BE(moof.size + mdat.size, 32)
  sidx.writeUInt32BE(duration, 36)
  sidx.writeUInt32BE(0x90000000, 40) // starts_with_SAP, SAP type 1, delta 0

  const tfra = child(mfra, 'tfra')
  assert.equal(buffer.readUInt32BE(tfra.data), 0x01000000)
  assert.equal(buffer.readUInt32BE(tfra.data + 4), track)
  assert.equal(buffer.readUInt32BE(tfra.data + 12), 1)
  assert.equal(buffer.readBigUInt64BE(tfra.data + 24), BigInt(moof.at))
  const tail = Buffer.from(buffer.subarray(mfra.at))
  // Retain the existing random-access index for engines that use it instead.
  tail.writeBigUInt64BE(BigInt(moof.at + sidx.length), tfra.data + 24 - mfra.at)
  return Buffer.concat([buffer.subarray(0, moof.at), sidx, buffer.subarray(moof.at, mfra.at), tail])
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2]
  assert.ok(file, 'usage: node index-video-fixture.mjs <owned single-fragment MP4>')
  const original = readFileSync(file)
  const indexed = indexVideoFixture(original)
  writeFileSync(file, indexed)
  console.log(`Indexed ${original.length} -> ${indexed.length} bytes without re-encoding`)
}
