// What compiled output imports has to be pre-bundled before Vite has seen
// any compiled output (#1698).
//
// A real dev server over an installed -- copied, not linked -- `@hozo/core`,
// because what is under test is Vite's dependency scan, and it only treats a
// package under `node_modules` as a dependency to optimize. The package's
// modules are stubs: the compiler reads the import, not what it resolves to.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { GENERATED_SPECIFIERS } from '@hozo/compiler/lower'
import { createServer, type ViteDevServer } from 'vite'
import { hozo } from './index.ts'
import { injectedDependencies } from './injected-deps.ts'

const CORE_LEAVES = GENERATED_SPECIFIERS.filter((specifier) => specifier.startsWith('@hozo/core/'))

const roots: string[] = []
const servers: ViteDevServer[] = []

after(async () => {
  for (const server of servers) await server.close()
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function write(file: string, content: string) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

/** `@hozo/core` as an installed package: every generated leaf, each a stub. */
function fakeCore(directory: string) {
  const exports: Record<string, string> = { '.': './index.js' }
  for (const specifier of CORE_LEAVES) {
    const subpath = specifier.slice('@hozo/core'.length)
    exports[`.${subpath}`] = `.${subpath}.js`
    write(path.join(directory, `${subpath}.js`), 'export {}\n')
  }
  write(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: '@hozo/core', version: '0.0.0', type: 'module', exports }),
  )
  write(path.join(directory, 'index.js'), 'export const TextInput = () => null\n')
}

function project(): string {
  // `.native`: see dev.test.ts's project() for why a runner needs it.
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'hozo-deps-')))
  roots.push(root)
  write(path.join(root, 'package.json'), JSON.stringify({ name: 'app', type: 'module' }))
  write(
    path.join(root, 'index.html'),
    '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
  )
  write(
    path.join(root, 'src/main.tsx'),
    // A prop the compiler cannot read, so the output keeps a runtime import.
    "import { TextInput } from '@hozo/core'\n\nexport const App = (props: { value: string }) => <TextInput {...props} />\n",
  )
  return root
}

test('every generated leaf an installed @hozo/core provides is one the optimizer is told', () => {
  const root = project()
  fakeCore(path.join(root, 'node_modules/@hozo/core'))
  const include = injectedDependencies(root)
  assert.ok(include.includes('@hozo/core/generated/text-input-dom-props'))
  // `@hozo/rn-compat` is not installed, and Vite reports an entry it cannot resolve.
  assert.deepEqual(include, CORE_LEAVES)
})

test('a linked @hozo/core is not pre-bundled in pieces', () => {
  const root = project()
  const linked = path.join(root, 'workspace/core')
  fakeCore(linked)
  mkdirSync(path.join(root, 'node_modules/@hozo'), { recursive: true })
  symlinkSync(linked, path.join(root, 'node_modules/@hozo/core'), 'junction')
  assert.deepEqual(injectedDependencies(root), [])
})

test('a cold dev server finds the modules compiled output imports without re-optimizing', async () => {
  const root = project()
  fakeCore(path.join(root, 'node_modules/@hozo/core'))
  const require = createRequire(import.meta.url)
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    cacheDir: path.join(root, 'node_modules/.vite'),
    server: { middlewareMode: true, watch: null },
    resolve: {
      alias: {
        'react/jsx-dev-runtime': require.resolve('react/jsx-dev-runtime'),
        'react/jsx-runtime': require.resolve('react/jsx-runtime'),
        react: require.resolve('react'),
      },
    },
    plugins: [hozo()],
  })
  servers.push(server)
  const optimizer = server.environments.client.depsOptimizer
  assert.ok(optimizer)
  await optimizer.scanProcessing
  const scanned = new Set(Object.keys(optimizer.metadata.discovered))
  const compiled = await server.transformRequest('/src/main.tsx')
  assert.match(compiled?.code ?? '', /import \{ hozoTextInputDomProps \} from/)
  // An import the scan did not know is registered while serving, and that
  // is what makes Vite re-optimize and reload the page.
  const late = Object.keys(optimizer.metadata.discovered).filter((id) => !scanned.has(id))
  assert.deepEqual(
    late.filter((id) => id.startsWith('@hozo/')),
    [],
  )
})
