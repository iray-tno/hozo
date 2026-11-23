// An intentionally cancelled nested test: the caller checks its failure and
// cleanup receipt, so a missing cancellation cannot become a passing probe.
import { existsSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { fixtureNode } from './fixture-process.mjs'
import { ownerMetroFixture } from './owner-metro-resolver.mjs'

const controller = new AbortController()
test('cancelled fixture owner', { signal: controller.signal }, async (t) => {
  const f = ownerMetroFixture(t)
  const pending = f.trackChild(
    fixtureNode(
      ['-e', "process.stderr.write('fixture-started');setInterval(()=>{},1000)"],
      f.root,
      { signal: t.signal, timeout: 0 },
    ),
  )
  let stderr = ''
  pending.child.stderr.on('data', (data) => {
    stderr += data
    // Cancel only after real child output, without a runner-speed threshold.
    controller.abort()
  })
  t.after(() =>
    writeFileSync(
      process.env.HOZO_METRO_FIXTURE_RECEIPT,
      JSON.stringify({
        closed: pending.child.exitCode !== null || pending.child.signalCode !== null,
        removed: !existsSync(f.root),
        stderr,
      }),
    ),
  )
  await pending
})
