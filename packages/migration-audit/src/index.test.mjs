import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { measureRealApp, renderRealAppMarkdown } from './index.mjs'

test('measures platform-aware residue after DOM style arrays are normalized', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-migration-audit-'))
  try {
    const source = path.join(root, 'src')
    mkdirSync(source)
    writeFileSync(
      path.join(source, 'Shared.tsx'),
      `import { Text as RNText, View } from 'react-native'
export function Shared() {
  return <View style={[{ display: 'flex' }, { padding: 4 }]}><RNText>Hello</RNText></View>
}
`,
    )
    writeFileSync(
      path.join(source, 'Spinner.native.tsx'),
      `import { ActivityIndicator } from 'react-native'
export function Spinner() { return <ActivityIndicator /> }
`,
    )
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    execFileSync('git', ['config', 'user.name', 'Hozo Test'], { cwd: root })
    execFileSync('git', ['config', 'user.email', 'test@hozo.invalid'], { cwd: root })
    execFileSync('git', ['add', '.'], { cwd: root })
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root })

    const report = measureRealApp({ root, source: 'src', name: 'fixture' })
    assert.equal(report.scope.tsxFiles, 2)
    assert.equal(report.lowering.parseOrCompileFailures, 0)
    assert.equal(report.review.confirmedWrongOutputFiles, 0)
    assert.equal(report.review.invalidDomStyleArrayOccurrences, 0)
    assert.equal(report.lowering.filesWithDirectReactNativeJsxResidueOnWeb, 1)
    assert.equal(report.lowering.directReactNativeJsxBindingsResidueOnWeb, 1)
    assert.deepEqual(report.reactNativeJsxResidueImports, { Text: 1 })

    const markdown = renderRealAppMarkdown(report)
    assert.match(markdown, /Real-app measurement: fixture/)
    assert.match(markdown, /DOM style-array invariant holds/)
    assert.match(markdown, /Invalid DOM style-array occurrences \| 0/)
    assert.match(markdown, /npx @hozo\/migration-audit/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
