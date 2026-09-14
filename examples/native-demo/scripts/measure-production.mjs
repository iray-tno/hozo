import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import Metro from 'metro'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(projectRoot, 'dist')
mkdirSync(outputDirectory, { recursive: true })

const config = await Metro.loadConfig({ cwd: projectRoot, resetCache: true })
const builds = [
  ['application', 'index.js'],
  ['hozo', 'bench-hozo.js'],
  ['native', 'bench-native.js'],
]

const sizes = {}
for (const [name, entry] of builds) {
  const output = path.join(outputDirectory, `${name}.production.bundle`)
  await Metro.runBuild(config, {
    entry,
    platform: 'android',
    minify: true,
    dev: false,
    out: output,
  })
  const bytes = readFileSync(`${output}.js`)
  sizes[name] = { raw: bytes.length, gzip: gzipSync(bytes).length }
}

const result = {
  mode: { platform: 'android', dev: false, minify: true },
  bytes: sizes,
  hozoIncrement: {
    raw: sizes.hozo.raw - sizes.native.raw,
    gzip: sizes.hozo.gzip - sizes.native.gzip,
  },
}
writeFileSync(
  path.join(outputDirectory, 'bundle-sizes.json'),
  `${JSON.stringify(result, null, 2)}\n`,
)

console.log(JSON.stringify(result, null, 2))

// This pair has the same React Native dependencies and UI structure. A
// large positive delta means build-time Hozo code or an accidental runtime
// dependency leaked into the application bundle. HozoFlatList bundles
// Android accessibility collection support, which is accounted for here.
//
// The limit is close to the measurement on purpose. Compiled output
// imports one `@hozo/core/generated/*` leaf per thing it uses, and this
// screen uses a `FlatList`: 2,021 bytes raw, 536 gzipped (#435). Before
// leaves it imported the primitives index and paid 51,252 / 13,820 for
// every primitive, `@hozo/behaviors` and the environment hooks; a coarser
// leaf or a barrel sneaking back in is exactly that size again, and a
// ceiling at 120KB would have waved it through.
if (result.hozoIncrement.raw > 8_000 || result.hozoIncrement.gzip > 3_000) {
  throw new Error(
    `Hozo production increment is unexpectedly large: ${JSON.stringify(result.hozoIncrement)}`,
  )
}
