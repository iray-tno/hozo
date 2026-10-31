import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// A receipt belongs to a checkout, not whichever report happens to find it.
export function evidenceSource() {
  const cwd = fileURLToPath(new URL('../../', import.meta.url))
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  }).trim()
  const diff = spawnSync('git', ['diff', '--quiet', 'HEAD', '--'], { cwd })
  if (diff.status !== 0 && diff.status !== 1)
    throw new Error('Cannot identify tracked source changes')
  return { sourceCommit, trackedChanges: diff.status === 1 }
}
