import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import { createCompiler } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'

const SOURCE_EXTENSION = '.tsx'
const SAMPLE_LIMIT = 12
const DOM_STYLE_ARRAY =
  /<(?:a|article|aside|button|div|fieldset|footer|h[1-6]|header|hr|img|input|label|legend|li|main|meter|nav|ol|p|progress|section|select|span|textarea|ul)\b[^>]*?\bstyle=\{\[/g

function usage(message) {
  if (message) console.error(message)
  console.error(`Usage:
  hozo-migration-audit --root <checkout> [options]

Options:
  --source <directory>       Source directory relative to the checkout (default: src)
  --name <name>              Human-readable corpus name
  --repository <url>         Canonical repository URL recorded in the report
  --expected-commit <sha>    Fail unless the checkout is at this commit
  --reproduce-command <cmd>  Command recorded in the Markdown report
  --output <path>            Write the report to this path instead of stdout
  --format json|markdown     Output format (default: inferred from --output, otherwise json)`)
  process.exit(1)
}

function parseArgs(argv) {
  const options = { source: 'src' }
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === '--') continue
    // `npx @hozo/migration-audit .` is the first thing anyone types, and it
    // failed with `Missing value for .` -- the `.` was read as a flag waiting
    // for its value (#457). A bare token is the checkout.
    if (!key?.startsWith('--')) {
      if (options.root) usage(`Unexpected argument: ${key}`)
      options.root = key
      continue
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) usage(`Missing value for ${key}`)
    index += 1
    if (key === '--root') options.root = value
    else if (key === '--source') options.source = value
    else if (key === '--name') options.name = value
    else if (key === '--repository') options.repository = value
    else if (key === '--expected-commit') options.expectedCommit = value
    else if (key === '--output') options.output = value
    else if (key === '--reproduce-command') options.reproduceCommand = value
    else if (key === '--format' && (value === 'json' || value === 'markdown'))
      options.format = value
    else usage(`Unknown option: ${key}`)
  }
  if (!options.root) usage('--root is required')
  options.format ??= options.output?.endsWith('.md') ? 'markdown' : 'json'
  return options
}

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(absolute))
    else if (entry.isFile() && path.extname(entry.name) === SOURCE_EXTENSION) files.push(absolute)
  }
  return files.sort()
}

function platformFor(file) {
  if (file.endsWith('.web.tsx')) return 'web'
  if (/\.(?:native|ios|android)\.tsx$/.test(file)) return 'native'
  return 'shared'
}

function increment(record, key, amount = 1) {
  record[key] = (record[key] ?? 0) + amount
}

