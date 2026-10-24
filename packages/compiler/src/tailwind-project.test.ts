import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test('prepared batch types preserve single/mixed platform results and require a validated context', () => {
  const require = createRequire(import.meta.url)
  const tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc')
  const root = fileURLToPath(new URL('../', import.meta.url))
  execFileSync(
    process.execPath,
    [
      tsc,
      '--ignoreConfig',
      '--noEmit',
      '--strict',
      '--target',
      'es2024',
      '--module',
      'nodenext',
      '--allowImportingTsExtensions',
      '--skipLibCheck',
      '--types',
      'node',
      '--typeRoots',
      path.join(root, 'node_modules/@types'),
      path.join(root, 'fixtures/tailwind-prepared-types.ts'),
    ],
    { cwd: root, env: { ...process.env, GOMAXPROCS: '1' }, stdio: 'inherit' },
  )
})
