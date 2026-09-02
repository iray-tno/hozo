// Whether `StaticCard` is still static, asked of the compiler.
//
// `check-build.mjs` reads the built page and cannot answer this. In Astro
// an interactive primitive without a `client:` directive does not fail --
// it renders, its handler is dropped, and the page still ships nothing. A
// `<button>` that looks right and does nothing produces no evidence for a
// check that reads HTML, because the evidence is the absence.
//
// So this asks the compiler instead. `needsClientBoundary` is a fact about
// what was emitted -- a runtime import, an event handler on a lowered
// element, or a primitive the backend carried -- and not a claim about
// where the module will be used, which no single module can know.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { createCompiler } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'

const file = path.join('src', 'components', 'StaticCard.tsx')
const lowered = lowerModule(readFileSync(file, 'utf8'), file, file, createCompiler(), process.cwd())

if (!lowered) {
  throw new Error(`${file} compiled to nothing; the assertion below would prove nothing`)
}
if (lowered.needsClientBoundary) {
  throw new Error(
    `${file} left the static subset. Astro will render it with no island and drop whatever ` +
      'needs script -- move the interactive part into its own component and give that one a ' +
      '`client:` directive.',
  )
}

console.log(`${file} is static: no runtime import, no handler, no carried primitive`)
