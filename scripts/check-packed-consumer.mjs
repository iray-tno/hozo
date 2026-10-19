// A release-shaped consumer, not a workspace build. Local Hozo tarballs
// stand in for the not-yet-published version; everything else is installed
// normally. No aliases, NODE_PATH, copied development addon or repo imports
// may rescue the application. Logs and failures belong in the evidence too.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { hostTarget, publishManifest } from '../packages/compiler/src/native-targets.ts'
import { BUILT_GUIDES, readGuide } from './guide-snippets.mjs'
import { PACKAGE_NAMES } from './package-metadata.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const fixtureRoot = path.join(root, 'scripts/fixtures/packed-consumer')
const slash = (value) => value.replaceAll('\\', '/')
const json = (file) => JSON.parse(readFileSync(file, 'utf8'))

// Opt-in domains do not enter core's dependency closure. They still need
// an installed-package check before their first release.
export const WEB_CONSUMER_PACKAGES = ['core', 'compiler', 'vite', 'ui', 'three', 'media', 'webview']

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(file) : [file]
  })
}

function fixtureHash(directory) {
  const hash = createHash('sha256')
  function visit(at, relative = '') {
    for (const entry of readdirSync(at, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const name = `${relative}/${entry.name}`
      if (entry.isDirectory()) visit(path.join(at, entry.name), name)
      else
        hash
          .update(name)
          .update('\0')
          .update(readFileSync(path.join(at, entry.name)))
    }
  }
  visit(directory)
  return hash.digest('hex')
}

export function consumerClosure(names, manifests) {
  const found = new Set()
  function visit(name) {
    if (found.has(name)) return
    const manifest = manifests.get(name)
    if (!manifest || manifest.private) throw new Error(`${name} is not an installable package`)
    found.add(name)
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (dependency.startsWith('@hozo/')) visit(dependency.slice('@hozo/'.length))
    }
  }
  for (const name of names) visit(name)
  return [...found].sort()
}

export function consumerEnvironment(environment) {
  const clean = { ...environment }
  for (const key of Object.keys(clean)) {
    if (['HOZO_NATIVE_BINDING', 'NODE_PATH', 'NODE_OPTIONS'].includes(key.toUpperCase()))
      delete clean[key]
  }
  return clean
}

function pnpmCommand(args) {
  if (process.platform !== 'win32') return ['pnpm', args]
  const shim = execFileSync('where.exe', ['pnpm.cmd'], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)[0]
  return [
    process.execPath,
    [path.join(path.dirname(shim), 'node_modules/pnpm/bin/pnpm.mjs'), ...args],
  ]
}

function installedVersion(from, name) {
  // Peers are direct dependencies in these workspaces. Read their installed
  // metadata, even when an exports map hides it or there is no JS entry
  // (@types/react); the application's imports still use normal resolution.
  const manifest = json(path.join(root, from, 'node_modules', name, 'package.json'))
  assert.equal(manifest.name, name)
  return manifest.version
}

// What a guide installs by name, pinned to the version this repository
// already builds against, so the guide is tested against a known tree.
const GUIDE_VERSION_SOURCES = [
  'packages/core',
  'packages/vite',
  'examples/astro-demo',
  'examples/login-demo',
]
function guideVersion(name) {
  const from = GUIDE_VERSION_SOURCES.find((directory) =>
    existsSync(path.join(root, directory, 'node_modules', name, 'package.json')),
  )
  assert.ok(from, `no workspace package installs ${name}, so the guide's version cannot be pinned`)
  return installedVersion(from, name)
}

// The packages each guide's starter already has, and how it builds.
export const GUIDE_STARTERS = {
  vite: { packages: ['react', 'react-dom', 'vite', '@vitejs/plugin-react'], build: 'vite' },
  astro: { packages: ['astro'], build: 'astro' },
}

function workspaceYaml(tarballs) {
  return [
    'nodeLinker: isolated',
    'autoInstallPeers: false',
    'strictPeerDependencies: false',
    'overrides:',
    ...Object.entries(tarballs).map(([name, spec]) => `  '${name}': '${spec}'`),
    '',
  ].join('\n')
}

