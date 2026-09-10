// The REPL's client half: load the compiler, compile on a pause, render.
//
// The module is 1.3MB (450KB gzipped) and this is the only page that
// wants it, so it is imported on the first keystroke rather than on load
// -- a visitor who reads the page and leaves pays nothing for it. See the
// `wasm` profile in the workspace `Cargo.toml` for what that number was
// traded against.
import { CodeJar } from 'codejar'
import Prism from 'prismjs'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-tsx'

interface ReplDiagnostic {
  code: string
  severity: string
  message: string
  span_start: number
  span_end: number
}

interface WebComponent {
  jsx: string
  css: string
  runtime_imports: string[]
  diagnostics: ReplDiagnostic[]
}

interface NativeComponent {
  jsx: string
  styles: string
  prelude: string[]
  runtime_imports: string[]
  native_imports: string[]
  diagnostics: ReplDiagnostic[]
}

interface Compiler {
  compileWeb: (source: string) => string
  compileNative: (source: string) => string
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '')

/**
 * Loaded once, on demand, and shared by every compile after.
 *
 * `init` fetches the `.wasm` beside the glue. The path is absolute
 * against the site's base because this page can be served from a
 * subdirectory -- GitHub Pages puts it under `/hozo/`.
 */
let compiler: Promise<Compiler> | null = null

/**
 * A dynamic import the bundler cannot see.
 *
 * Vite wraps every `import()` it finds in its preload helper and hands it
 * a `__VITE_PRELOAD__` list that only its own analysis fills in. This
 * path is built at runtime, so there is nothing to analyse -- and
 * `@vite-ignore` skips the analysis while keeping the wrapper, so the
 * placeholder survived into the bundle and the call threw a
 * `ReferenceError` before fetching anything. The page reported "the
 * compiler failed to load" and the server logged no request for it, which
 * is how it was found. `build.modulePreload: false` does not remove the
 * wrapper either; both were tried.
 *
 * The cost is that this needs `unsafe-eval` under a strict CSP. These
 * pages are static and served from GitHub Pages, which sets none.
 */
const dynamicImport = new Function('url', 'return import(url)') as (
  url: string,
) => Promise<Compiler & { default: (path: string) => Promise<unknown> }>

function load(): Promise<Compiler> {
  compiler ??= dynamicImport(`${base}/wasm/hozo_wasm.js`).then(async (module) => {
    await module.default(`${base}/wasm/hozo_wasm_bg.wasm`)
    return module
  })
  return compiler
}

const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id)
  if (!found) throw new Error(`the REPL is missing #${id}`)
  return found as T
}

const source = element<HTMLElement>('repl-source')
const status = element('repl-status')
const panes = {
  webJsx: element('repl-web-jsx'),
  webCss: element('repl-web-css'),
  nativeJsx: element('repl-native-jsx'),
  nativeStyles: element('repl-native-styles'),
}
const diagnosticList = element('repl-diagnostics')

const highlightTsx = (editor: HTMLElement) => {
  const code = editor.textContent ?? ''
  editor.innerHTML = Prism.highlight(code, Prism.languages.tsx ?? Prism.languages.javascript, 'tsx')
}

const jar = CodeJar(source, highlightTsx, {
  tab: '  ',
  spellcheck: false,
})

// Highlight initial source
highlightTsx(source)

/** `<`, `&` and the rest, since every pane writes compiled source. */
function escaped(text: string): string {
  return text.replace(
    /[&<>]/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character] as string,
  )
}

/**
 * The line and column a span starts on, counted in the source the person
 * is looking at.
 *
 * The compiler reports UTF-16 offsets, which is what a JavaScript string
 * is indexed by -- so this needs no translation, and that is the whole
 * reason `hozo_ir::Utf16Offsets` exists.
 */
function position(text: string, offset: number): string {
  const before = text.slice(0, offset)
  const line = before.split('\n').length
  const column = offset - (before.lastIndexOf('\n') + 1) + 1
  return `${line}:${column}`
}

