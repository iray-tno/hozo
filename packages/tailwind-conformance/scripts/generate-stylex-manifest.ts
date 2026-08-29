import { writeFileSync } from 'node:fs'

import { generateStylexManifest } from '../src/stylex-manifest-generate.ts'

const target = new URL('../stylex-manifest.json', import.meta.url)
writeFileSync(target, `${JSON.stringify(generateStylexManifest(), null, 2)}\n`)
console.log(`wrote ${target.pathname}`)
