import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  assertCompiles,
  EMNAPI_ARCHIVE,
  tarMember,
  wasmMemoryMinimum,
  writeLoader,
} from '../scripts/pack-wasi.mjs'
import { WASI_RUNTIME_DEPENDENCIES, WASI_TARGET } from './native-targets.ts'

const uleb = (value: number) => {
  const bytes: number[] = []
  do {
    let byte = value & 0x7f
    value >>>= 7
    if (value) byte |= 0x80
    bytes.push(byte)
  } while (value)
  return bytes
}
const name = (text: string) => [...uleb(text.length), ...Buffer.from(text)]

/** A module importing a function and then a shared memory, as `hozo_napi.wasm` does. */
function moduleImportingMemory(minimum: number) {
  const types = [1, 0x60, 0, 0] // one type: () -> ()
  const imports = [
    2,
    ...name('env'),
    ...name('f'),
    0,
    0, // function, type 0
    ...name('env'),
    ...name('memory'),
    2,
    3,
    ...uleb(minimum),
    ...uleb(65536), // memory: shared, with a maximum
  ]
  return Uint8Array.from([
    ...[0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0],
    1,
    ...uleb(types.length),
    ...types,
    2,
    ...uleb(imports.length),
    ...imports,
  ])
}

test('reads the memory minimum the module declares, past other imports', () => {
  for (const minimum of [1, 127, 128, 984]) {
    const bytes = moduleImportingMemory(minimum)
    // The fixture is a module the engine accepts, not just bytes this
    // parser agrees with.
    assert.ok(WebAssembly.validate(bytes))
    assert.equal(wasmMemoryMinimum(bytes), minimum)
  }
  assert.throws(() => wasmMemoryMinimum(Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0])))
})

test('a module the engine will not compile is refused before it is packed', () => {
  assert.doesNotThrow(() => assertCompiles(moduleImportingMemory(984)))
  // A function body that calls a one-argument function with no argument:
  // the shape of the invalid code a signature clash at link time leaves.
  const invalid = Uint8Array.from([
    ...[0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0],
    ...[1, 8, 2, 0x60, 1, 0x7f, 0, 0x60, 0, 0], // types: (i32) -> (), () -> ()
    ...[3, 3, 2, 0, 1], // functions: 0 has type 0, 1 has type 1
    ...[10, 9, 2, 2, 0, 0x0b, 4, 0, 0x10, 0, 0x0b], // bodies: f0 = end; f1 = call 0; end
  ])
  assert.equal(WebAssembly.validate(invalid), false)
  assert.throws(
    () => assertCompiles(invalid),
    /does not compile.*__wasilibc_futex_wait_atomic_wait/s,
  )
})

test('the shipped loader takes the minimum and refuses to be packed without one', () => {
  const template = readFileSync(new URL(`../wasi/${WASI_TARGET.loader}`, import.meta.url), 'utf8')
  const filled = writeLoader(template, 984)
  assert.match(filled, /^const MINIMUM_PAGES = 984$/m)
  assert.doesNotMatch(filled, /^const MINIMUM_PAGES = 0$/m)
  assert.match(filled, new RegExp(`const WASM = '${WASI_TARGET.wasm}'`))
  assert.throws(() => writeLoader(filled, 984), /MINIMUM_PAGES = 0/)
  assert.throws(() => writeLoader(template, 0))
})

test('extracts one regular file from a tar, skipping the others', () => {
  const entry = (file: string, content: string) => {
    const header = Buffer.alloc(512)
    header.write(file, 0)
    header.write(`${content.length.toString(8).padStart(11, '0')}\0`, 124)
    header.write('0', 156)
    const body = Buffer.alloc(Math.ceil(content.length / 512) * 512)
    body.write(content)
    return Buffer.concat([header, body])
  }
  const tar = Buffer.concat([
    entry('package/README.md', 'x'.repeat(700)),
    entry(EMNAPI_ARCHIVE.member, 'archive'),
    Buffer.alloc(1024),
  ])
  assert.equal(tarMember(tar, EMNAPI_ARCHIVE.member)?.toString(), 'archive')
  assert.equal(tarMember(tar, 'package/missing'), undefined)
})

test('the linked archive and the runtime are the same emnapi release', () => {
  assert.equal(EMNAPI_ARCHIVE.version, WASI_RUNTIME_DEPENDENCIES['@emnapi/core'])
  assert.equal(
    WASI_RUNTIME_DEPENDENCIES['@emnapi/core'],
    WASI_RUNTIME_DEPENDENCIES['@emnapi/runtime'],
  )
  assert.ok(EMNAPI_ARCHIVE.member.includes(WASI_TARGET.triple))
})
