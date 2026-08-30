import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createCompiler, summarizeStylexModule } from './index.ts'
import { lowerModule } from './lower.ts'
import { StylexModuleCache } from './stylex-project.ts'

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

test('static rules imported from another module lower through the shared registry', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-stylex-cross-file-'))
  try {
    const definition = path.join(root, 'styles.ts')
    const component = path.join(root, 'Card.tsx')
    const definitionSource = `import * as stylex from '@stylexjs/stylex'
      const local = stylex.create({
        root: { padding: 16, color: 'red' },
        unsupported: { transform: 'translateX(calc(100% - 2px))' },
      })
      export { local as cardStyles }`
    const componentSource = `import * as stylex from '@stylexjs/stylex'
      import { View } from '@hozo/core'
      import { cardStyles as styles } from './styles'
      export const Card = () => <View {...stylex.props(styles.root)} />`
    writeFileSync(definition, definitionSource)
    writeFileSync(component, componentSource)

    const modules = new StylexModuleCache(path.join(root, 'stylex-modules.json'))
    modules.scanFile(definition, definitionSource, 1)
    const compiler = createCompiler()
    compiler.setStylexModules(modules.moduleSources())

    const web = lowerModule(componentSource, component, component, compiler, root, modules)
    assert.ok(web)
    assert.doesNotMatch(web.code, /stylex\.props/)
    assert.match(web.css, /padding-top: 16px/)
    assert.match(web.css, /color: red/)

    const native = compiler.compileNative(
      componentSource,
      modules.bindingsFor(component),
    )
    assert.equal(native.length, 1)
    assert.doesNotMatch(native[0]!.jsx, /stylex\.props/)
    assert.match(native[0]!.styles, /paddingTop: 16/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('unsupported imported members remain with official StyleX', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-stylex-gap-'))
  try {
    const definition = path.join(root, 'styles.ts')
    const component = path.join(root, 'Card.tsx')
    const definitionSource = `import * as stylex from '@stylexjs/stylex'
      export const styles = stylex.create({
        unsupported: { transform: 'translateX(calc(100% - 2px))' },
      })`
    const componentSource = `import * as stylex from '@stylexjs/stylex'
      import { View } from '@hozo/core'
      import { styles } from './styles'
      export const Card = () => <View {...stylex.props(styles.unsupported)} />`
    writeFileSync(definition, definitionSource)
    writeFileSync(component, componentSource)
    const modules = new StylexModuleCache(path.join(root, 'stylex-modules.json'))
    modules.scanFile(definition, definitionSource, 1)
    const compiler = createCompiler()
    compiler.setStylexModules(modules.moduleSources())

    const web = lowerModule(componentSource, component, component, compiler, root, modules)
    assert.ok(web)
    assert.match(web.code, /stylex\.props\(styles\.unsupported\)/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
