import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import { loadTheme } from '@hozo/tailwind'
import { build } from 'esbuild'

const ui = fileURLToPath(new URL('../../../packages/ui/', import.meta.url))
const file = path.join(ui, 'src/bottom-sheet.tsx')

// The same compiled UI is used for geometry checks and retained before/after images.
export async function bottomSheetFixture(source = readFileSync(file, 'utf8')) {
  const theme = await loadTheme('@import "tailwindcss"; @import "./src/theme.css";', ui)
  const cache = openCandidateCache()
  cache.scanFile(file, source, 1)
  const compiled = lowerModule(source, file, file, createCompiler(theme), '')
  const bundle = await build({
    stdin: {
      contents: `import React,{useState} from 'react';
        import {createRoot} from 'react-dom/client';
        import {flushSync} from 'react-dom';
        import {BottomSheet} from ${JSON.stringify(file)};
        function Fixture({long=false, multiple=true}) {
          const [open,setOpen]=useState(false);
          return <><h1>Browse the collection</h1><button onClick={()=>setOpen(true)}>Filters</button>
            <BottomSheet open={open} onClose={()=>setOpen(false)} accessibilityLabel="Filters"
              detents={multiple?[.5,1]:[1]}>
              <h2 style={{margin:0}}>Filters</h2>
              <p style={{margin:0}}>Narrow down the collection. Drag the handle to change the sheet height.</p>
              {long && <div style={{minHeight:1600}}>More filter options</div>}
              <label>Search <input aria-label="Search" /></label>
              <div><button onClick={()=>setOpen(false)}>Apply</button> <button onClick={()=>setOpen(false)}>Cancel</button></div>
            </BottomSheet></>;
        }
        const root=createRoot(document.querySelector('#root'));
        window.mountSheet=(props={})=>flushSync(()=>root.render(<Fixture key={JSON.stringify(props)} {...props}/>));
        mountSheet();`,
      loader: 'tsx',
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    plugins: [
      {
        name: 'compiled-bottom-sheet',
        setup(builder) {
          builder.onLoad({ filter: /[/\\]ui[/\\]src[/\\]bottom-sheet\.tsx$/ }, () => ({
            // This wrapper has no host to lower; its class props reach the pattern.
            contents: compiled?.code ?? source,
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
  return {
    script: bundle.outputFiles[0].text,
    css: `${compiled?.css ?? ''}\n${cache.renderCss(theme)}`,
  }
}

export async function mountBottomSheet(
  page,
  fixture,
  { dark = false, reducedMotion = 'reduce' } = {},
) {
  await page.goto('about:blank')
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light', reducedMotion })
  await page.setContent(`<html><style>${fixture.css}
    *{box-sizing:border-box} body{margin:0;padding:32px;font:16px/1.5 system-ui;background:${dark ? '#0f172a' : '#f1f5f9'};color:${dark ? '#f1f5f9' : '#0f172a'}}
    button,input{font:inherit} button{padding:6px 12px} [role=dialog] button[aria-label=Resize]{padding:0;border:0;background:transparent;color:inherit}
    </style><div id="root"></div></html>`)
  await page.addScriptTag({ content: fixture.script })
}
