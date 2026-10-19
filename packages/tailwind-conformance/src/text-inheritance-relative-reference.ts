// Use the real relative-size implementation, not a second ratio calculator.
// Only the private experiment binds its RN Text to the contextual Text so
// resolved metrics/paint also reach opaque descendants of a relative owner.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { transformSync } from 'esbuild'
import { ReferenceText } from './text-inheritance-reference.ts'

const require = createRequire(import.meta.url)
const native = require('./text-inheritance-host.ts')
const source = readFileSync(
  new URL('../../primitives/src/runtime-text-size.native.tsx', import.meta.url),
  'utf8',
)
const code = transformSync(source, { loader: 'tsx', jsx: 'automatic', format: 'cjs' }).code
const module = { exports: {} }
new Function('require', 'module', 'exports', code)(
  (specifier: string) =>
    specifier === 'react-native' ? { ...native, Text: ReferenceText } : require(specifier),
  module,
  module.exports,
)

export const relativeReferenceImports = module.exports
