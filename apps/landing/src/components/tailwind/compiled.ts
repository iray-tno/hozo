import { compile, compileNative } from '@hozo/compiler'

// Build-time evidence for the /tailwind/ page. Everything the page shows as
// compiler output comes from here, run when the site is built, so the page
// cannot describe a lowering the compiler no longer does.
//
// `compile` and `compileNative` use Tailwind's default theme, which is why
// the sample sticks to the default palette.

export interface CompiledSample {
  web: { jsx: string; css: string }
  native: { jsx: string; styles: string; prelude: string[]; runtimeImports: string[] }
  diagnostics: string[]
}

export function compileSample(source: string): CompiledSample {
  const [web] = compile(source)
  const [native] = compileNative(source)
  if (!web || !native) throw new Error('the /tailwind/ sample compiled to nothing')
  return {
    // Only the component's own rules: the base layer is the same for every
    // View and would push the interesting part below the fold.
    web: { jsx: web.jsx, css: web.css.replace(/^@layer base \{[\s\S]*?\n\}\n/, '').trim() },
    native: {
      jsx: native.jsx,
      styles: native.styles,
      prelude: native.prelude,
      runtimeImports: native.runtimeImports,
    },
    diagnostics: [...new Set([...web.diagnostics, ...native.diagnostics].map((d) => d.code))],
  }
}

export type Outcome =
  | { kind: 'compiled'; runtime: string[] }
  | { kind: 'refused'; message: string }
  | { kind: 'unsupported'; message: string }

export interface VariantRow {
  variant: string
  className: string
  web: Outcome
  native: Outcome
}

/**
 * Each variant written where it can mean something: `disabled:` beside a
 * `disabled` prop, `aria-checked:` beside the state that drives it. Probing
 * them on a bare element would score a refusal the compiler is right to give.
 */
const VARIANTS: { variant: string; className: string; element: (className: string) => string }[] = [
  { variant: 'hover:', className: 'hover:bg-emerald-600', element: button },
  { variant: 'focus-visible:', className: 'focus-visible:border-emerald-400', element: button },
  { variant: 'active:', className: 'active:bg-emerald-800', element: button },
  {
    variant: 'disabled:',
    className: 'disabled:opacity-50',
    element: (c) => `<Button onPress={on} disabled={off} className="${c}"><Text>x</Text></Button>`,
  },
  {
    variant: 'aria-checked:',
    className: 'aria-checked:bg-emerald-700',
    element: (c) =>
      `<Button onPress={on} accessibilityRole="checkbox" accessibilityState={{ checked: off }} className="${c}"><Text>x</Text></Button>`,
  },
  { variant: 'dark:', className: 'dark:bg-stone-800', element: button },
  { variant: 'md:', className: 'md:px-6', element: button },
  { variant: 'motion-reduce:', className: 'motion-reduce:opacity-100', element: button },
  { variant: 'print:', className: 'print:hidden', element: button },
  { variant: 'before:', className: 'before:content-none', element: button },
  { variant: 'peer-checked:', className: 'peer-checked:bg-emerald-700', element: button },
]

function button(className: string) {
  return `<Button onPress={on} className="${className}"><Text>x</Text></Button>`
}

function outcome(
  diagnostics: { severity: string; code: string; message: string }[],
  runtime: string[],
): Outcome {
  const error = diagnostics.find((d) => d.severity === 'error')
  if (error) return { kind: 'refused', message: error.message }
  const unsupported = diagnostics.find((d) => d.code === 'TAILWIND_VARIANT_NOT_SUPPORTED')
  if (unsupported) return { kind: 'unsupported', message: unsupported.message }
  return { kind: 'compiled', runtime }
}

export function probeVariants(): VariantRow[] {
  return VARIANTS.map(({ variant, className, element }) => {
    const source = `import { Button, Text } from '@hozo/core'
export function C({ on, off }) {
  return ${element(className)}
}
`
    const [web] = compile(source)
    const [native] = compileNative(source)
    if (!web || !native) throw new Error(`${className} compiled to nothing`)
    return {
      variant,
      className,
      web: outcome(web.diagnostics, web.runtimeImports),
      native: outcome(native.diagnostics, native.runtimeImports),
    }
  })
}

/**
 * The curated utilities the conformance report does not count as covered on
 * Native, each with what the compiler says about it. The snapshot only holds
 * the counts, so the page checks the names against them at build time.
 */
const NATIVE_GAPS = [
  { className: 'grid-cols-3', element: 'View' },
  { className: 'transition', element: 'View' },
  { className: 'duration-200', element: 'View' },
  { className: 'ease-in-out', element: 'View' },
  { className: 'whitespace-normal', element: 'Text' },
] as const

export interface NativeGap {
  className: string
  verdict: 'refused' | 'no-op'
  message: string
}

export function nativeGaps(expected: { refused: number; noOp: number }): NativeGap[] {
  const rows = NATIVE_GAPS.map(({ className, element }): NativeGap => {
    const [native] = compileNative(
      `import { ${element} } from '@hozo/core'\nexport function C() {\n  return <${element} className="${className}">x</${element}>\n}\n`,
    )
    const error = native?.diagnostics.find((d) => d.severity === 'error')
    return error
      ? { className, verdict: 'refused', message: error.message }
      : {
          className,
          verdict: 'no-op',
          message: "React Native's Text wraps by default, so this asks for what it already does.",
        }
  })
  const refused = rows.filter((row) => row.verdict === 'refused').length
  if (refused !== expected.refused || rows.length - refused !== expected.noOp) {
    throw new Error(
      `/tailwind/ lists ${refused} refused and ${rows.length - refused} no-op utilities, the snapshot counts ${expected.refused} and ${expected.noOp}: update NATIVE_GAPS`,
    )
  }
  return rows
}
