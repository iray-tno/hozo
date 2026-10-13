// Shared by the CI browser probe and the browser-free fixture sanity check.
// Use the actual component and Tailwind, not a hand-built span/button fixture.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { compile } from 'tailwindcss'

export async function chipAncestorFixture() {
  const filename = (relative) => fileURLToPath(new URL(`../../../${relative}`, import.meta.url))
  const bundled = await build({
    stdin: {
      contents: `export { HozoChip } from ${JSON.stringify(filename('packages/patterns/src/chip.tsx'))}`,
      resolveDir: filename(''),
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    plugins: [
      {
        name: 'actual-i18n',
        setup(builder) {
          builder.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
            path: filename('packages/behaviors/src/i18n.ts'),
          }))
        },
      },
    ],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  )
  const classes =
    'inline-flex gap-4 p-4 hover:bg-[#123456] active:opacity-50 focus:opacity-25 focus-visible:outline-2'
  const css = (await compile('@theme { --spacing: 0.25rem; } @tailwind utilities;')).build(
    classes.split(' '),
  )
  const html = renderToStaticMarkup(
    createElement(
      module.exports.HozoChip,
      {
        defaultSelected: false,
        onRemove: () => {},
        className: classes,
        removeClassName: 'focus-visible:outline-2',
      },
      'Updates',
    ),
  )
  return { html, css }
}
