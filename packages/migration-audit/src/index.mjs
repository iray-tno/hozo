import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  analyzeModule,
  discoverAnalysisSources,
  prepareAnalysisProject,
  sourcePlatform,
} from '@hozo/compiler/analysis'
import { loadStaticProjectTheme } from '@hozo/tailwind'
import { compareReports, comparisonMarkdown, validateBaseline } from './comparison.mjs'
import { escapeMarkdown, findingDetails, recordAnalysis, toolchainEvidence } from './evidence.mjs'

const SAMPLE_LIMIT = 12
const DOM_STYLE_ARRAY =
  /<(?:a|article|aside|button|div|fieldset|footer|h[1-6]|header|hr|img|input|label|legend|li|main|meter|nav|ol|p|progress|section|select|span|textarea|ul)\b[^>]*?\bstyle=\{\[/g

export class AuditInputError extends Error {}

const HELP = `Usage:
  hozo-migration-audit <checkout> [options]
  hozo-migration-audit --root <checkout> [options]

Options:
  --source <directory>       Source directory; repeat to scan several (default: src/app, then root)
  --include <glob>           Authored source glob relative to checkout; repeat to combine
  --exclude <glob>           Additional authored source exclusion; repeat to combine
  --native-platform ios|android Native probe graph for shared/native files (default: android)
  --css <file>               Static Tailwind CSS entry (default: conventional CSS discovery)
  --preflight auto|true|false Reset assumption for both backends (default: auto in selected scope)
  --primitive-source <name>  Explicit trusted re-export source; repeat to extend defaults
  --name <name>              Human-readable corpus name
  --repository <url>         Canonical repository URL recorded in the report
  --expected-commit <sha>    Fail unless the checkout is at this commit
  --reproduce-command <cmd>  Command recorded in the Markdown report
  --output <path>            Write the report to this path instead of stdout
  --format json|markdown     Override format (default: Markdown in a terminal, JSON in a pipe)
  --details                 Include every finding in Markdown (JSON is always complete)
  --compare <report>         Compare with a previous JSON audit (informational by default)
  --help                    Show this help

JS/TS (.tsx/.jsx/.ts/.js/.mts/.mjs) source is observed. Dependencies, declarations,
generated output and symlinked directories stay outside authored counts. Non-TSX
compiler capability is not evidence of full integration lowering.`

function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === '--') continue
    if (key === '--help') return { help: true }
    if (key === '--details') {
      options.details = true
      continue
    }
    // `npx @hozo/migration-audit .` is the first thing anyone types, and it
    // failed with `Missing value for .` -- the `.` was read as a flag waiting
    // for its value (#457). A bare token is the checkout.
    if (!key?.startsWith('--')) {
      if (options.root) throw new AuditInputError(`Unexpected argument: ${key}`)
      options.root = key
      continue
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new AuditInputError(`Missing value for ${key}`)
    index += 1
    if (key === '--root') options.root = value
    else if (key === '--source') (options.source ??= []).push(value)
    else if (key === '--include') (options.include ??= []).push(value)
    else if (key === '--exclude') (options.exclude ??= []).push(value)
    else if (key === '--native-platform' && ['ios', 'android'].includes(value))
      options.nativePlatform = value
    else if (key === '--css') options.css = value
    else if (key === '--primitive-source') (options.primitiveSources ??= []).push(value)
    else if (key === '--preflight' && ['auto', 'true', 'false'].includes(value))
      options.preflight = value === 'auto' ? 'auto' : value === 'true'
    else if (key === '--name') options.name = value
    else if (key === '--repository') options.repository = value
    else if (key === '--expected-commit') options.expectedCommit = value
    else if (key === '--output') options.output = value
    else if (key === '--compare') options.compare = value
    else if (key === '--reproduce-command') options.reproduceCommand = value
    else if (key === '--format' && (value === 'json' || value === 'markdown'))
      options.format = value
    else throw new AuditInputError(`Unknown option or value: ${key} ${value}`)
  }
  if (!options.root) throw new AuditInputError('A checkout is required; use --help for usage')
  return options
}

function isDirectory(directory) {
  try {
    return statSync(directory).isDirectory()
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false
    throw error
  }
}

