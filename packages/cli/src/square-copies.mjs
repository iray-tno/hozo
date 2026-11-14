// `hozo square`'s check of `hozo add` copies (RFC 012 §6, §6.1): which
// copies `@hozo/ui` has moved on from, and whether every token a component
// names is one the project's theme defines.
//
// Reads files only, like the rest of the setup half.

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { copies, destination, publishedNames, upstream } from './add.mjs'
import { sourceFiles } from './square-config.mjs'

const posix = (file) => file.split(path.sep).join('/')

/** Utilities whose value is a theme token: `bg-hozo-accent` → `hozo-accent`. */
const TOKEN_UTILITY =
  /^(?:bg|text|border(?:-[xytrblse])?|rounded(?:-(?:[trblse]|tl|tr|bl|br|ss|se|es|ee))?|outline|ring|ring-offset|divide|fill|stroke|accent|caret|decoration|placeholder|from|via|to|shadow|inset-shadow|drop-shadow)-(hozo-[a-z0-9]+(?:-[a-z0-9]+)*)$/

/** Each token a source's class strings name, with one class that names it. */
export function namedTokens(source) {
  const tokens = new Map()
  // Comments first: an apostrophe in one (`the primitive's`) would pair
  // with the next quote and hide the class strings between.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
  for (const [, , literal] of code.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
    if (!literal.includes('hozo-')) continue
    for (const raw of literal.split(/\s+/)) {
      // Variants and modifiers do not change which token is named.
      const base = raw
        .replace(/^.*:/, '')
        .replace(/^[!-]+/, '')
        .replace(/!$/, '')
        .replace(/\/[\w.[\]%-]+$/, '')
      const match = TOKEN_UTILITY.exec(base)
      if (match && !tokens.has(match[1])) tokens.set(match[1], raw)
    }
  }
  return tokens
}

/**
 * The stylesheet `entry` and what it imports, relative or from a package,
 * as one text. Tailwind's own sheets are left out: they define no `hozo-`
 * token. A sheet that cannot be found is named in `missing`.
 */
function themeText(project, entry) {
  const seen = new Set()
  const missing = []
  const texts = []
  const visit = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    // Without comments: `theme.css` shows its own `@import` in one.
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    texts.push(text)
    for (const [, specifier] of text.matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g)) {
      if (specifier === 'tailwindcss' || specifier.startsWith('tailwindcss/')) continue
      let target
      if (specifier.startsWith('.') || specifier.startsWith('/'))
        target = path.resolve(path.dirname(file), specifier)
      else
        try {
          target = createRequire(path.join(project, 'package.json')).resolve(specifier)
        } catch {
          target = undefined
        }
      if (target && existsSync(target)) visit(target)
      else missing.push(specifier)
    }
  }
  visit(path.join(project, entry))
  return { text: texts.join('\n'), missing }
}

/** Tokens a stylesheet defines: `--color-hozo-accent: …` → `hozo-accent`. */
function definedTokens(css) {
  return new Set(
    [...css.matchAll(/--[a-z0-9-]*?(hozo-[a-z0-9]+(?:-[a-z0-9]+)*)\s*:/g)].map((m) => m[1]),
  )
}

/**
 * The `@hozo/ui` files the project imports components from: by the names it
 * imports from `@hozo/ui`, mapped to their files through its entry.
 */
function importedUiFiles(project, ui) {
  const published = publishedNames(ui)
  const files = new Set()
  for (const file of sourceFiles(project)) {
    if (!/\.(?:[cm]?[jt]sx?)$/.test(file)) continue
    let source
    try {
      source = readFileSync(path.join(project, file), 'utf8')
    } catch {
      continue
    }
    if (!source.includes('@hozo/ui')) continue
    for (const match of source.matchAll(
      /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@hozo\/ui['"]/g,
    ))
      for (const part of match[1].split(',')) {
        const name = part
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
        const target = published.get(name)
        if (target) files.add(target.file)
      }
  }
  return [...files].sort()
}

export function checkCopies(project, graph) {
  if (!graph.names.has('@hozo/ui')) return { skipped: '@hozo/ui is not installed' }
  let ui
  let dest
  try {
    ui = upstream(project)
    dest = destination(project)
  } catch (error) {
    return {
      findings: [
        {
          code: error.code === 'config-conflict' ? 'add-config-conflict' : 'add-config-invalid',
          severity: 'error',
          message: error.message,
          fix: 'Keep the destination in one of package.json ("hozo": { "components" }) or hozo.json',
        },
      ],
    }
  }
  const findings = []
  const found = copies(project, dest.dir)
  for (const copy of found.values())
    if (copy.version !== ui.version) {
      const name = path.basename(copy.file).replace(/\.[^.]+$/, '')
      findings.push({
        code: 'copy-upstream-newer',
        severity: 'info',
        message: `${copy.file} was copied from @hozo/ui@${copy.version}; ${ui.version} is installed`,
        fix: `See what changed with hozo add --diff ${name}; take it with hozo add --update ${name} --write`,
        path: copy.file,
      })
    }

  // Every token a component names, copied or installed, against the theme
  // the stylesheet resolves (RFC 012 §6.1). One that is not there compiles
  // to nothing, with no file in the project changed.
  if (!graph.css)
    return {
      findings,
      summary: `${found.size} cop${found.size === 1 ? 'y' : 'ies'} in ${dest.dir}; tokens not checked, since no single stylesheet was found`,
    }
  const theme = themeText(project, graph.css)
  const defined = definedTokens(theme.text)
  const sources = [
    ...[...found.values()].map((copy) => ({
      file: copy.file,
      text: readFileSync(path.join(project, copy.file), 'utf8'),
    })),
    ...importedUiFiles(project, ui).map((file) => ({
      file: posix(path.relative(project, path.join(ui.root, 'src', file))),
      text: readFileSync(path.join(ui.root, 'src', file), 'utf8'),
    })),
  ]
  let checked = 0
  for (const { file, text } of sources) {
    const tokens = namedTokens(text)
    checked += tokens.size
    const undefinedTokens = [...tokens].filter(([token]) => !defined.has(token))
    if (undefinedTokens.length === 0) continue
    findings.push({
      code: 'theme-token-undefined',
      severity: 'error',
      message: `${file} names ${undefinedTokens.map(([token, cls]) => `${token} (${cls})`).join(', ')}, which ${graph.css} does not define${theme.missing.length ? ` (it imports ${theme.missing.join(', ')}, which could not be found)` : ''}; those classes compile to nothing`,
      fix: `Define the token${undefinedTokens.length === 1 ? '' : 's'} in your @theme, or bring the component up to date with hozo add --diff`,
      path: file,
    })
  }
  return {
    findings,
    summary: `${found.size} cop${found.size === 1 ? 'y' : 'ies'} in ${dest.dir}; ${checked} token${checked === 1 ? '' : 's'} named in ${sources.length} component file${sources.length === 1 ? '' : 's'}, checked against ${graph.css}`,
  }
}
