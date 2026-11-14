// `hozo add` (RFC 012) copies an `@hozo/ui` file into the project. The copy
// is only the same component if its own output does not depend on where the
// file sits: under `node_modules/@hozo/ui/src`, or as project code under
// `src/components/ui`. Measured for every file of the package, through the
// transformer the way Metro runs it.
//
// Its callers differed until RFC 012 step 1b: a dependency's text forwarding
// reaches Metro in its manifest, and a copy has none, so a Text nested in a
// copied Button lost the button's text classes
// (docs/measurements/hozo-add-copied-callers.md). `withHozo` now summarises
// the project's own components too, and the second test holds the callers
// to the package's output.

import assert from 'node:assert/strict'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { getCacheKey, transform, withHozo } from './index.ts'

const ui = fileURLToPath(new URL('../../ui/', import.meta.url))

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-metro-copied-'))
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { '@hozo/ui': '0.0.0' } }),
  )
  const installed = path.join(root, 'node_modules', '@hozo', 'ui')
  mkdirSync(installed, { recursive: true })
  writeFileSync(
    path.join(installed, 'package.json'),
    JSON.stringify({ name: '@hozo/ui', hozo: { manifest: './hozo.manifest.json' } }),
  )
  cpSync(path.join(ui, 'hozo.manifest.json'), path.join(installed, 'hozo.manifest.json'))
  const upstream = path.join(root, 'upstream.cjs')
  writeFileSync(upstream, 'module.exports = { transform: (params) => params.src }\n')
  return { root, upstream }
}

