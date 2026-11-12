// `hozo square`'s setup checks on how the project wires Hozo in: the
// bundler adapter, the CSS entry, Metro's saved state, and which files the
// candidate scan read.
//
// Like the package checks, these read files and load nothing. A config file
// is read as text, not evaluated: evaluating `vite.config.ts` would need its
// plugins, and a broken install is when `square` is most needed. Text can
// miss a config that builds its options at runtime, so a check that cannot
// see what it needs says so and is skipped rather than guessing.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs']

/**
 * Each bundler Hozo integrates with: the config files it reads, the adapter
 * package, and the call that has to appear in it. Astro and TanStack Start
 * run Vite, so they take `@hozo/vite`.
 */
const BUNDLERS = [
  { name: 'Vite', base: 'vite.config', adapter: '@hozo/vite', call: 'hozo' },
  { name: 'Astro', base: 'astro.config', adapter: '@hozo/vite', call: 'hozo' },
  { name: 'Next.js', base: 'next.config', adapter: '@hozo/next', call: 'withHozo' },
  { name: 'Metro', base: 'metro.config', adapter: '@hozo/metro', call: 'withHozo' },
  { name: 'Storybook', base: '.storybook/main', adapter: '@hozo/storybook' },
]

/**
 * The stylesheets Hozo looks for when no `css` is given, in its order.
 * Mirrors `DEFAULT_CSS_FILES` in `@hozo/tailwind`, which `square` does not
 * load; a test keeps the two equal.
 */
export const DEFAULT_CSS_FILES = [
  'global.css',
  'src/global.css',
  'app/global.css',
  'src/index.css',
  'src/styles.css',
  'src/app.css',
  'app/globals.css',
]

/**
 * Directories the candidate scan never reads. Mirrors `DEFAULT_EXCLUDE` in
 * `@hozo/compiler`'s project scan; a test keeps the two equal.
 */
export const SCAN_EXCLUDED_DIRECTORIES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  '.expo',
  'target',
  'temp',
  'tmp',
  'vendor',
  '.generated',
]

