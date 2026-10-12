import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const entries = new Map()

export function sourceEntry(native = false) {
  if (!entries.has(native))
    entries.set(
      native,
      (async () => {
        const result = await build({
          entryPoints: [
            fileURLToPath(
              new URL(`../../src/source-index${native ? '.native' : ''}.ts`, import.meta.url),
            ),
          ],
          bundle: true,
          write: false,
          platform: 'node',
          format: 'cjs',
          packages: 'external',
        })
        const module = { exports: {} }
        new Function('require', 'module', 'exports', result.outputFiles[0].text)(
          (name) => {
            assert.equal(
              name,
              'react',
              'source resolution must not import hosts, widgets or engines',
            )
            return require(name)
          },
          module,
          module.exports,
        )
        return module.exports
      })(),
    )
  return entries.get(native)
}
