// Ask the installed tsc to compare real exported types. This uses the CLI,
// not the old JavaScript compiler API (which TypeScript 7 does not expose).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { components } from './catalog.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
const quote = JSON.stringify

export function publicPropsProbe(catalog = components) {
  const rows = Object.entries(catalog).map(
    ([name, slots]) => `  ${name}: ${slots.map((slot) => quote(slot.classProp)).join(' | ')}`,
  )
  const callbacks = Object.entries(catalog).flatMap(([name, slots]) =>
    slots
      .filter((slot) => slot.callback)
      .map(
        (slot) =>
          `export const ${name}_${slot.callback}: true = null as unknown as (${quote(slot.callback)} extends keyof PropsOf<typeof N.${name}> ? true : ${quote(`${name}.${slot.callback} missing declaration`)})\nexport const ${name}_${slot.callback}_facts: true = null as unknown as (Parameters<NonNullable<PropsOf<typeof N.${name}>[${quote(slot.callback)}]>>[0] extends Facts.${slot.profile}SlotFacts ? true : ${quote(`${name}.${slot.callback} wrong facts`)})`,
      ),
  )
  const styles = Object.entries(catalog).flatMap(([name, slots]) =>
    slots
      .filter((slot) => slot.lowering !== 'web-only' && slot.styleProp !== null)
      .map(
        (slot) =>
          `export const ${name}_${slot.classProp}_style: true = null as unknown as (${quote(slot.styleProp)} extends keyof PropsOf<typeof N.${name}> ? true : ${quote(`${name}.${slot.styleProp} missing style prop`)})`,
      ),
  )
  return `import type { JSXElementConstructor } from 'react'
import type * as W from '../src/index.ts'
import type * as N from '../src/index.native.ts'
import type * as Facts from '../src/slot-facts.native.ts'
type PropsOf<T> = T extends JSXElementConstructor<infer P> ? P : never
type ClassKeys<P> = P extends unknown ? Extract<keyof P, 'className' | \`\${string}ClassName\`> : never
type Canonical<K> = K extends \`Hozo\${infer Name}\` ? Name : K
type IsAny<T> = 0 extends (1 & T) ? true : false
type Unresolved<M> = {
  [K in keyof M & string]: K extends Capitalize<K>
    ? IsAny<M[K]> extends true ? \`\${K}: unresolved export\`
      : [PropsOf<M[K]>] extends [never] ? never
      : unknown extends PropsOf<M[K]> ? \`\${K}: unresolved props\` : never
    : never
}[keyof M & string]
type PublicSlots<M> = {
  [K in keyof M & string as [ClassKeys<PropsOf<M[K]>>] extends [never] ? never : Canonical<K>]: ClassKeys<PropsOf<M[K]>>
}
type Catalog = {
${rows.join('\n')}
}
type Delta<A,B> = {
  [K in keyof A & string]: K extends keyof B
    ? \`\${K}.\${Exclude<A[K],B[K]> & string}\`
    : \`\${K}.*\`
}[keyof A & string]
type ActualWeb = PublicSlots<typeof W>
type ActualNative = PublicSlots<typeof N>
declare const web: [Delta<ActualWeb,Catalog> | Delta<Catalog,ActualWeb>] extends [never] ? true : (Delta<ActualWeb,Catalog> | Delta<Catalog,ActualWeb>) & string
declare const native: [Delta<ActualNative,Catalog> | Delta<Catalog,ActualNative>] extends [never] ? true : (Delta<ActualNative,Catalog> | Delta<Catalog,ActualNative>) & string
export const webHasEverySlot: true = web
export const nativeHasEverySlot: true = native
declare const resolved: [Unresolved<typeof W> | Unresolved<typeof N>] extends [never] ? true : (Unresolved<typeof W> | Unresolved<typeof N>) & string
export const exportsHaveReadableTypes: true = resolved
${callbacks.join('\n')}
${styles.join('\n')}
// Negative controls: the type comparison must detect both directions,
// including a new component absent from the catalog entirely.
export const controlMissing: 'Extra.newClassName' = null as unknown as Delta<{Extra:'newClassName'}, {Extra:'className'}>
export const controlNewComponent: 'Extra.*' = null as unknown as Delta<{Extra:'className'}, {}>
export const controlSpurious: 'Extra.fakeClassName' = null as unknown as Delta<{Extra:'fakeClassName'}, {Extra:'className'}>
export const controlUnresolved: 'Extra: unresolved export' = null as unknown as Unresolved<{Extra:any}>
`
}

export function checkPublicProps(catalog = components) {
  const directory = mkdtempSync(path.join(root, 'packages/patterns/.style-slot-props-'))
  try {
    writeFileSync(path.join(directory, 'probe.ts'), publicPropsProbe(catalog))
    writeFileSync(
      path.join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          noEmit: true,
          strict: true,
          skipLibCheck: true,
          jsx: 'react-jsx',
          moduleResolution: 'bundler',
          module: 'esnext',
          target: 'esnext',
          lib: ['esnext', 'dom', 'dom.iterable'],
          allowImportingTsExtensions: true,
          types: [],
        },
        files: ['probe.ts'],
      }),
    )
    const binary = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc')
    execFileSync(process.execPath, [binary, '--project', directory, '--noErrorTruncation'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GOMAXPROCS: '1' },
    })
    return ''
  } catch (error) {
    if (!error.stdout) throw error
    return String(error.stdout)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
