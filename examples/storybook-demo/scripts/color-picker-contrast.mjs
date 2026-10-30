import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import { loadTheme } from '@hozo/tailwind'
import { build } from 'esbuild'

const ui = fileURLToPath(new URL('../../../packages/ui/', import.meta.url))
const file = path.join(ui, 'src/color-picker.tsx')

/** Also accepts the retained base source for a controlled before/after probe. */
export async function colorPickerFixture(source = readFileSync(file, 'utf8')) {
  const theme = await loadTheme('@import "tailwindcss"; @import "./src/theme.css";', ui)
  const compiler = createCompiler(theme)
  const cache = openCandidateCache()
  cache.scanFile(file, source, 1)
  const compiled = lowerModule(source, file, file, compiler, '')
  if (!compiled) throw new Error('ColorPicker UI did not compile')
  const fixture = await build({
    stdin: {
      contents: `import {createElement} from 'react';
        import {createRoot} from 'react-dom/client';
        import {flushSync} from 'react-dom';
        import {ColorPicker} from ${JSON.stringify(file)};
        const root = createRoot(document.getElementById('root'));
        window.colorChanges = [];
        window.renderColorPicker = (props) => flushSync(() => root.render(createElement(ColorPicker, {
          accessibilityLabel: 'Marker contrast', alpha:true,
          onChange:(value) => window.colorChanges.push(value), ...props
        })));`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    plugins: [
      {
        name: 'compiled-color-picker',
        setup(builder) {
          builder.onLoad({ filter: /[/\\]ui[/\\]src[/\\]color-picker\.tsx$/ }, () => ({
            contents: compiled.code,
            loader: 'tsx',
            resolveDir: path.dirname(file),
          }))
        },
      },
    ],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  return { script: fixture.outputFiles[0].text, css: `${compiled.css}\n${cache.renderCss(theme)}` }
}

export async function mountColorPicker(page, fixture, dark = false, dir = 'ltr') {
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' })
  await page.setContent(`<html dir="${dir}"><style>${fixture.css}
    *{box-sizing:border-box} body{margin:32px;background:${dark ? '#0f172a' : '#fff'}}
    #root{width:280px}</style><div id="root"></div></html>`)
  await page.addScriptTag({ content: fixture.script })
}

export async function colorPickerContrast(page) {
  const markers = await page.locator('[role="slider"]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node)
      const box = node.getBoundingClientRect()
      return {
        name: node.getAttribute('aria-label'),
        border:
          style.borderTopStyle !== 'none' && Number.parseFloat(style.borderTopWidth) > 0
            ? style.borderTopColor
            : null,
        outline:
          style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
            ? style.outlineColor
            : null,
        x: Math.floor(box.x + box.width / 2),
        y: Math.floor(box.y + box.height / 2),
      }
    }),
  )
  await page.locator('[role="slider"]').evaluateAll((nodes) => {
    for (const node of nodes) node.style.visibility = 'hidden'
  })
  let png
  try {
    png = await page.screenshot()
  } finally {
    await page.locator('[role="slider"]').evaluateAll((nodes) => {
      for (const node of nodes) node.style.visibility = ''
    })
  }
  return page.evaluate(
    async ({ markers, png }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${png}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      const luminance = (rgb) =>
        rgb
          .map((v) => {
            const channel = v / 255
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
          })
          .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const ink = document.createElement('canvas')
      ink.width = ink.height = 1
      const paint = ink.getContext('2d')
      const rgb = (text) => {
        paint.clearRect(0, 0, 1, 1)
        paint.fillStyle = text
        paint.fillRect(0, 0, 1, 1)
        return [...paint.getImageData(0, 0, 1, 1).data].slice(0, 3)
      }
      return markers.map((marker) => {
        const backdrop = [...context.getImageData(marker.x, marker.y, 1, 1).data].slice(0, 3)
        const background = luminance(backdrop)
        return {
          ...marker,
          backdrop,
          contrast: Math.max(
            ...[marker.border, marker.outline]
              .filter(Boolean)
              .map((color) => ratio(luminance(rgb(color)), background)),
          ),
        }
      })
    },
    { markers, png: png.toString('base64') },
  )
}