const SCANNABLE = new Set(['.tsx', '.jsx', '.ts', '.js', '.mts', '.mjs'])
// An import of a runtime package, whose classes the scan has to see. A
// config or script that imports only the build side (an adapter, the
// compiler, this CLI) has no classes, so it is not counted.
const IMPORTS_HOZO =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]@hozo\/(?!(?:vite|next|metro|storybook|compiler|tailwind|cli|migration-audit|test-reporter)['"/])/

const read = (file) => readFileSync(file, 'utf8')
const posix = (file) => file.split(path.sep).join('/')

/** The bundler configs present in the project, with their text. */
function configs(project) {
  const found = []
  for (const bundler of BUNDLERS)
    for (const extension of CONFIG_EXTENSIONS) {
      const file = path.join(project, `${bundler.base}.${extension}`)
      if (existsSync(file)) {
        found.push({ ...bundler, file: posix(path.relative(project, file)), text: read(file) })
        break
      }
    }
  return found
}

/** The literal `css: '...'` a config passes to Hozo, if it writes one. */
function cssOption(text) {
  return /\bcss\s*:\s*(['"`])([^'"`\n]+)\1/.exec(text)?.[2]
}

/** Whether a config imports its adapter and makes the call that installs it. */
const usesAdapter = (config) =>
  (config.text.includes(`'${config.adapter}`) || config.text.includes(`"${config.adapter}`)) &&
  (!config.call || callAt(config.text, config.call) >= 0)

/** Where `name(` is first called in `text`, or -1. */
const callAt = (text, name) => text.search(new RegExp(String.raw`(?<![\w.$])${name}\s*\(`))

export function checkAdapter(project, { names }) {
  const found = configs(project)
  const findings = []
  for (const config of found) {
    if (!usesAdapter(config)) {
      const imports =
        config.text.includes(`'${config.adapter}`) || config.text.includes(`"${config.adapter}`)
      findings.push({
        code: 'adapter-not-configured',
        severity: 'error',
        message: `${config.file} does not ${imports ? `call ${config.call}()` : `use ${config.adapter}`}, so ${config.name} builds without Hozo`,
        fix: `Add ${config.adapter} to ${config.file}; see https://iray-tno.github.io/hozo/docs/getting-started/`,
        path: config.file,
      })
      continue
    }
    if (!names.has(config.adapter))
      findings.push({
        code: 'adapter-not-installed',
        severity: 'error',
        message: `${config.file} uses ${config.adapter}, which is not in package.json`,
        fix: `Install ${config.adapter}`,
        path: config.file,
      })
    if (config.adapter === '@hozo/vite') {
      // `hozo()` has to see the original JSX, before React's plugin
      // transforms it. Its local name comes from its import.
      const react = /import\s+(\w+)\s+from\s+['"]@vitejs\/plugin-react(?:-swc)?['"]/.exec(
        config.text,
      )?.[1]
      const reactAt = react ? callAt(config.text, react) : -1
      if (reactAt >= 0 && reactAt < callAt(config.text, 'hozo'))
        findings.push({
          code: 'plugin-order',
          severity: 'error',
          message: `${config.file} lists ${react}() before hozo(); Hozo has to see the JSX before React's plugin transforms it`,
          fix: `Move hozo() before ${react}() in plugins`,
          path: config.file,
        })
    }
  }
  if (!found.length) {
    const adapters = [...names].filter((name) =>
      BUNDLERS.some((bundler) => bundler.adapter === name),
    )
    if (adapters.length)
      return {
        findings: [
          {
            code: 'adapter-not-configured',
            severity: 'error',
            message: `${adapters.join(', ')} ${adapters.length === 1 ? 'is' : 'are'} installed, but no bundler config was found to use ${adapters.length === 1 ? 'it' : 'them'}`,
            fix: `Add ${adapters[0]} to your bundler config; see https://iray-tno.github.io/hozo/docs/getting-started/`,
          },
        ],
        fatal: true,
      }
    return {
      skipped: `No bundler config found (${BUNDLERS.map((bundler) => `${bundler.base}.*`).join(', ')}); a library compiled by its consumer's build needs none`,
    }
  }
  return {
    findings,
    summary: found.map((config) => `${config.file} (${config.adapter})`).join(', '),
    // Nothing would compile with Hozo: the code half has nothing to stand on.
    fatal: !found.some(usesAdapter),
  }
}

const metroState = (project) => path.join(project, 'node_modules', '.hozo', 'metro.json')

export function checkCss(project, { names }) {
  const hozo = configs(project).filter(usesAdapter)
  if (!hozo.length) return { skipped: 'No bundler config uses Hozo, so no stylesheet is read' }
  const configured = hozo
    .filter((config) => config.adapter !== '@hozo/storybook')
    .map((config) => {
      let css = cssOption(config.text)
      // Metro saves the option it resolved; prefer it over the text.
      if (config.adapter === '@hozo/metro' && existsSync(metroState(project)))
        try {
          css = JSON.parse(read(metroState(project))).css ?? css
        } catch {}
      return { config: config.file, css }
    })
  const entries = new Map()
  for (const { config, css } of configured)
    if (css)
      entries.set(posix(path.normalize(css)), [
        ...(entries.get(posix(path.normalize(css))) ?? []),
        config,
      ])
  const findings = []
  if (entries.size === 0) {
    const discovered = DEFAULT_CSS_FILES.find((file) => existsSync(path.join(project, file)))
    if (!discovered)
      return {
        findings: [
          {
            code: 'css-not-found',
            severity: 'warning',
            message: `No css option and none of ${DEFAULT_CSS_FILES.join(', ')} exists, so classes compile against Tailwind's default theme`,
            fix: 'Pass css: \'src/theme.css\' to Hozo, with @import "tailwindcss" and your @theme in it',
          },
        ],
      }
    entries.set(discovered, [])
  }
  for (const [file, from] of entries) {
    const full = path.join(project, file)
    if (!existsSync(full)) {
      findings.push({
        code: 'css-not-found',
        severity: 'error',
        message: `${from.join(', ')} names css ${file}, which does not exist`,
        fix: `Create ${file}, or point css at your stylesheet`,
        path: file,
      })
      continue
    }
    const text = read(full)
    if (!/@import\s+(?:url\(\s*)?['"]tailwindcss(?:\/[\w./-]*)?['"]/.test(text))
      findings.push({
        code: 'css-no-tailwind',
        severity: 'error',
        message: `${file} does not @import "tailwindcss", so Hozo reads no Tailwind theme from it`,
        fix: `Add @import "tailwindcss"; at the top of ${file}`,
        path: file,
      })
    if (names.has('@hozo/ui') && !/@import\s+(?:url\(\s*)?['"]@hozo\/ui\/theme\.css['"]/.test(text))
      findings.push({
        code: 'css-no-ui-theme',
        severity: 'error',
        message: `@hozo/ui is installed, but ${file} does not import its theme, so classes such as bg-hozo-accent resolve to nothing`,
        fix: `Add @import "@hozo/ui/theme.css"; after @import "tailwindcss" in ${file}`,
        path: file,
      })
  }
  // The one stylesheet the code half compiles against, when there is one.
  const [only] = entries.size === 1 ? entries.keys() : []
  return {
    findings,
    summary: [...entries.keys()].join(', '),
    css: only && existsSync(path.join(project, only)) ? only : undefined,
  }
}

export function checkMetroState(project) {
  const metro = configs(project).find(
    (config) => config.adapter === '@hozo/metro' && usesAdapter(config),
  )
  if (!metro) return { skipped: 'No Metro config uses Hozo' }
  const state = metroState(project)
  if (!existsSync(state))
    return {
      skipped: 'Metro has not run with Hozo yet; it writes node_modules/.hozo/metro.json on start',
    }
  const findings = []
  // Metro reads its config once, on start; workers read what it saved.
  if (statSync(path.join(project, metro.file)).mtimeMs > statSync(state).mtimeMs)
    findings.push({
      code: 'metro-state-stale',
      severity: 'warning',
      message: `${metro.file} changed after Metro last started, so a running Metro still builds with the old options`,
      fix: 'Restart Metro with its cache cleared (npx expo start --clear, or npx react-native start --reset-cache)',
      path: metro.file,
    })
  return { findings, summary: 'node_modules/.hozo/metro.json' }
}

/** The project's own source files: Git's view when there is one. */
function sourceFiles(project) {
  try {
    const listed = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
      cwd: project,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 256 * 1024 * 1024,
    })
    return listed
      .split('\0')
      .filter(Boolean)
      .filter((file) => !file.split('/').some((part) => SCAN_EXCLUDED_DIRECTORIES.includes(part)))
  } catch {
    const files = []
    const walk = (directory) => {
      for (const entry of readdirSync(path.join(project, directory), { withFileTypes: true })) {
        const relative = directory ? `${directory}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          if (!SCAN_EXCLUDED_DIRECTORIES.includes(entry.name)) walk(relative)
        } else if (entry.isFile()) files.push(relative)
      }
    }
    walk('')
    return files
  }
}

export function checkScan(project) {
  const inventory = path.join(project, 'node_modules', '.hozo', 'candidates.json')
  if (!existsSync(inventory))
    return {
      skipped: 'No candidate scan yet; it is written on the first dev server start or build',
    }
  let scanned
  try {
    scanned = Object.keys(JSON.parse(read(inventory)).files ?? {})
  } catch (error) {
    return { skipped: `node_modules/.hozo/candidates.json could not be read: ${error.message}` }
  }
  const key = (file) => {
    const resolved = path.resolve(project, file)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  }
  const seen = new Set(scanned.map(key))
  const scannedAt = statSync(inventory).mtimeMs
  const findings = []
  let newer = 0
  let importing = 0
  for (const file of sourceFiles(project)) {
    if (!SCANNABLE.has(path.extname(file))) continue
    const full = path.join(project, file)
    let text
    try {
      text = read(full)
    } catch {
      continue
    }
    if (!IMPORTS_HOZO.test(text)) continue
    importing += 1
    if (seen.has(key(file))) continue
    if (statSync(full).mtimeMs > scannedAt) {
      newer += 1
      continue
    }
    findings.push({
      code: 'not-scanned',
      severity: 'error',
      message: `${file} imports @hozo/* but the candidate scan did not read it, so its classes get no CSS on the Web`,
      fix: 'Widen content.include in the Hozo options to cover it, or move it under a scanned directory',
      path: file,
    })
  }
  const summary = `${importing - findings.length - newer} of ${importing} files importing @hozo/* were in the last scan${
    newer ? `; ${newer} changed since and were not compared` : ''
  }`
  return { findings, summary }
}
