import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nativeBuildChanges } from './rebundle-rules.mjs'

// Diagnostic only: rebuild Release Hermes JS in a restored app, not native code.
const [runId, repository] = process.argv.slice(2)
assert.match(runId ?? '', /^\d+$/)
assert.match(repository ?? '', /^[\w.-]+\/[\w.-]+$/)
assert.equal(process.env.HOZO_DIAGNOSTICS, '1')
const root = fileURLToPath(new URL('../../../', import.meta.url))
const project = resolve(root, 'examples/native-showcase')
const app = resolve(project, 'ios/build/Build/Products/Release-iphonesimulator/HozoShowcase.app')
assert.ok(statSync(resolve(app, 'main.jsbundle')).size > 0, 'restored app has no JS bundle')
const run = (command, args) => execFileSync(command, args, { cwd: root }).toString().trim()
const base = JSON.parse(run('gh', ['api', `repos/${repository}/actions/runs/${runId}`]))
assert.equal(
  base.event,
  'workflow_dispatch',
  'rebundling requires a manual build with unambiguous source',
)
assert.equal(base.name, 'native-showcase')
assert.match(base.head_sha, /^[a-f0-9]{40}$/)
run('git', ['fetch', '--depth=1', 'origin', base.head_sha])
const paths = run('git', ['diff', '--name-only', base.head_sha, 'HEAD'])
  .split(/\r?\n/)
  .filter(Boolean)
const nativeChanges = nativeBuildChanges(paths)
assert.deepEqual(
  nativeChanges,
  [],
  `native inputs changed; rebuild the app: ${nativeChanges.join(', ')}`,
)
execFileSync(
  'pnpm',
  [
    'exec',
    'expo',
    'export:embed',
    '--entry-file',
    'index.ts',
    '--platform',
    'ios',
    '--dev',
    'false',
    '--bytecode',
    '--bundle-output',
    resolve(app, 'main.jsbundle'),
    '--assets-dest',
    app,
  ],
  { cwd: project, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } },
)
assert.ok(statSync(resolve(app, 'main.jsbundle')).size > 0, 'rebundled app has no JS bundle')
console.log(
  `Diagnostic app: native source ${base.head_sha}; JS source ${run('git', ['rev-parse', 'HEAD'])}`,
)