/** What a guide's build has to contain for the guide to be telling the truth. */
export function guideOutputProblems(files) {
  const text = files.map(({ content }) => content).join('\n')
  const problems = []
  // Static HTML from Astro; `jsx(`h1`, ...)` from Vite, which quotes with backticks.
  if (!/<h1 class="hozo-|["'`]h1["'`]/.test(text)) problems.push('the Heading did not lower to an <h1>')
  if (!text.includes('oklch(62% .19 258)'))
    problems.push("the theme's --color-brand never reached the CSS: `css` was not read")
  if (
    files.some(
      ({ file, content }) => file.endsWith('.js') && /from\s*["']@hozo\/core["']/.test(content),
    )
  )
    problems.push('a client chunk still imports @hozo/core')
  return problems
}

async function main() {
  const artifacts = path.join(root, 'artifacts/packed-consumer')
  mkdirSync(artifacts, { recursive: true })
  const output = mkdtempSync(path.join(artifacts, 'run-'))
  const work = mkdtempSync(path.join(tmpdir(), 'hozo-packed-consumer-'))
  assert.ok(!path.resolve(work).startsWith(path.resolve(root)))
  const evidence = {
    passed: false,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
    runnerSha256: createHash('sha256')
      .update(readFileSync(fileURLToPath(import.meta.url)))
      .digest('hex'),
    fixtureSha256: fixtureHash(fixtureRoot),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    work,
    startedAt: new Date().toISOString(),
    checks: [],
    packages: [],
    scope:
      'Local release tarballs; compiler execution, SSR, Vite browser interaction, Android/iOS Metro, Android autolink/codegen, the Vite and Astro getting-started guides built as written. Not registry authentication, Gradle compilation or device rendering.',
  }
  const env = consumerEnvironment(process.env)
  const save = () =>
    writeFileSync(path.join(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  function command(name, executable, args, cwd, timeout = 300_000) {
    console.log(`[packed-consumer] ${name}`)
    const result = spawnSync(executable, args, {
      cwd,
      env,
      encoding: 'utf8',
      timeout,
      maxBuffer: 32 * 1024 * 1024,
    })
    writeFileSync(
      path.join(output, `${name}.log`),
      `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error ?? ''}`,
    )
    evidence.checks.push({
      name,
      passed: result.status === 0 && !result.error,
      exitCode: result.status,
      error: result.error ? String(result.error) : undefined,
    })
    save()
    assert.equal(
      result.status,
      0,
      `${name} failed: see ${path.join(output, `${name}.log`)}\n${result.stderr?.slice(-4000)}`,
    )
    assert.equal(result.error, undefined)
    return result.stdout
  }
  const pnpm = (name, args, cwd) => command(name, ...pnpmCommand(args), cwd)
  save()
  console.log(`[packed-consumer] evidence: ${output}`)
  try {
    const target = hostTarget(
      process.platform,
      process.arch,
      process.report?.getReport()?.header?.glibcVersionRuntime ? 'gnu' : 'musl',
    )
    assert.ok(target, 'no platform binding for this host')
    const bindingsAt = process.argv.indexOf('--bindings-dir')
    const bindings =
      bindingsAt === -1 ? path.join(output, 'bindings') : path.resolve(process.argv[bindingsAt + 1])
    if (bindingsAt === -1) {
      command(
        'build-platform-binding',
        process.execPath,
        ['packages/compiler/scripts/pack-native.mjs', '--target', target.triple, '--out', bindings],
        root,
      )
    }
    const binding = path.join(bindings, target.packageName.replace('@hozo/', ''))
    const bindingManifest = json(path.join(binding, 'package.json'))
    assert.equal(bindingManifest.name, target.packageName)
    const compilerManifest = json(path.join(root, 'packages/compiler/package.json'))
    assert.equal(bindingManifest.version, compilerManifest.version)
    evidence.binding = {
      name: target.packageName,
      version: bindingManifest.version,
      sha256: createHash('sha256')
        .update(readFileSync(path.join(binding, 'hozo_napi.node')))
        .digest('hex'),
    }

    const names = PACKAGE_NAMES
    const manifests = new Map(
      names.map((name) => [name, json(path.join(root, 'packages', name, 'package.json'))]),
    )
    const selected = consumerClosure(
      [...WEB_CONSUMER_PACKAGES, 'metro', 'native', 'behaviors'],
      manifests,
    )
    const tarballs = {}
    const tarballDir = path.join(output, 'tarballs')
    mkdirSync(tarballDir)
    for (const name of selected) {
      const manifest = manifests.get(name)
      const tarball = path.join(tarballDir, `hozo-${name}-${manifest.version}.tgz`)
      let directory = path.join(root, 'packages', name)
      if (name === 'compiler') {
        // Generate the publish manifest in a private staging copy; never
        // rewrite the contributor's compiler manifest or package metadata.
        directory = path.join(work, 'compiler-stage')
        mkdirSync(directory)
        for (const file of ['dist', 'src', 'LICENSE', 'README.md'])
          cpSync(path.join(root, 'packages/compiler', file), path.join(directory, file), {
            recursive: true,
          })
        writeFileSync(
          path.join(directory, 'package.json'),
          `${JSON.stringify(publishManifest(manifest), null, 2)}\n`,
        )
      }
      pnpm(`pack-${name}`, ['pack', '--out', tarball], directory)
      tarballs[manifest.name] = `file:${slash(tarball)}`
      evidence.packages.push({
        name: manifest.name,
        version: manifest.version,
        releaseListed: PACKAGE_NAMES.includes(name),
        sha256: createHash('sha256').update(readFileSync(tarball)).digest('hex'),
      })
    }
    const platformTarball = path.join(tarballDir, 'platform-binding.tgz')
    pnpm('pack-platform-binding', ['pack', '--out', platformTarball], binding)
    tarballs[target.packageName] = `file:${slash(platformTarball)}`
    save()

    const react = installedVersion('packages/core', 'react')
    const common = {
      react,
      '@types/react': installedVersion('packages/core', '@types/react'),
      typescript: installedVersion('.', 'typescript'),
    }
    const webPeers = {
      ...common,
      'react-dom': installedVersion('packages/core', 'react-dom'),
      '@types/react-dom': installedVersion('packages/core', '@types/react-dom'),
      three: installedVersion('packages/three', 'three'),
      vite: installedVersion('packages/vite', 'vite'),
      tailwindcss: installedVersion('packages/tailwind', 'tailwindcss'),
    }
    const nativePeers = {
      ...common,
      '@babel/runtime': installedVersion('examples/native-demo', '@babel/runtime'),
      'react-native': installedVersion('examples/native-demo', 'react-native'),
      '@react-native/metro-config': installedVersion(
        'examples/native-demo',
        '@react-native/metro-config',
      ),
      '@react-native/metro-babel-transformer': installedVersion(
        'examples/native-demo',
        '@react-native/metro-babel-transformer',
      ),
      '@react-native-community/cli': installedVersion(
        'examples/native-demo',
        '@react-native-community/cli',
      ),
      '@react-native-community/cli-platform-android': installedVersion(
        'examples/native-demo',
        '@react-native-community/cli-platform-android',
      ),
      metro: installedVersion('examples/native-demo', 'metro'),
    }
    evidence.peers = { web: webPeers, native: nativePeers }
    for (const [kind, peers, hozo] of [
      ['web', webPeers, WEB_CONSUMER_PACKAGES],
      ['native', nativePeers, ['core', 'compiler', 'metro', 'ui', 'native', 'behaviors']],
    ]) {
      const app = path.join(work, kind)
      cpSync(path.join(fixtureRoot, kind), app, { recursive: true })
      writeFileSync(
        path.join(app, 'package.json'),
        `${JSON.stringify({ name: `packed-hozo-${kind}`, private: true, type: 'module', dependencies: { ...peers, ...Object.fromEntries(hozo.map((name) => [`@hozo/${name}`, tarballs[`@hozo/${name}`]])) } }, null, 2)}\n`,
      )
      writeFileSync(path.join(app, 'pnpm-workspace.yaml'), workspaceYaml(tarballs))
      pnpm(`install-${kind}`, ['install', '--ignore-scripts'], app)
      const require = createRequire(path.join(app, 'package.json'))
      const compilerRequire = createRequire(require.resolve('@hozo/compiler/package.json'))
      const resolved = realpathSync(compilerRequire.resolve(target.packageName))
      assert.ok(resolved.startsWith(`${app}${path.sep}node_modules${path.sep}`))
      assert.equal(
        createHash('sha256').update(readFileSync(resolved)).digest('hex'),
        evidence.binding.sha256,
      )
      pnpm(`typecheck-${kind}`, ['exec', 'tsc', '--noEmit'], app)
      if (kind === 'web') {
        command('execute-compiler-ssr-three', process.execPath, ['probe.mjs'], app)
        command('execute-web-opt-in-media-webview', process.execPath, ['opt-in-probe.mjs'], app)
        pnpm('build-vite', ['exec', 'vite', 'build'], app)
        await browserCheck(app, output, evidence)
        save()
      } else {
        try {
          command('metro-autolink-codegen', process.execPath, ['probe.mjs'], app)
        } finally {
          if (existsSync(path.join(app, 'output')))
            cpSync(path.join(app, 'output'), path.join(output, 'native'), { recursive: true })
        }
      }
    }
    // The getting-started guides, built from their own code blocks over a
    // stand-in for the framework's starter (`guide-snippets.mjs`).
    for (const name of BUILT_GUIDES) {
      const guide = readGuide(name)
      const starter = GUIDE_STARTERS[name]
      const app = path.join(work, `guide-${name}`)
      cpSync(path.join(fixtureRoot, 'guides', name), app, { recursive: true })
      for (const file of guide.files) {
        mkdirSync(path.dirname(path.join(app, file.path)), { recursive: true })
        writeFileSync(path.join(app, file.path), file.content)
      }
      const specs = (names) =>
        Object.fromEntries(names.map((dep) => [dep, tarballs[dep] ?? guideVersion(dep)]))
      writeFileSync(
        path.join(app, 'package.json'),
        `${JSON.stringify({ name: `packed-hozo-guide-${name}`, private: true, type: 'module', dependencies: specs([...starter.packages, ...guide.dependencies]), devDependencies: specs(guide.devDependencies) }, null, 2)}\n`,
      )
      writeFileSync(path.join(app, 'pnpm-workspace.yaml'), workspaceYaml(tarballs))
      pnpm(`install-guide-${name}`, ['install', '--ignore-scripts'], app)
      pnpm(`build-guide-${name}`, ['exec', starter.build, 'build'], app)
      const built = filesUnder(path.join(app, 'dist'))
        .filter((file) => /\.(?:js|css|html)$/.test(file))
        .map((file) => ({ file, content: readFileSync(file, 'utf8') }))
      const problems = guideOutputProblems(built)
      evidence.checks.push({
        name: `output-guide-${name}`,
        passed: problems.length === 0,
        problems,
      })
      save()
      assert.deepEqual(problems, [], `the ${name} guide's build is wrong`)
    }
    evidence.passed = true
  } catch (error) {
    evidence.error = String(error.stack ?? error)
    throw error
  } finally {
    evidence.finishedAt = new Date().toISOString()
    save()
    // Retain the isolated installs for debugging, including failed ones.
    console.log(`[packed-consumer] passed=${evidence.passed}; apps retained at ${work}`)
  }
}