function sourceFiles(root, options) {
  if (!isDirectory(root)) throw new AuditInputError(`Checkout is not a directory: ${root}`)
  for (const key of ['include', 'exclude']) {
    if (
      options[key] !== undefined &&
      (!Array.isArray(options[key]) ||
        !options[key].length ||
        options[key].some(
          (glob) =>
            typeof glob !== 'string' ||
            !glob.trim() ||
            path.isAbsolute(glob) ||
            glob.split(/[\\/]/).includes('..'),
        ))
    )
      throw new AuditInputError(`${key} must be nonempty checkout-relative globs`)
  }
  try {
    return discoverAnalysisSources(root, options)
  } catch (error) {
    throw new AuditInputError(error.message)
  }
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
  // `status` may refresh the index or invoke a checkout's fsmonitor hook.
  // Provenance collection must neither write Git metadata nor execute app hooks.
  return execFileSync(
    'git',
    ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', checkout, ...args],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ).trim()
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

async function measure(options) {
  const started = performance.now()
  const root = path.resolve(options.root)
  const { directories, files, contextCandidates, excludedFiles } = sourceFiles(root, options)
  const discoveryDurationMs = performance.now() - started
  const provenanceStarted = performance.now()
  const commit = optionalGit(root, ['rev-parse', 'HEAD']) ?? 'unknown'
  if (options.expectedCommit && !commit.startsWith(options.expectedCommit)) {
    throw new AuditInputError(`Expected corpus commit ${options.expectedCommit}, found ${commit}`)
  }

  const repository =
    options.repository ?? optionalGit(root, ['remote', 'get-url', 'origin']) ?? root
  if (options.preflight !== undefined && ![true, false, 'auto'].includes(options.preflight))
    throw new AuditInputError('preflight must be auto, true or false')
  if (options.nativePlatform !== undefined && !['ios', 'android'].includes(options.nativePlatform))
    throw new AuditInputError('nativePlatform must be ios or android')
  if (options.css !== undefined && (typeof options.css !== 'string' || !options.css.trim()))
    throw new AuditInputError('css must name a stylesheet')
  if (
    options.primitiveSources !== undefined &&
    (!Array.isArray(options.primitiveSources) ||
      options.primitiveSources.some((source) => typeof source !== 'string' || !source.trim()))
  )
    throw new AuditInputError('primitiveSources must be an array of nonempty module names')
  const dirty = optionalGit(root, ['status', '--porcelain', '--ignore-submodules=all'])
  const provenanceDurationMs = performance.now() - provenanceStarted
  const sourceReadStarted = performance.now()
  const authoredSources = files.map((file) => ({ file, source: readFileSync(file, 'utf8') }))
  const sourceReadDurationMs = performance.now() - sourceReadStarted
  const project = await prepareAnalysisProject(
    { ...options, root, authoredSources, contextCandidates },
    loadStaticProjectTheme,
  )
  if (options.css !== undefined && project.projectFacts.css.status === 'invalid')
    throw new AuditInputError(project.projectFacts.css.reason)
  const { compiler } = project
  const sourceHash = createHash('sha256')
  const report = {
    schemaVersion: 3,
    toolchain: toolchainEvidence(),
    corpus: {
      name: options.name ?? path.basename(root),
      repository,
      commit,
      dirty: dirty === undefined ? null : dirty !== '',
      dirtyScope: 'Checkout status; submodule state is not assessed.',
      ...(directories.length === 1 ? { sourceDirectory: directories[0] } : {}),
      sourceDirectories: directories,
      reproduceCommand: options.reproduceCommand,
    },
    scope: {
      tsxFiles: files.filter((file) => file.endsWith('.tsx')).length,
      extensions: Object.fromEntries(
        ['.tsx', '.jsx', '.ts', '.js', '.mts', '.mjs'].map((ext) => [
          ext,
          files.filter((file) => path.extname(file) === ext).length,
        ]),
      ),
      sourceBytes: 0,
      platformFiles: { shared: 0, web: 0, native: 0 },
      authoredFiles: files.length,
      contextModules: project.stylex.contextSources.length,
      excludedFiles: excludedFiles.length,
    },
    analysis: {
      workers: 1,
      projectFacts: project.projectFacts,
      contextStatus: project.contextStatus,
      sourceSelection: {
        include: options.include ?? null,
        exclude: options.exclude ?? [],
        extensions: ['.tsx', '.jsx', '.ts', '.js', '.mts', '.mjs'],
      },
      excludedFiles: excludedFiles.map(({ file, reason }) => ({
        file: relative(root, file),
        reason,
      })),
      omittedScope:
        'Built-in excluded directory contents and unsupported extensions are not enumerated; this is a source inventory, not an entry-point production graph.',
      nativePlatform: options.nativePlatform ?? 'android',
      resolutionPolicy:
        'static-relative-and-tsconfig-paths; platform suffix preference; ambiguous extensions unresolved; not authoritative bundler resolution',
      parserMode: 'extension-aware JS/TS syntax; JavaScript accepts JSX; not TypeScript validation',
      contextModules: project.stylex.contextSources.map(({ file, sha256 }) => ({
        file: relative(root, file),
        sha256,
        purpose: 'StyleX import/reexport context',
      })),
      configurationInputs: project.stylex.configurationInputs.map(({ file, sha256 }) => ({
        file: relative(root, file),
        sha256,
      })),
      graphResolutions: project.stylex.resolutions.map(({ importer, resolved, ...rest }) => ({
        ...rest,
        importer: relative(root, importer),
        ...(resolved ? { resolved: relative(root, resolved) } : {}),
      })),
      stylesheetInputs: project.stylesheets.map(({ file, sha256 }) => ({
        file: relative(root, file),
        sha256,
      })),
      preflightBasis: project.preflightBasis,
      compilerAssumptions: {
        theme: project.projectFacts.theme.status === 'resolved' ? 'project' : 'builtin',
        preflight: project.compilerInputs.theme.preflight,
      },
      primitiveSources: [...compiler.sources],
      stageDurationMs: {
        'source:discovery': discoveryDurationMs,
        'corpus:provenance': provenanceDurationMs,
        'source:snapshot': sourceReadDurationMs,
        'project:preparation': project.durationMs,
      },
      productionBuild: 'not-assessed',
      runtimeBehavior: 'not-assessed',
    },
    files: [],
    findings: [],
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
  // Corpus-owned heuristics stay separate from the generic migration contract.
  // The Bluesky runner can retain its historical signals without teaching a
  // general-purpose CLI that an arbitrary `atoms` identifier is a design system.
  const fileSignals = Object.entries(options.fileSignals ?? {})
  if (fileSignals.length > 0)
    report.corpusSignals = Object.fromEntries(fileSignals.map(([name]) => [name, 0]))

  for (const { file: absolute, source } of authoredSources) {
    const file = relative(root, absolute)
    const platform = sourcePlatform(absolute)
    // Length framing prevents different path/content boundaries sharing a hash.
    for (const part of [file, source]) {
      sourceHash.update(`${Buffer.byteLength(part)}:`).update(part)
    }
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
    for (const [name, matches] of fileSignals) {
      if (matches(source, file)) report.corpusSignals[name] += 1
    }

    const analysis = analyzeModule(source, {
      compiler,
      file: absolute,
      root,
      stylexContexts: project.stylex.graphs,
      stylexRegistries: project.stylex.registries,
      nativePlatform: options.nativePlatform ?? 'android',
      targets: platform === 'shared' ? ['web', 'native'] : [platform],
    })
    recordAnalysis(report, analysis, file, source, platform)
    const nativeModule = analysis.bindings
    const rnImports = nativeModule?.imports.filter((item) => item.source === 'react-native') ?? []
    if (nativeModule) {
      if (rnImports.length > 0) report.authoredSignals.filesImportingReactNative += 1
      for (const item of rnImports) increment(report.reactNativeImports, item.imported)
      if (nativeModule.foreignPrimitives.length > 0) {
        report.authoredSignals.filesWithForeignPrimitiveNames += 1
        pushSample(report.samples, 'foreignPrimitiveNames', file)
      }
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

    const webComponents = analysis.targets.web?.semanticComponents ?? 0
    const loweredWebCode = analysis.targets.web?.code
    if (loweredWebCode !== undefined) {
      if (webComponents > 0) report.lowering.filesLoweredForWeb += 1
      report.lowering.webComponents += webComponents
      const invalidStyleArrays = loweredWebCode.match(DOM_STYLE_ARRAY)?.length ?? 0
      if (invalidStyleArrays > 0) {
        report._confirmedWrongOutputFiles.add(file)
        report.review.invalidDomStyleArrayOccurrences += invalidStyleArrays
        pushSample(report.samples, 'invalidDomStyleArrays', `${file}: ${invalidStyleArrays}`)
      }
    }

    const nativeComponents = analysis.targets.native?.semanticComponents ?? 0
    if (nativeComponents > 0) report.lowering.filesLoweredForNative += 1
    report.lowering.nativeComponents += nativeComponents

    if (webComponents > 0 || nativeComponents > 0) {
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
    if (platform !== 'native' && directBindings.length > 0 && webComponents === 0) {
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
    if (analysis.targets.web?.directReactNativeJsxResidue) {
      const residue = analysis.targets.web.directReactNativeJsxResidue
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
    if (absolute.endsWith('.tsx') && platform === 'shared' && webComponents !== nativeComponents) {
      report.lowering.sharedBackendShapeMismatches += 1
      pushSample(
        report.samples,
        'sharedBackendShapeMismatches',
        `${file}: web ${webComponents}, native ${nativeComponents}`,
      )
    }
  }

  report.durationMs = Math.round((performance.now() - started) * 100) / 100
  report.corpus.sourceSha256 = sourceHash.digest('hex')
  report.lowering.parseOrCompileFailures = report._compileFailures.size
  report.diagnostics.filesWithErrors = report._filesWithErrors.size
  report.diagnostics.filesWithWarnings = report._filesWithWarnings.size
  report.review.confirmedWrongOutputFiles = report._confirmedWrongOutputFiles.size
  delete report._filesWithErrors
  delete report._filesWithWarnings
  delete report._compileFailures
  delete report._confirmedWrongOutputFiles
  report.reactNativeValueDecisions?.inventory.sort(
    (a, b) => b.references - a.references || JSON.stringify(a).localeCompare(JSON.stringify(b)),
  )
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

function markdown(report, { details = false } = {}) {
  const sourceDirectories = report.corpus.sourceDirectories ?? [report.corpus.sourceDirectory]
  const sourcePatterns = sourceDirectories
    .map(
      (directory) => `\`${directory === '.' ? '' : `${directory}/`}**/*.{tsx,jsx,ts,js,mts,mjs}\``,
    )
    .join(', ')
  const sourceArguments = sourceDirectories
    .map((directory) => `--source ${JSON.stringify(directory)}`)
    .join(' ')
  const topImports = Object.entries(report.reactNativeImports).slice(0, 15)
  const residueImports = Object.entries(report.reactNativeJsxResidueImports)
  const diagnostics = Object.entries(report.diagnostics.byCode)
  const rnJsxFinding = report.lowering.directReactNativeJsxBindingsResidueOnWeb
    ? `**RNW cannot yet be removed at the JSX boundary:** ${report.lowering.filesWithDirectReactNativeJsxResidueOnWeb} files retain ${report.lowering.directReactNativeJsxBindingsResidueOnWeb} direct React Native JSX bindings after Web lowering.`
    : report.analysis.contextStatus === 'partial' ||
        report.files?.some(
          (file) => file.targets.web?.status === 'failed' || file.bindingsStatus === 'failed',
        ) ||
        report.files?.every((file) => !file.targets.web)
      ? '**The direct RN JSX boundary is not fully assessed:** Project context or Web/binding analysis was incomplete, or no Web targets were assessed; zero observed residue is not a closed boundary.'
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
  const stylingFinding = `**Styling surface:** ${report.authoredSignals.filesWithClassName} of ${report.scope.authoredFiles} files use \`className\` and ${report.authoredSignals.filesWithStyleProp} use \`style\`.${report.authoredSignals.filesWithBareFlexClassName > 0 ? ` ${report.authoredSignals.filesWithBareFlexClassName} write a bare \`flex\` class, which means a row in React DOM and lowers to a column on Native.` : ''}`
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
| Source | ${sourcePatterns} |
| Authored files / TSX subset / context modules | ${report.scope.authoredFiles.toLocaleString()} / ${report.scope.tsxFiles.toLocaleString()} / ${report.scope.contextModules} |
| Source bytes | ${report.scope.sourceBytes.toLocaleString()} |
| Shared / Web / Native | ${report.scope.platformFiles.shared} / ${report.scope.platformFiles.web} / ${report.scope.platformFiles.native} |

## Findings

1. **${report.lowering.parseOrCompileFailures === 0 ? 'The corpus parses cleanly' : 'The corpus has parse or compile failures'}:** ${report.lowering.parseOrCompileFailures} parse or compile failures across ${report.scope.authoredFiles.toLocaleString()} JS/TS files (extension-aware syntax parsing, not TypeScript validation).
2. ${webStyleFinding}
3. ${rnJsxFinding}
4. ${stylingFinding}

## Authored surface

| Signal | Files or bindings |
|---|---:|
${table(Object.entries(report.authoredSignals))}

Only direct imports from \`react-native\` are counted as direct React Native JSX. Application-specific components remain foreign by design; treating every component named \`Text\` or \`Button\` as a React Native primitive would create false transformations.
${
  report.corpusSignals
    ? `
## Corpus-specific signals

These are heuristics supplied by the corpus runner, not general migration guarantees.

| Signal | Files |
|---|---:|
${table(Object.entries(report.corpusSignals))}
`
    : ''
}

## Lowering outcome

| Outcome | Count |
|---|---:|
${table(Object.entries(report.lowering))}

## Authored React Native usage

${
  report.reactNativeUsage
    ? `| Observed ESM signal | Count |
|---|---:|
${table(Object.entries(report.reactNativeUsage).filter(([, value]) => typeof value === 'number'))}`
    : 'Not assessed.'
}

This inventory resolves direct ESM import symbols, aliases and lexical shadowing. Type references,
unused imports, component values, member reads, reexports and side-effect edges stay distinct.
JSON retains every authored binding/reference with UTF-16 spans. CommonJS, dynamic imports,
TS import-equals and indirect wrapper/data-flow usage are not inventoried. These are source facts;
no member compatibility or dependency-removal claim follows from them.

## Web React Native import decisions

${
  report.reactNativeImportDecisions
    ? `| Actual import outcome | Count |
|---|---:|
${table(Object.entries(report.reactNativeImportDecisions).filter(([, value]) => typeof value === 'number'))}`
    : 'Not assessed.'
}

The shared Web lowerer journals actual import-specifier edits; JSON joins outcomes to authored
binding indices. Retained imports are not remaining runtime-use counts: JSX can already have been
lowered while its import remains for the bundler to elide. Type-only is not proof of type erasure.
Forwarding/side-effect edges and semantic reference dispositions are not assessed here. No member
compatibility, package-resolution, production dependency-removal or runtime guarantee follows from
an import move. Native remains a compiler probe, not an import rewrite verdict.

## Web React Native JSX tag decisions

${
  report.reactNativeReferenceDecisions
    ? `| Actual tag outcome | Count |
|---|---:|
${table(Object.entries(report.reactNativeReferenceDecisions).filter(([, value]) => typeof value === 'number'))}`
    : 'Not assessed.'
}

The Web renderer journals emitted opening/closing names, joined to authored binding/reference
indices through unchanged source runs across actual import/Canvas edits. Counts are tag occurrences,
not component counts. Preserved tags describe emitted spelling, not a retained React Native
dependency: their import may have moved separately. Non-JSX expressions, types and tags without
an exact emission join remain not assessed; unknown does not mean retained or unsupported.
Member compatibility, Native rewriting, production dependency removal and runtime are not assessed.
Partial/failed journals remain in JSON but do not enter successful tag headline counts.

## Web React Native non-JSX value decisions

${
  report.reactNativeValueDecisions
    ? `| Actual source-run reference outcome | Count |
|---|---:|
${table(Object.entries(report.reactNativeValueDecisions).filter(([, value]) => typeof value === 'number'))}`
    : 'Not assessed.'
}

References are tracked through actual module splices and verified backend copies, then joined
to actual import-origin decisions. This is not a post-lowering spelling search.
JSON keeps authored binding/reference indices and final emitted UTF-16 spans. Expressions inside
generated JSX gain evidence only for actual carried prop/child fragments or DOM style/spread
normalizer values. Renamed onPress/responder handlers and handler values passed to hozoInteractive
or a disabled link's sibling arm also retain their authored scope. Synthesized callback syntax,
unrecorded canonical expressions and replaced Canvas ranges remain unknown even if their text
appears in output. Type references are
excluded; completed-file counts include unknowns, not partial/failed journals. Class namespacing
preserves only unaffected copied fragments; discarded void children never enter the copy journal.
No member compatibility, dependency removal, production build or runtime guarantee is assessed.

| Authored import | Member | Access | Actual origin outcome | Destination | References | Files |
|---|---|---|---|---|---:|---:|
${
  report.reactNativeValueDecisions?.inventory.length
    ? report.reactNativeValueDecisions.inventory
        .map(
          (row) =>
            `| ${escapeMarkdown(row.imported)} | ${escapeMarkdown(row.member ?? '(not statically named)')} | ${escapeMarkdown(row.access)} | ${row.disposition} | ${escapeMarkdown(row.replacement ?? (row.disposition === 'remains-react-native' ? 'react-native' : '(not assessed)'))} | ${row.references} | ${row.files} |`,
        )
        .join('\n')
    : '| None assessed | — | — | — | — | 0 | 0 |'
}

Review retained RN-backed values for remaining migration work; review moved values against the
adapter's member contract rather than treating them as supported. Dynamic/namespace access needs
manual review, and unknown generated expressions are not evidence of retained RN use. JSON holds
up to 12 sample files per row and all individual outcomes; sample limits do not limit counts.

### Reviewed Web member contracts and next actions

Compiler-owned reviews describe a declared adapter subset or a retained-RN migration action,
not certification that a call's arguments, installed package, runtime or Native behavior match.
Only direct named-import static members with an assessed final origin can acquire a review.
Unknown members, dynamic/namespace access and untraced references remain not assessed; missing
entries do not mean unsupported. This is not an overall compatibility percentage. Evidence paths
refer to the tool's Hozo source review, not files resolved in the audited application. Links use
Hozo's current main branch, not a frozen copy of the installed tool's source.

| Authored import/member | Contract review | References | Declared subset / limitation | Next action | Review evidence |
|---|---|---:|---|---|---|
${
  report.reactNativeValueDecisions?.inventory.length
    ? report.reactNativeValueDecisions.inventory
        .map((row) => {
          const contract = row.memberContract
          const evidence = contract?.evidence
            ?.flatMap((item) => [item.implementation, item.tests])
            .map(
              (file) =>
                `[${escapeMarkdown(file)}](https://github.com/iray-tno/hozo/blob/main/${file.split('/').map(encodeURIComponent).join('/')})`,
            )
            .join('; ')
          return `| ${escapeMarkdown(`${row.imported}.${row.member ?? '(not statically named)'}`)} | ${escapeMarkdown(contract?.status ?? 'not-assessed')} | ${row.references} | ${escapeMarkdown(contract?.summary ?? 'No compiler member review supplied.')} | ${escapeMarkdown(contract?.nextAction ?? 'Review the actual API; no member compatibility verdict is inferred.')} | ${evidence ?? '—'} |`
        })
        .join('\n')
    : '| None assessed | — | 0 | — | — | — |'
}

Platform suffixes are respected: Web-only files run through Web lowering, iOS/Android/Native files through Native lowering, and shared files through both.

Web uses the shared module lowering path in memory. Native is a compiler-only component/Canvas probe, not full Metro preparation. Neither certifies production builds or runtime behavior. Non-TSX Web modules only use the existing runtime-import rewrite path; Native compiler results for these extensions are probes, not Metro eligibility. Each target records integrationEligibility in JSON.

Cross-file StyleX uses in-memory, platform-separated graphs and static relative/tsconfig paths resolution. Shared/native probes use ${report.analysis.nativePlatform}; explicit iOS/Android suffixes use their own platform. Package/custom bundler resolution remains unassessed when no static answer exists. Resolution records and input hashes are retained in JSON. Context-only modules do not enter authored counts. Fonts and production entry-point reachability remain unassessed; no app configuration is executed.

## Project context

| Fact | Status | Value or reason |
|---|---|---|
${Object.entries(report.analysis.projectFacts)
  .map(
    ([name, fact]) =>
      `| ${name} | ${fact.status}${fact.origin ? ` (${fact.origin})` : ''} | ${JSON.stringify(
        fact.value ?? fact.reason,
      )
        .replaceAll('|', '\\|')
        .replace(/\r?\n/g, ' ')} |`,
  )
  .join('\n')}

Effective compiler assumptions: theme=${report.analysis.compilerAssumptions.theme}, preflight=${report.analysis.compilerAssumptions.preflight}. Partial context uses builtin tokens only as a probe, not an assessment of the project's theme. Auto preflight uses the compiler's Tailwind facts for selected authored files; it is not discovery of the app's actual bundler settings or reset stylesheet. CSS inputs and content hashes are retained separately in JSON.

"Lowered" counts files the compiler produced components for. It does not mean migrated, and it is not a measure of progress.

A tag is lowered only when its binding was imported from a module Hozo recognises: \`@hozo/core\`, the other \`@hozo/*\` packages, or \`react-native\`. A file importing none of them is carried verbatim and lowers nothing, however much \`className\` it contains. So a report whose authored surface shows none of those imports and whose lowering count is above zero is describing two things that cannot both be true — read the counts as suspect rather than as a result.

## Diagnostics

| | Count |
|---|---:|
| Files with errors | ${report.diagnostics.filesWithErrors} |
| Files with warnings | ${report.diagnostics.filesWithWarnings} |
${diagnostics.length > 0 ? table(diagnostics) : '| Diagnostic occurrences | 0 |'}

${findingDetails(report, details)}${report.comparison ? `\n\n${comparisonMarkdown(report.comparison, { details })}` : ''}

${
  report.toolchain
    ? `## Analysis provenance

| | |
|---|---|
| Audit / compiler versions | ${report.toolchain.auditVersion} / ${report.toolchain.compilerVersion} |
| Theme loader / Tailwind / CSS parser | ${report.toolchain.themeLoaderVersion} / ${report.toolchain.tailwindVersion} / ${report.toolchain.cssParserVersion} |
| Loaded binding SHA-256 | ${report.toolchain.binding.sha256} |
| Authored source SHA-256 | ${report.corpus.sourceSha256} |
| Checkout dirty | ${report.corpus.dirty === null ? 'unknown (not a Git checkout)' : report.corpus.dirty} |

Binding identity, per-file outcomes, stage timings and unresolved project facts are retained in JSON. Diagnostic positions use UTF-16 code units; rewritten positions without a source map are explicitly unmapped.
`
    : ''
}

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
    : `Check out \`${report.corpus.commit}\` from ${report.corpus.repository}, build \`@hozo/compiler\`, then run:\n\n\`npx @hozo/migration-audit --root <checkout> ${sourceArguments} --name "${report.corpus.name}" --repository ${report.corpus.repository} --expected-commit ${report.corpus.commit} --output hozo-audit.md\``
}
`
}

export async function runCli(argv = process.argv.slice(2), { stdout = process.stdout } = {}) {
  const options = parseArgs(argv)
  if (options.help) {
    stdout.write(`${HELP}\n`)
    return
  }
  options.format ??= options.output
    ? options.output.endsWith('.md')
      ? 'markdown'
      : 'json'
    : stdout.isTTY
      ? 'markdown'
      : 'json'
  let baseline
  if (options.compare) {
    if (options.output && path.resolve(options.output) === path.resolve(options.compare))
      throw new AuditInputError('comparison output must not overwrite its baseline')
    try {
      baseline = validateBaseline(JSON.parse(readFileSync(path.resolve(options.compare), 'utf8')))
    } catch (error) {
      throw new AuditInputError(`cannot compare baseline: ${error.message.replace(/\s+/g, ' ')}`)
    }
  }
  const report = await measure(options)
  if (baseline) report.comparison = compareReports(report, baseline)
  const output =
    options.format === 'markdown'
      ? markdown(report, options)
      : `${JSON.stringify(report, null, 2)}\n`
  if (options.output) {
    const destination = path.resolve(options.output)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, output)
    stdout.write(`Wrote ${destination}\n`)
  } else {
    stdout.write(output)
  }
  return report
}

export { compareReports, markdown as renderRealAppMarkdown, measure as measureRealApp }