const SEVERITY: Record<string, string> = {
  error: 'text-rose-300 border-rose-500/40 bg-rose-500/10',
  warning: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  info: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
}

function renderDiagnostics(text: string, found: ReplDiagnostic[]) {
  if (found.length === 0) {
    diagnosticList.innerHTML =
      '<p class="text-sm text-slate-500">No diagnostics. Everything here compiles.</p>'
    return
  }
  diagnosticList.innerHTML = found
    .map((diagnostic) => {
      const tone = SEVERITY[diagnostic.severity] ?? SEVERITY.info
      return `<div class="rounded-lg border ${tone} px-3 py-2">
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <code class="font-mono text-xs font-semibold">${escaped(diagnostic.code)}</code>
          <span class="font-mono text-xs text-slate-500">${position(text, diagnostic.span_start)}</span>
        </div>
        <p class="mt-1 text-sm text-slate-300">${escaped(diagnostic.message)}</p>
      </div>`
    })
    .join('')
}

/** Every component's output, one after another, with a rule between. */
const joined = (parts: string[]) => parts.filter((part) => part.trim() !== '').join('\n\n')

async function compile() {
  const text = jar.toString()
  status.textContent = 'Compiling…'
  try {
    const { compileWeb, compileNative } = await load()
    const web = JSON.parse(compileWeb(text)) as WebComponent[]
    const native = JSON.parse(compileNative(text)) as NativeComponent[]

    const webJsxCode = joined(web.map((one) => one.jsx))
    const webCssCode = joined(web.map((one) => one.css))
    const nativeJsxCode = joined(native.map((one) => [...one.prelude, one.jsx].join('\n')))
    const nativeStylesCode = joined(
      native.map((one) => (one.styles.trim() === '' ? '' : `StyleSheet.create(${one.styles})`)),
    )

    panes.webJsx.innerHTML = Prism.highlight(
      webJsxCode,
      Prism.languages.tsx ?? Prism.languages.javascript,
      'tsx',
    )
    panes.webCss.innerHTML = Prism.highlight(webCssCode, Prism.languages.css, 'css')
    panes.nativeJsx.innerHTML = Prism.highlight(
      nativeJsxCode,
      Prism.languages.tsx ?? Prism.languages.javascript,
      'tsx',
    )
    panes.nativeStyles.innerHTML = Prism.highlight(
      nativeStylesCode,
      Prism.languages.tsx ?? Prism.languages.javascript,
      'tsx',
    )

    // Both backends see the same source and mostly the same diagnostics;
    // showing each once is what a build would have told you.
    const seen = new Set<string>()
    const all = [
      ...web.flatMap((one) => one.diagnostics),
      ...native.flatMap((one) => one.diagnostics),
    ]
    renderDiagnostics(
      text,
      all.filter((diagnostic) => {
        const key = `${diagnostic.code}:${diagnostic.span_start}:${diagnostic.message}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }),
    )

    status.textContent =
      web.length === 0
        ? 'Nothing to compile: no component returned JSX.'
        : `${web.length} component${web.length === 1 ? '' : 's'}`
  } catch (error) {
    // A compiler that will not load is a different failure from source
    // that will not compile, and the page should not present them alike.
    status.textContent = 'The compiler failed to load.'
    diagnosticList.innerHTML = `<div class="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">${escaped(
      String(error),
    )}</div>`
  }
}

// On a pause rather than on every keystroke. A compile is a fifth of a
// millisecond, so this is about not repainting four panes mid-word.
let pending: ReturnType<typeof setTimeout> | undefined
jar.onUpdate(() => {
  clearTimeout(pending)
  status.textContent = 'Typing…'
  pending = setTimeout(compile, 250)
})

// The first compile is the one that fetches the module, and it happens
// because the editor starts with something in it.
void compile()