async function browserCheck(app, output, evidence) {
  // The browser driver is a test tool, not a dependency available to the
  // consumer app. Vite and every Hozo import still resolve inside that app.
  const require = createRequire(path.join(root, 'examples/showcase/package.json'))
  const { chromium } = require('playwright-core')
  const executablePath = [
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: this standalone evidence run is never Turbo-cached.
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((file) => file && existsSync(file))
  assert.ok(executablePath, 'Chrome is required; set CHROME_PATH')
  const appRequire = createRequire(path.join(app, 'package.json'))
  const { preview } = await import(pathToFileURL(appRequire.resolve('vite')).href)
  const server = await preview({
    root: app,
    configFile: false,
    preview: { host: '127.0.0.1', port: 0 },
  })
  let browser
  let page
  const errors = []
  try {
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
    page = await browser.newPage()
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`)
    const button = page.getByRole('button', { name: 'Increment', exact: true })
    await button.waitFor()
    assert.equal(
      await button.evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(8, 124, 80)',
    )
    await button.click()
    await page.getByText('Count: 1', { exact: true }).waitFor()
    await button.focus()
    await page.keyboard.press('Enter')
    await page.getByText('Count: 2', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(output, 'web.png') })
    assert.deepEqual(errors, [])
    evidence.checks.push({ name: 'browser-ui-theme-pointer-keyboard', passed: true })
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(output, 'web-failed.png') }).catch(() => {})
    evidence.checks.push({
      name: 'browser-ui-theme-pointer-keyboard',
      passed: false,
      error: String(error),
    })
    throw error
  } finally {
    writeFileSync(path.join(output, 'browser.log'), `${errors.join('\n')}\n`)
    await browser?.close()
    await new Promise((resolve) => server.httpServer.close(resolve))
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main()
