import { compile, compileNative } from '@hozo/compiler'

// Build-time evidence for the /stylex/ page: each sample is compiled through
// both backends when the site is built, so the page shows what the compiler
// does today rather than what it was once described as doing.
//
// The samples are compiled, never run. The site has no StyleX transform, and
// `stylex.create` throws at runtime without one.

export interface StylexSample {
  id: string
  title: string
  summary: string
  source: string
  web: string
  native: string
  diagnostics: { platform: string; severity: string; code: string; message: string }[]
}

const SAMPLES: { id: string; title: string; summary: string; body: string }[] = [
  {
    id: 'tailwind',
    title: 'Beside Tailwind',
    summary:
      'A className and a StyleX spread on one element become one class on the Web and one style on Native. The conditional argument keeps its guard.',
    body: `const styles = stylex.create({
  root: { padding: 16, backgroundColor: '#2563eb' },
  active: { opacity: 0.7 },
})

export function Card({ active }) {
  return <View className="rounded-xl" {...stylex.props(styles.root, active && styles.active)} />
}`,
  },
  {
    id: 'media',
    title: 'Media query',
    summary:
      'A media condition is a media query on the Web and a width hook on Native, which re-renders only when the threshold is crossed.',
    body: `const styles = stylex.create({
  root: { padding: { default: 8, '@media (min-width: 768px)': 24 } },
})

export function Card() {
  return <View {...stylex.props(styles.root)} />
}`,
  },
  {
    id: 'hover',
    title: ':hover',
    summary:
      "On the Web, :hover behind (hover: hover), so a touch screen's tap does not stick. On Native, the hovered state of the pressable.",
    body: `const styles = stylex.create({
  button: { backgroundColor: { default: '#2563eb', ':hover': '#1d4ed8' } },
})

export function Save({ onPress }) {
  return (
    <Button onPress={onPress} {...stylex.props(styles.button)}>
      <Text>Save</Text>
    </Button>
  )
}`,
  },
  {
    id: 'first',
    title: 'firstThatWorks',
    summary:
      'The Web gets every candidate in the order the official compiler writes them. Native takes the first one it can represent: sticky is not one, so relative.',
    body: `const styles = stylex.create({
  header: { position: stylex.firstThatWorks('sticky', 'relative'), top: 0 },
})

export function Header() {
  return <View {...stylex.props(styles.header)} />
}`,
  },
  {
    id: 'web-only',
    title: 'Web-only property',
    summary:
      'Native has no scroll snapping. The rest of the rule still lowers, and the build names the one declaration it cannot carry.',
    body: `const styles = stylex.create({
  strip: { flexDirection: 'row', scrollSnapType: 'x mandatory' },
})

export function Strip() {
  return <View {...stylex.props(styles.strip)} />
}`,
  },
  {
    id: 'dynamic',
    title: 'Left to StyleX',
    summary:
      'A style with a runtime argument is not lowered. Hozo says so and leaves the call for the official StyleX transform, which runs after it.',
    body: `const styles = stylex.create({
  bar: (width) => ({ width }),
})

export function Bar({ width }) {
  return <View {...stylex.props(styles.bar(width))} />
}`,
  },
]

const HEADER = `import * as stylex from '@stylexjs/stylex'
import { Button, Text, View } from '@hozo/core'
`

export function compileStylexSamples(): StylexSample[] {
  return SAMPLES.map(({ id, title, summary, body }) => {
    const source = `${HEADER}\n${body}\n`
    const [web] = compile(source)
    const [native] = compileNative(source)
    if (!web || !native) throw new Error(`the /stylex/ sample "${id}" compiled to nothing`)
    // The base layer is the same for every View; leave it out.
    const css = web.css.replace(/^@layer base \{[\s\S]*?\n\}\n/, '').trim()
    // One entry per distinct diagnostic, saying which backend raised it.
    const byKey = new Map<string, StylexSample['diagnostics'][number]>()
    for (const [platform, list] of [
      ['Web', web.diagnostics],
      ['Native', native.diagnostics],
    ] as const) {
      for (const { severity, code, message } of list) {
        const key = `${code}:${message}`
        const seen = byKey.get(key)
        if (seen) seen.platform = 'Web and Native'
        else byKey.set(key, { platform, severity, code, message })
      }
    }
    const diagnostics = [...byKey.values()]
    return {
      id,
      title,
      summary,
      source: body,
      web: css ? `${web.jsx}\n\n${css}` : web.jsx,
      native: [
        ...native.prelude,
        ...(native.prelude.length ? [''] : []),
        `return ${native.jsx}`,
        '',
        '// hozoStyles',
        native.styles,
      ].join('\n'),
      diagnostics,
    }
  })
}
