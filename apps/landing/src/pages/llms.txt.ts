// A plain-text map of Hozo for language models, in the llms.txt format
// (https://llmstxt.org): what the project is, where the documentation lives,
// and one line per published package.
//
// The package lines are each package's own `description`, the field npm
// publishes and `scripts/package-metadata.mjs` checks, so this cannot say
// something about a package that its `package.json` does not.

import type { APIRoute } from 'astro'

interface Manifest {
  name: string
  description?: string
  private?: boolean
}

const manifests = Object.values(
  import.meta.glob<Manifest>('../../../../packages/*/package.json', {
    eager: true,
    import: 'default',
  }),
)
  .filter((manifest) => !manifest.private)
  .sort((a, b) => a.name.localeCompare(b.name))

const REPOSITORY = 'https://github.com/iray-tno/hozo'

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const page = (path: string) => new URL(`${base}/${path}`, site).href
  const packages = manifests
    .map(
      (manifest) =>
        `- [${manifest.name}](https://www.npmjs.com/package/${manifest.name}): ${manifest.description ?? ''}`,
    )
    .join('\n')

  const body = `# Hozo

> A Rust-powered universal UI compiler and accessibility-first layer for React Native. It compiles React Native and Hozo components to semantic HTML and CSS on the Web, and to React Native primitives with precomputed StyleSheets on device, reporting accessibility problems at build time.

Applications install \`@hozo/core\` and one build integration (\`@hozo/vite\`, \`@hozo/next\` or \`@hozo/metro\`). Existing React Native source compiles as written; \`className\` is Tailwind.

## Docs

- [README](${REPOSITORY}#readme): getting started, how styles are resolved, accessibility, architecture
- [Primitives reference](${REPOSITORY}/blob/main/docs/primitives.md): every primitive and what it compiles to on the Web and on React Native, generated from the compiler
- [Conformance matrix](${page('conformance/')}): measured coverage against Tailwind CSS, React Native, StyleX and WAI-ARIA
- [REPL](${page('repl/')}): compile TSX to Web and React Native output in the browser

## Packages

${packages}

## Optional

- [Decisions](${REPOSITORY}/tree/main/docs/decisions): settled design questions, with the evidence behind them
- [Design proposal](${REPOSITORY}/blob/main/docs/proposal.md): the original design document, in Japanese
`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
