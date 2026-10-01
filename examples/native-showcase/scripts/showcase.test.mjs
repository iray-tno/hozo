import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { transformHozoSource } from '../../../packages/metro/src/transform.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)

test('Storybook composes with the Hozo transformer and host singleton resolver', async () => {
  const config = await require('../metro.config.js')
  assert.equal(config.transformer.babelTransformerPath, require.resolve('@hozo/metro'))
  assert.equal(config.transformer.unstable_allowRequireContext, true)
  const context = {
    originModulePath: path.join(root, 'App.tsx'),
    resolveRequest: (_context, request) => ({ type: 'sourceFile', filePath: request }),
  }
  for (const platform of ['android', 'ios']) {
    const project = config.resolver.resolveRequest(context, '@hozo/engine/project', platform)
    assert.match(project.filePath, /\.hozo[/\\]candidates\.native\.js$/)
    for (const request of ['react', 'react-native', '@react-three/fiber/native', 'three']) {
      const resolved = config.resolver.resolveRequest(context, request, platform)
      assert.equal(resolved.filePath, require.resolve(request))
    }
  }
})

test('shared patterns keep platform-neutral bodies and lower their primitive children', () => {
  const file = path.join(root, '../showcase/src/patterns.tsx')
  const source = readFileSync(file, 'utf8')
  assert.doesNotMatch(
    source,
    /from ['"](?:react-native|@storybook\/[^'"]+)['"]|\b(?:window|document)\./,
  )
  const transformed = transformHozoSource(source, file)
  assert.ok(transformed)
  assert.doesNotMatch(transformed, /className=|<(?:Text|View|Heading|Paragraph)\b[^>]*className=/)
  assert.match(transformed, /restoreFocusTo=\{opener\}/)
  assert.match(transformed, /onCheckedChange=\{setNotifications\}/)
  assert.match(transformed, /onIndexChange=\{setSelected\}/)
  assert.match(transformed, /StyleSheet\.create/)
  for (const [, module] of transformed.matchAll(/from ['"](@hozo\/[^'"]+)['"]/g)) {
    assert.ok(
      createRequire(file).resolve(module),
      `shared source must declare generated dependency ${module}`,
    )
  }
})

test('shared bodies lower into Native styles, accessible controls and nested Text', () => {
  const file = path.join(root, '../showcase/src/index.tsx')
  const source = readFileSync(file, 'utf8')
  assert.doesNotMatch(
    source,
    /from ['"](?:react-native|@storybook\/[^'"]+)['"]|\b(?:window|document)\./,
  )
  const transformed = transformHozoSource(source, file)
  assert.ok(transformed)
  assert.doesNotMatch(
    transformed,
    /className=|from ['"]@hozo\/(?:primitives|typography)['"]|<(?:Button|Heading|Paragraph|Strong|Emphasis)\b/,
  )
  assert.match(transformed, /StyleSheet\.create/)
  assert.match(transformed, /accessibilityRole="header"/)
  assert.match(transformed, /accessibilityRole="button"/)
  assert.match(transformed, /accessibilityState=\{\{ disabled: Boolean\(disabled\) \}\}/)
  assert.match(transformed, /onChangeText=\{setName\}/)
  assert.match(transformed, /fontStyle: 'italic'/)
  assert.match(transformed, /<Text[^>]+>strong text<\/Text>/)
  for (const [, module] of transformed.matchAll(/from ['"](@hozo\/[^'"]+)['"]/g)) {
    assert.ok(
      createRequire(file).resolve(module),
      `generated dependency ${module} must be installed beside its source package`,
    )
  }
})
