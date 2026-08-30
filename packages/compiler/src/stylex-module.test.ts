import assert from 'node:assert/strict'
import test from 'node:test'

import { summarizeStylexModule } from './index.ts'

test('StyleX module summaries preserve public aliases and lowering status', () => {
  const summary = summarizeStylexModule(`
    import * as stylex from '@stylexjs/stylex'
    const styles = stylex.create({
      root: { padding: 8 },
      dynamic: (value) => ({ opacity: value }),
      mixed: { color: 'red', touchAction: 'pan-x' },
    })
    export { styles as cardStyles }
  `)

  assert.deepEqual(summary.exports, [
    {
      exported: 'cardStyles',
      local: 'styles',
      kind: 'sheet',
      members: [
        { name: 'dynamic', status: 'function' },
        { name: 'mixed', status: 'partial' },
        { name: 'root', status: 'static' },
      ],
    },
  ])
})
