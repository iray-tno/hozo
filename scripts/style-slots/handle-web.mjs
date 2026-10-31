// Independent Tailwind CSS oracle for the real Web handle, not a manifest audit.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { openCandidateCache } from '../../packages/compiler/src/index.ts'
import { tailwindPackageDir } from '../../packages/tailwind/src/theme.ts'
import { handleClasses, handleRoot } from './handle-publication.mjs'

export const handleStateClasses = `${handleClasses} opacity-100 hover:opacity-50 focus:p-3 active:bg-[#ff0000]`

export async function prepareWebHandle() {
  const require = createRequire(path.join(handleRoot, 'examples/storybook-demo/package.json'))
  const { compile } = require('tailwindcss')
  const names = [...new Set(handleStateClasses.split(' '))]
  const cache = openCandidateCache()
  cache.scanFile('handle.ts', JSON.stringify(names), 0)
  const oracle = await compile(
    `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}\n@tailwind utilities;`,
  )
  return {
    rest: handleClasses,
    interactive: handleStateClasses,
    candidateCss: cache.renderCss(),
    oracleCss: oracle.build(names),
  }
}