function pushSample(samples, key, value) {
  const values = (samples[key] ??= [])
  if (values.length < SAMPLE_LIMIT && !values.includes(value)) values.push(value)
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function git(checkout, args) {
  return execFileSync('git', ['-C', checkout, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function optionalGit(checkout, args) {
  try {
    return git(checkout, args)
  } catch {
    return undefined
  }
}

function directReactNativeJsxBindings(jsxBindings, imports) {
  const used = new Set(jsxBindings)
  return imports.filter((name) => used.has(name))
}

function diagnosticsFor(components, backend, file, report) {
  const seenInFile = new Set()
  for (const component of components) {
    for (const diagnostic of component.diagnostics) {
      const key = `${backend}:${diagnostic.code}:${diagnostic.spanStart}:${diagnostic.spanEnd}`
      if (seenInFile.has(key)) continue
      seenInFile.add(key)
      increment(report.diagnostics.byCode, diagnostic.code)
      increment(report.diagnostics.bySeverity, diagnostic.severity)
      pushSample(report.samples, `diagnostic:${diagnostic.code}`, file)
      if (diagnostic.severity === 'error') report._filesWithErrors.add(file)
      else report._filesWithWarnings.add(file)
    }
  }
}

function measure(options) {
  const root = path.resolve(options.root)
  const sourceRoot = path.resolve(root, options.source)
  const commit = optionalGit(root, ['rev-parse', 'HEAD']) ?? 'unknown'
  if (options.expectedCommit && !commit.startsWith(options.expectedCommit)) {
    throw new Error(`Expected corpus commit ${options.expectedCommit}, found ${commit}`)
  }

  const repository =
    options.repository ?? optionalGit(root, ['remote', 'get-url', 'origin']) ?? root
  const compiler = createCompiler()
  const files = walk(sourceRoot)
  const started = performance.now()
  const report = {
    schemaVersion: 1,
    corpus: {
      name: options.name ?? path.basename(root),
      repository,
      commit,
      sourceDirectory: options.source,
      reproduceCommand: options.reproduceCommand,
    },
    scope: {
      tsxFiles: files.length,
      sourceBytes: 0,
      platformFiles: { shared: 0, web: 0, native: 0 },
    },
    authoredSignals: {
      filesImportingReactNative: 0,
      filesWithDirectReactNativeJsx: 0,
      directReactNativeJsxBindings: 0,
      filesWithAliasedDirectReactNativeJsx: 0,
      aliasedDirectReactNativeJsxBindings: 0,
      filesWithForeignPrimitiveNames: 0,
      filesWithClassName: 0,
      filesWithBareFlexClassName: 0,
      filesWithStyleProp: 0,
      filesWithStyleSheetCreate: 0,
      filesUsingAlfAtoms: 0,
    },
    lowering: {
      filesLowered: 0,
      filesLoweredForWeb: 0,
      filesLoweredForNative: 0,
      webComponents: 0,
      nativeComponents: 0,
      directReactNativeJsxPassedThroughOnWeb: 0,
      filesWithDirectReactNativeJsxResidueOnWeb: 0,
      directReactNativeJsxBindingsResidueOnWeb: 0,
      sharedBackendShapeMismatches: 0,
      parseOrCompileFailures: 0,
    },
    diagnostics: {
      filesWithErrors: 0,
      filesWithWarnings: 0,
      bySeverity: {},
      byCode: {},
    },
    review: {
      confirmedWrongOutputFiles: 0,
      invalidDomStyleArrayOccurrences: 0,
      note: 'A lowered DOM element with style={[...]} is confirmed wrong output: React DOM requires one style object. Other suspicious samples still require source/output review.',
    },
    reactNativeImports: {},
    reactNativeJsxResidueImports: {},
    samples: {},
    durationMs: 0,
    _filesWithErrors: new Set(),
    _filesWithWarnings: new Set(),
    _compileFailures: new Set(),
    _confirmedWrongOutputFiles: new Set(),
  }

  for (const absolute of files) {
    const file = relative(root, absolute)
    const source = readFileSync(absolute, 'utf8')
    const platform = platformFor(absolute)
    report.scope.sourceBytes += Buffer.byteLength(source)
    increment(report.scope.platformFiles, platform)
    if (/\bclassName\s*=/.test(source)) report.authoredSignals.filesWithClassName += 1
    // `flex` on its own: a row in React DOM, a column once lowered for
    // Native. `FLEX_DIRECTION_UNSAID` catches these at compile time (#398),
    // but an audit meant to size a migration before starting one is where the
    // number belongs -- it is the first mechanical edit a React DOM app has
    // to make, and it is countable without running the compiler (#457).
    // `flex-col`, `flex-1` and the rest say what they mean and are left out.
    if (/\bclassName\s*=\s*(?:"|'|\{`)[^"'`]*\bflex(?![-\w])/.test(source)) {
      report.authoredSignals.filesWithBareFlexClassName += 1
    }
    if (/\bstyle\s*=/.test(source)) report.authoredSignals.filesWithStyleProp += 1
    if (/\bStyleSheet\s*\.\s*create\s*\(/.test(source)) {
      report.authoredSignals.filesWithStyleSheetCreate += 1
    }
    if (/\batoms(?:\.|\[)/.test(source)) report.authoredSignals.filesUsingAlfAtoms += 1

    let nativeModule
    let rnImports = []
    try {
      nativeModule = compiler.compileNativeModule(source)
      rnImports = nativeModule.imports.filter((item) => item.source === 'react-native')
      if (rnImports.length > 0) report.authoredSignals.filesImportingReactNative += 1
      for (const item of rnImports) increment(report.reactNativeImports, item.imported)
      if (nativeModule.foreignPrimitives.length > 0) {
        report.authoredSignals.filesWithForeignPrimitiveNames += 1
        pushSample(report.samples, 'foreignPrimitiveNames', file)
      }
    } catch (error) {
      report._compileFailures.add(file)
      pushSample(
        report.samples,
        'parseOrCompileFailures',
        `${file}: ${String(error).split('\n')[0]}`,
      )
    }

    const directBindings = directReactNativeJsxBindings(
      nativeModule?.jsxBindings ?? [],
      rnImports.map((item) => item.local),
    )
    if (directBindings.length > 0) {
      report.authoredSignals.filesWithDirectReactNativeJsx += 1
      report.authoredSignals.directReactNativeJsxBindings += directBindings.length
      const aliases = rnImports.filter(
        (item) => directBindings.includes(item.local) && item.imported !== item.local,
      )
      if (aliases.length > 0) {
        report.authoredSignals.filesWithAliasedDirectReactNativeJsx += 1
        report.authoredSignals.aliasedDirectReactNativeJsxBindings += aliases.length
      }
    }

    let webComponents = []
    let loweredWebCode = source
    if (platform !== 'native') {
      try {
        // With rewriting on: the audit asks how far Hozo can take an app off
        // React Native Web, which is what an app that opted in would get.
        webComponents = compiler.compile(source, undefined, { rehomeReactNative: true })
        loweredWebCode =
          lowerModule(source, absolute, absolute, compiler, root, undefined, {
            unloweredReactNativeJsx: 'warn',
          })?.code ?? source
        if (webComponents.length > 0) report.lowering.filesLoweredForWeb += 1
        report.lowering.webComponents += webComponents.length
        diagnosticsFor(webComponents, 'web', file, report)
        const invalidStyleArrays = loweredWebCode.match(DOM_STYLE_ARRAY)?.length ?? 0
        if (invalidStyleArrays > 0) {
          report._confirmedWrongOutputFiles.add(file)
          report.review.invalidDomStyleArrayOccurrences += invalidStyleArrays
          pushSample(report.samples, 'invalidDomStyleArrays', `${file}: ${invalidStyleArrays}`)
        }
      } catch (error) {
        report._compileFailures.add(file)
        pushSample(
          report.samples,
          'parseOrCompileFailures',
          `${file} [web]: ${String(error).split('\n')[0]}`,
        )
      }
    }

    const nativeComponents = platform === 'web' ? [] : (nativeModule?.components ?? [])
    if (nativeComponents.length > 0) report.lowering.filesLoweredForNative += 1
    report.lowering.nativeComponents += nativeComponents.length
    diagnosticsFor(nativeComponents, 'native', file, report)

    if (webComponents.length > 0 || nativeComponents.length > 0) {
      report.lowering.filesLowered += 1
      // Which file, and what in it the compiler recognised.
      //
      // #457 reported six lowered files for a corpus whose authored surface
      // imported nothing lowerable, and the report gave no way to check that
      // from outside: two totals that disagreed and nothing naming a file.
      // Reading the compiler's own rule settled what *should* lower -- a tag
      // whose binding came from one of `compiler.sources` -- but not what did,
      // because the numbers were the only evidence and they are just numbers.
      //
      // So each lowered file is listed with its recognised imports. A file
      // here with `(none)` beside it is that contradiction, per file, with a
      // name to go and look at.
      const recognised = (nativeModule?.imports ?? [])
        .filter((item) => compiler.sources.includes(item.source))
        .map((item) => `${item.imported} from ${item.source}`)
      pushSample(report.samples, 'loweredBy', `${file}: ${recognised.join(', ') || '(none)'}`)
    }
    if (platform !== 'native' && directBindings.length > 0 && webComponents.length === 0) {
      report.lowering.directReactNativeJsxPassedThroughOnWeb += 1
      const names = rnImports
        .filter((item) => directBindings.includes(item.local))
        .map((item) =>
          item.imported === item.local ? item.local : `${item.imported} as ${item.local}`,
        )
      pushSample(
        report.samples,
        'directReactNativeJsxPassedThroughOnWeb',
        `${file}: ${names.join(', ')}`,
      )
    }
    if (platform !== 'native') {
      const loweredJsxBindings = compiler.compileNativeModule(loweredWebCode).jsxBindings
      const residue = directReactNativeJsxBindings(loweredJsxBindings, directBindings)
      if (residue.length > 0) {
        report.lowering.filesWithDirectReactNativeJsxResidueOnWeb += 1
        report.lowering.directReactNativeJsxBindingsResidueOnWeb += residue.length
        const names = rnImports
          .filter((item) => residue.includes(item.local))
          .map((item) => {
            increment(report.reactNativeJsxResidueImports, item.imported)
            return item.imported === item.local ? item.local : `${item.imported} as ${item.local}`
          })
        pushSample(
          report.samples,
          'directReactNativeJsxResidueOnWeb',
          `${file}: ${names.join(', ')}`,
        )
      }
    }
    if (platform === 'shared' && webComponents.length !== nativeComponents.length) {
      report.lowering.sharedBackendShapeMismatches += 1
      pushSample(
        report.samples,
        'sharedBackendShapeMismatches',
        `${file}: web ${webComponents.length}, native ${nativeComponents.length}`,
      )
    }
  }

  report.durationMs = Math.round((performance.now() - started) * 100) / 100
  report.lowering.parseOrCompileFailures = report._compileFailures.size
  report.diagnostics.filesWithErrors = report._filesWithErrors.size
  report.diagnostics.filesWithWarnings = report._filesWithWarnings.size
  report.review.confirmedWrongOutputFiles = report._confirmedWrongOutputFiles.size
  delete report._filesWithErrors
  delete report._filesWithWarnings
  delete report._compileFailures
  delete report._confirmedWrongOutputFiles
  report.reactNativeImports = Object.fromEntries(
    Object.entries(report.reactNativeImports).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    ),
  )
  report.reactNativeJsxResidueImports = Object.fromEntries(
    Object.entries(report.reactNativeJsxResidueImports).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    ),
  )
  report.diagnostics.byCode = Object.fromEntries(
    Object.entries(report.diagnostics.byCode).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    ),
  )
  return report
}

function table(entries) {
  return entries.map(([key, value]) => `| ${key} | ${value} |`).join('\n')
}

function markdown(report) {
  const topImports = Object.entries(report.reactNativeImports).slice(0, 15)
  const residueImports = Object.entries(report.reactNativeJsxResidueImports)
  const diagnostics = Object.entries(report.diagnostics.byCode)
  const rnJsxFinding = report.lowering.directReactNativeJsxBindingsResidueOnWeb
    ? `**RNW cannot yet be removed at the JSX boundary:** ${report.lowering.filesWithDirectReactNativeJsxResidueOnWeb} files retain ${report.lowering.directReactNativeJsxBindingsResidueOnWeb} direct React Native JSX bindings after Web lowering.`
    : '**The direct RN JSX boundary is closed:** Web lowering retains no JSX bindings imported from React Native. Non-JSX React Native APIs and third-party native libraries remain separate migration boundaries.'
  const sampleSections = Object.entries(report.samples)
    .map(([name, values]) => `### ${name}\n\n${values.map((value) => `- \`${value}\``).join('\n')}`)
    .join('\n\n')
  // What the styling surface is, and no conclusion the numbers do not carry.
  //
  // This finding used to read "The app is not className-shaped" whenever ALF
  // atoms were absent, and then concluded that inline-style compatibility was
  // the first migration constraint rather than Tailwind coverage. Absence of
  // ALF atoms says nothing about `className`, and the conclusion was drawn
  // for a corpus where 62 of 110 files used `className` against 10 using
  // `style` -- the opposite of what the README documents as the headline
  // feature. It was believed over the README and had to be walked back
  // (#457), which is the cost of a report that reasons instead of reporting.
  const stylingFinding = `**Styling surface:** ${report.authoredSignals.filesWithClassName} of ${report.scope.tsxFiles} files use \`className\`, ${report.authoredSignals.filesWithStyleProp} use \`style\`, and ${report.authoredSignals.filesUsingAlfAtoms} use ALF atoms.${report.authoredSignals.filesWithBareFlexClassName > 0 ? ` ${report.authoredSignals.filesWithBareFlexClassName} write a bare \`flex\` class, which means a row in React DOM and lowers to a column on Native.` : ''}`
  const webStyleFinding = report.review.invalidDomStyleArrayOccurrences
    ? `**Unchanged Web output is not safe yet:** ${report.review.confirmedWrongOutputFiles} files contain ${report.review.invalidDomStyleArrayOccurrences.toLocaleString()} lowered DOM style arrays, a confirmed invalid React DOM shape.`
    : '**The DOM style-array invariant holds:** Web lowering emitted no React Native style arrays into DOM style props.'
  return `# Real-app measurement: ${report.corpus.name}

This is a read-only compiler measurement, not a claim that the application can be migrated without changes. The audited checkout is not modified.

## Corpus

| | |
|---|---|
| Repository | ${report.corpus.repository} |
| Commit | \`${report.corpus.commit}\` |
| Source | \`${report.corpus.sourceDirectory}/**/*.tsx\` |
| Files | ${report.scope.tsxFiles.toLocaleString()} |
| Source bytes | ${report.scope.sourceBytes.toLocaleString()} |
| Shared / Web / Native | ${report.scope.platformFiles.shared} / ${report.scope.platformFiles.web} / ${report.scope.platformFiles.native} |

## Findings

1. **The corpus parses cleanly:** ${report.lowering.parseOrCompileFailures} parse or compile failures across ${report.scope.tsxFiles.toLocaleString()} TSX files.
2. ${webStyleFinding}
3. ${rnJsxFinding}
4. ${stylingFinding}

## Authored surface

| Signal | Files or bindings |
|---|---:|
${table(Object.entries(report.authoredSignals))}

Only direct imports from \`react-native\` are counted as direct React Native JSX. Custom ALF components remain foreign by design; treating every component named \`Text\` or \`Button\` as a React Native primitive would create false transformations.

## Lowering outcome

| Outcome | Count |
|---|---:|
${table(Object.entries(report.lowering))}

Platform suffixes are respected: Web-only files run through Web lowering, iOS/Android/Native files through Native lowering, and shared files through both.

"Lowered" counts files the compiler produced components for. It does not mean migrated, and it is not a measure of progress.

A tag is lowered only when its binding was imported from a module Hozo recognises: \`@hozo/core\`, the other \`@hozo/*\` packages, or \`react-native\`. A file importing none of them is carried verbatim and lowers nothing, however much \`className\` it contains. So a report whose authored surface shows none of those imports and whose lowering count is above zero is describing two things that cannot both be true — read the counts as suspect rather than as a result.

## Diagnostics

| | Count |
|---|---:|
| Files with errors | ${report.diagnostics.filesWithErrors} |
| Files with warnings | ${report.diagnostics.filesWithWarnings} |
${diagnostics.length > 0 ? table(diagnostics) : '| Diagnostic occurrences | 0 |'}

## Most common React Native imports

| Import | Files |
|---|---:|
${table(topImports)}

## React Native JSX left in Web output

| Import | Files or bindings |
|---|---:|
${residueImports.length > 0 ? table(residueImports) : '| None | 0 |'}

## Wrong-output boundary

| Confirmed invariant violation | Count |
|---|---:|
| Files whose lowered DOM contains \`style={[...]}\` | ${report.review.confirmedWrongOutputFiles} |
| Invalid DOM style-array occurrences | ${report.review.invalidDomStyleArrayOccurrences} |

${report.review.note}

This is a lower bound, not a complete wrong-output count. An automatic compiler run can prove this structural violation, but absence of it does not prove rendered behavior is correct. The remaining samples below are the deterministic queue for manual review and follow-up fixtures.

## Review samples

${sampleSections || 'No suspicious samples were produced.'}

## Reproduce

${
  report.corpus.reproduceCommand
    ? `The corpus runner fetches and verifies ${report.corpus.repository} at commit \`${report.corpus.commit}\`. From a Hozo checkout with dependencies installed, run:\n\n\`${report.corpus.reproduceCommand}\``
    : `Check out \`${report.corpus.commit}\` from ${report.corpus.repository}, build \`@hozo/compiler\`, then run:\n\n\`npx @hozo/migration-audit --root <checkout> --source ${report.corpus.sourceDirectory} --name "${report.corpus.name}" --repository ${report.corpus.repository} --expected-commit ${report.corpus.commit} --output hozo-audit.md\``
}
`
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const report = measure(options)
  const output =
    options.format === 'markdown' ? markdown(report) : `${JSON.stringify(report, null, 2)}\n`
  if (options.output) {
    const destination = path.resolve(options.output)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, output)
    console.log(`Wrote ${destination}`)
  } else {
    process.stdout.write(output)
  }
  return report
}

export { markdown as renderRealAppMarkdown, measure as measureRealApp }
