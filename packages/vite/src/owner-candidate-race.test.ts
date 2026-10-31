import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { captureViteOwnerCandidates } from './owner-candidates.ts'

test('later async resolution cannot bless metadata changed after an earlier package was selected', async (t) => {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'hozo-owner-capture-race-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const roots = [root, path.join(root, 'first'), path.join(root, 'second')]
  for (const dir of roots) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'index.js'), 'export const value=1')
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ hozo: { manifest: 'owner.json' } }),
    )
    writeFileSync(
      path.join(dir, 'owner.json'),
      JSON.stringify({
        schema: 'rfc010-package-shadow-0',
        owners: null,
        exports: [],
        helpers: [],
        candidates: ['p-2'],
        compiledByConsumer: true,
        textForwarding: { version: 1, textForwarding: {} },
      }),
    )
  }
  const importer = path.join(root, 'index.js')
  for (const changed of ['package.json', 'owner.json'])
    await assert.rejects(
      captureViteOwnerCandidates(
        {
          context: 'race',
          edges: [
            { importer, specifier: 'first' },
            { importer, specifier: 'second' },
          ],
          locate(entry) {
            return { packageRoot: path.dirname(entry), entry, declaredManifest: 'owner.json' }
          },
        },
        async ({ specifier }) => {
          if (specifier === 'second') {
            const file = path.join(root, 'first', changed)
            writeFileSync(file, `${readFileSync(file, 'utf8')}\n`)
          }
          return { id: path.join(root, specifier, 'index.js') }
        },
        'actual-context',
      ),
      /metadata changed|INVALIDATED/,
    )
})
