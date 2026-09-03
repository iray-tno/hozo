import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(file) : [file]
  })
}

const artifacts = filesUnder('storybook-static')
  .filter((file) => /\.(?:js|css)$/.test(file))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

// An unresolved *import* of `@hozo/core`, `@hozo/typography`, or `@hozo/semantics`,
// which is what a module the compiler failed to lower would leave behind.
const UNLOWERED_IMPORT = /(?:from|import)\s*\(?\s*["'`]@hozo\/(?:core|typography|semantics)["'`]/
if (UNLOWERED_IMPORT.test(artifacts)) {
  throw new Error('Storybook output still imports @hozo primitives')
}
if (!artifacts.includes('Hozo Storybook') || !/\bhozo-[a-z0-9]+-r\d+-\d+\b/.test(artifacts)) {
  throw new Error('Storybook output is missing the compiled Hozo story')
}
if (!artifacts.includes('background-color')) {
  throw new Error('Storybook output is missing Hozo-generated CSS')
}

console.log('Storybook static build check passed')
