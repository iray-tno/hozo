import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Real highlighter output for the CodeBlock performance probe (#1431). The
// probe's own fixture gives every token a different colour, so it cannot show
// what joining same-styled tokens saves; Shiki's tokens for real source can.
//
// The output is committed, not generated at build time, so the fixture stays
// the same lines while the sources it was taken from move on.
const root = fileURLToPath(new URL('../../../', import.meta.url))
const typography = createRequire(`${root}packages/typography/package.json`)
const { codeToTokens } = await import(pathToFileURL(typography.resolve('shiki')).href)
const { fromShiki } = await import(
  pathToFileURL(`${root}packages/typography/src/code/shiki.ts`).href
)

const COUNT = 1000
const sources = [
  ['crates/hozo_parser/src/scan.rs', 'rust'],
  ['packages/patterns/src/accordion.tsx', 'tsx'],
]
const lines = []
for (const [file, lang] of sources) {
  const code = readFileSync(`${root}${file}`, 'utf8').replace(/\r\n/g, '\n')
  const { tokens } = await codeToTokens(code, { lang, theme: 'github-light' })
  lines.push(...fromShiki(tokens))
}
if (lines.length < COUNT) throw new Error(`only ${lines.length} lines in the sources`)
const output = fileURLToPath(new URL('../src/code-block-highlighted.json', import.meta.url))
writeFileSync(
  output,
  `[\n${lines
    .slice(0, COUNT)
    .map((line) => JSON.stringify(line))
    .join(',\n')}\n]\n`,
)