test('an @hozo/ui file compiles the same as project code as it does in node_modules', async () => {
  const { root, upstream } = project()
  try {
    await withHozo({ projectRoot: root, transformer: { babelTransformerPath: upstream } }, { root })
    const compile = async (src: string, file: string, platform: string) => {
      const absolute = path.join(root, file)
      const output = (await transform({
        src,
        filename: absolute,
        options: { projectRoot: root, platform },
      })) as string
      // The one expected difference: the relative path to the project's
      // candidate module, which is the same file from either place.
      return output.replace(
        /from '(\.[^']*\.hozo\/[^']*)'/g,
        (_, relative: string) => `from '${path.resolve(path.dirname(absolute), relative)}'`,
      )
    }
    const files = readdirSync(path.join(ui, 'src')).filter(
      (name) => /\.tsx?$/.test(name) && !name.includes('.test.'),
    )
    assert.ok(files.length > 40, `found ${files.length} files in @hozo/ui`)
    const differ: string[] = []
    let lowered = 0
    for (const name of files) {
      const src = readFileSync(path.join(ui, 'src', name), 'utf8')
      for (const platform of ['ios', 'android']) {
        const installed = await compile(src, `node_modules/@hozo/ui/src/${name}`, platform)
        const copied = await compile(src, `src/components/ui/${name}`, platform)
        if (installed !== copied) differ.push(`${platform} ${name}`)
        if (installed !== src) lowered++
      }
    }
    assert.deepEqual(differ, [])
    // Equal because both were compiled, not because neither was. The files
    // left as written hand their classes to a pattern (`accordion.tsx`,
    // `tabs.tsx`, …), which resolves them on device; 40 of 86 were lowered
    // when this was written.
    assert.ok(lowered >= 40, `${lowered} outputs differ from their source`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// The components whose manifest entry hands a nested Text its classes: the
// name `@hozo/ui` publishes, and the file and name it is defined under.
const FORWARDING: { name: string; file: string; defined: string }[] = [
  { name: 'Alert', file: 'status', defined: 'HozoAlert' },
  { name: 'Button', file: 'button', defined: 'HozoButton' },
  { name: 'Checkbox', file: 'toggle', defined: 'HozoCheckbox' },
  { name: 'Stack', file: 'stack', defined: 'HozoStack' },
  { name: 'Switch', file: 'toggle', defined: 'HozoSwitch' },
]

// How a caller imports the components; every body below is the same.
const SHAPES: Record<string, string[]> = {
  package: [`import { ${FORWARDING.map((c) => c.name).join(', ')} } from '@hozo/ui'`],
  relative: FORWARDING.map(
    (c) => `import { ${c.defined} as ${c.name} } from './components/ui/${c.file}'`,
  ),
  alias: FORWARDING.map(
    (c) => `import { ${c.defined} as ${c.name} } from '@/components/ui/${c.file}'`,
  ),
  barrel: [`import { ${FORWARDING.map((c) => c.name).join(', ')} } from './components/ui'`],
}

function bodies(): string[] {
  const manifest = JSON.parse(readFileSync(path.join(ui, 'hozo.manifest.json'), 'utf8'))
  const out: string[] = []
  for (const { name } of FORWARDING) {
    const props: { name: string; values: string[] }[] = manifest.textForwarding[name].props
    for (const prop of ['', ...props.map((p) => ` ${p.name}="${p.values[0]}"`)]) {
      for (const inner of ['<Text>Label</Text>', 'Label', '<View><Text>Label</Text></View>'])
        out.push(`<${name}${prop}>${inner}</${name}>`)
    }
  }
  return out
}

test("a caller of a copied @hozo/ui component compiles as a caller of the package's", async () => {
  const { root, upstream } = project()
  try {
    const copies = path.join(root, 'src', 'components', 'ui')
    mkdirSync(copies, { recursive: true })
    for (const file of new Set(FORWARDING.map((c) => c.file)))
      cpSync(path.join(ui, 'src', `${file}.tsx`), path.join(copies, `${file}.tsx`))
    writeFileSync(
      path.join(copies, 'index.ts'),
      FORWARDING.map((c) => `export { ${c.defined} as ${c.name} } from './${c.file}'\n`).join(''),
    )
    writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }),
    )
    const body = bodies().map((jsx, index) => `export const X${index} = () => ${jsx}\n`)
    const sources: Record<string, string> = {}
    for (const [shape, imports] of Object.entries(SHAPES)) {
      sources[shape] = [
        "import { Text, View } from '@hozo/core'\n",
        ...imports.map((line) => `${line}\n`),
        ...body,
      ].join('')
      writeFileSync(path.join(root, 'src', `${shape}.tsx`), sources[shape])
    }
    await withHozo({ projectRoot: root, transformer: { babelTransformerPath: upstream } }, { root })
    for (const platform of ['ios', 'android', 'web']) {
      const outputs: Record<string, string> = {}
      for (const [shape, imports] of Object.entries(SHAPES)) {
        let output = (await transform({
          src: sources[shape]!,
          filename: path.join(root, 'src', `${shape}.tsx`),
          options: { projectRoot: root, platform },
        })) as string
        // Only the import lines may differ.
        for (const line of imports) output = output.replace(`${line}\n`, '')
        outputs[shape] = output
      }
      // The package's callers get forwarding at all, or this compares nothing.
      assert.match(outputs.package!, /fontWeight: '600'/)
      for (const shape of ['relative', 'alias', 'barrel'])
        assert.equal(outputs[shape], outputs.package, `${platform}, imported as ${shape}`)
    }

    // The copy is the project's to edit. Read when Metro starts, like class
    // helpers (#964): the restart that picks the edit up also changes the key.
    const key = getCacheKey({ projectRoot: root })
    const button = path.join(copies, 'button.tsx')
    writeFileSync(button, readFileSync(button, 'utf8').replaceAll('font-semibold', 'font-bold'))
    await withHozo({ projectRoot: root, transformer: { babelTransformerPath: upstream } }, { root })
    assert.notEqual(getCacheKey({ projectRoot: root }), key)
    const edited = (await transform({
      src: sources.relative!,
      filename: path.join(root, 'src', 'relative.tsx'),
      options: { projectRoot: root, platform: 'ios' },
    })) as string
    assert.match(edited, /fontWeight: '700'/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
