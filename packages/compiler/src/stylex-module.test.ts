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
        dynamic: (opacity) => ({ opacity }),
        unsupported: { transform: 'translateX(calc(100% - 2px))' },
      })
      export { local as cardStyles }`
    const componentSource = `import * as stylex from '@stylexjs/stylex'
      import { View } from '@hozo/core'
      import { cardStyles as styles } from './styles'
      export const Card = () => <View {...stylex.props(styles.root, styles.dynamic(0.5))} />`
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
    assert.match(web.css, /opacity: 0.5/)

    const native = compiler.compileNative(
      componentSource,
      modules.bindingsFor(component),
    )
    assert.equal(native.length, 1)
    assert.doesNotMatch(native[0]!.jsx, /stylex\.props/)
    assert.match(native[0]!.styles, /paddingTop: 16/)
    assert.match(native[0]!.styles, /opacity: 0.5/)

    const runtimeSource = `import * as stylex from '@stylexjs/stylex'
      import { View } from '@hozo/core'
      import { cardStyles as styles } from './styles'
      export const Card = ({ opacity }) => <View {...stylex.props(styles.dynamic(opacity))} />`
    const runtime = lowerModule(runtimeSource, component, component, compiler, root, modules)
    assert.ok(runtime)
    assert.match(runtime.code, /stylex\.props\(styles\.dynamic\(opacity\)\)/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('namespace imports can select an exported static sheet', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-stylex-namespace-'))
  try {
    const definition = path.join(root, 'styles.ts')
    const component = path.join(root, 'Card.tsx')
    const definitionSource = `import * as stylex from '@stylexjs/stylex'
      const local = stylex.create({ root: { marginTop: 12 } })
      export { local as cardStyles }`
    const componentSource = `import * as stylex from '@stylexjs/stylex'
      import { View } from '@hozo/core'
      import * as sheets from './styles'
      export const Card = () => <View {...stylex.props(sheets.cardStyles.root)} />`
    writeFileSync(definition, definitionSource)
    writeFileSync(component, componentSource)
    const modules = new StylexModuleCache(path.join(root, 'stylex-modules.json'))
    modules.scanFile(definition, definitionSource, 1)
    const compiler = createCompiler()
    compiler.setStylexModules(modules.moduleSources())

    const web = lowerModule(componentSource, component, component, compiler, root, modules)
    assert.ok(web)
    assert.doesNotMatch(web.code, /stylex\.props/)
    assert.match(web.css, /margin-top: 12px/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('named and star re-export chains reach the defining sheet', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-stylex-reexport-'))
  try {
    const definition = path.join(root, 'styles.ts')
    const namedBarrel = path.join(root, 'named.ts')
    const starBarrel = path.join(root, 'index.ts')
    const component = path.join(root, 'Card.tsx')
    const definitionSource = `import * as stylex from '@stylexjs/stylex'
      export const styles = stylex.create({ root: { padding: 20 } })`
    const namedSource = `export { styles as cardStyles } from './styles'`
    const starSource = `export * from './named'`
    const componentSource = `import * as stylex from '@stylexjs/stylex'
      import { View } from '@hozo/core'
      import { cardStyles } from './index'
      export const Card = () => <View {...stylex.props(cardStyles.root)} />`
    for (const [file, source] of [
      [definition, definitionSource],
      [namedBarrel, namedSource],
      [starBarrel, starSource],
      [component, componentSource],
    ] as const) {
      writeFileSync(file, source)
    }

    const modules = new StylexModuleCache(path.join(root, 'stylex-modules.json'))
    modules.scanFile(definition, definitionSource, 1)
    modules.scanFile(namedBarrel, namedSource, 1)
    modules.scanFile(starBarrel, starSource, 1)
    assert.equal(modules.size, 3)
    const compiler = createCompiler()
    compiler.setStylexModules(modules.moduleSources())

    const web = lowerModule(componentSource, component, component, compiler, root, modules)
    assert.ok(web)
    assert.doesNotMatch(web.code, /stylex\.props/)
    assert.match(web.css, /padding-top: 20px/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('namespace re-exports preserve their member path through aliases and import forms', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-stylex-namespace-reexport-'))
  try {
    const definition = path.join(root, 'styles.ts')
    const namespaceBarrel = path.join(root, 'namespace.ts')
    const barrel = path.join(root, 'index.ts')
    const namedComponent = path.join(root, 'NamedCard.tsx')
    const namespaceComponent = path.join(root, 'NamespaceCard.tsx')
    const definitionSource = `import * as stylex from '@stylexjs/stylex'
      export const styles = stylex.create({ root: { marginTop: 24 } })`
    const namespaceBarrelSource = `export * as theme from './styles'`
    const barrelSource = `export { theme as palette } from './namespace'`
    const namedSource = `import * as stylex from '@stylexjs/stylex'
      import { View } from '@hozo/core'
      import { palette } from './index'
      export const Card = () => <View {...stylex.props(palette.styles.root)} />`
    const namespaceSource = `import * as stylex from '@stylexjs/stylex'
      import { View } from '@hozo/core'
      import * as barrel from './index'
      export const Card = () => <View {...stylex.props(barrel.palette.styles.root)} />`
    for (const [file, source] of [
      [definition, definitionSource],
      [namespaceBarrel, namespaceBarrelSource],
      [barrel, barrelSource],
      [namedComponent, namedSource],
      [namespaceComponent, namespaceSource],
    ] as const) {
      writeFileSync(file, source)
    }

    const modules = new StylexModuleCache(path.join(root, 'stylex-modules.json'))
    modules.scanFile(definition, definitionSource, 1)
    modules.scanFile(namespaceBarrel, namespaceBarrelSource, 1)
    modules.scanFile(barrel, barrelSource, 1)
    const compiler = createCompiler()
    compiler.setStylexModules(modules.moduleSources())

    const named = lowerModule(namedSource, namedComponent, namedComponent, compiler, root, modules)
    assert.ok(named)
    assert.doesNotMatch(named.code, /stylex\.props/)
    assert.match(named.css, /margin-top: 24px/)

    const namespace = lowerModule(
      namespaceSource,
      namespaceComponent,
      namespaceComponent,
      compiler,
      root,
      modules,
    )
    assert.ok(namespace)
    assert.doesNotMatch(namespace.code, /stylex\.props/)
    assert.match(namespace.css, /margin-top: 24px/)

    const native = compiler.compileNative(
      namespaceSource,
      modules.bindingsFor(namespaceComponent),
    )
    assert.equal(native.length, 1)
    assert.doesNotMatch(native[0]!.jsx, /stylex\.props/)
    assert.match(native[0]!.styles, /marginTop: 24/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ambiguous star re-exports stay with official StyleX', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-stylex-ambiguous-star-'))
  try {
    const left = path.join(root, 'left.ts')
    const right = path.join(root, 'right.ts')
    const barrel = path.join(root, 'index.ts')
    const component = path.join(root, 'Card.tsx')
    const leftSource = `import * as stylex from '@stylexjs/stylex'
      export const styles = stylex.create({ root: { color: 'red' } })`
    const rightSource = `import * as stylex from '@stylexjs/stylex'
      export const styles = stylex.create({ root: { color: 'blue' } })`
    const barrelSource = `export * from './left'
      export * from './right'`
    const componentSource = `import * as stylex from '@stylexjs/stylex'
      import { View } from '@hozo/core'
      import { styles } from './index'
      export const Card = () => <View {...stylex.props(styles.root)} />`
    for (const [file, source] of [
      [left, leftSource],
      [right, rightSource],
      [barrel, barrelSource],
      [component, componentSource],
    ] as const) {
      writeFileSync(file, source)
    }

    const modules = new StylexModuleCache(path.join(root, 'stylex-modules.json'))
    modules.scanFile(left, leftSource, 1)
    modules.scanFile(right, rightSource, 1)
    modules.scanFile(barrel, barrelSource, 1)
    const compiler = createCompiler()
    compiler.setStylexModules(modules.moduleSources())

    const web = lowerModule(componentSource, component, component, compiler, root, modules)
    assert.ok(web)
    assert.match(web.code, /stylex\.props\(styles\.root\)/)
    assert.doesNotMatch(web.css, /color:/)
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
