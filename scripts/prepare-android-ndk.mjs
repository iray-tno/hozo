// Keep SDK acquisition out of Gradle's app-build result (#952). sdkmanager
// owns archive verification; this wrapper records its decision and checks the
// installed toolchain, not merely the installer's sometimes-successful exit.
import { spawn } from 'node:child_process'
import {
  accessSync,
  constants,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  statfsSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

export function ndkVersion(project) {
  const source = readFileSync(path.join(project, 'build.gradle'), 'utf8')
  const versions = [...source.matchAll(/^\s*ndkVersion\s*=\s*"(\d+\.\d+\.\d+)"\s*$/gm)]
  if (versions.length !== 1) throw new Error('Expected one pinned ndkVersion in build.gradle')
  return versions[0][1]
}

export function validateNdk(directory, version) {
  const revision = readFileSync(path.join(directory, 'source.properties'), 'utf8').match(
    /^Pkg\.Revision\s*=\s*(\S+)\s*$/m,
  )?.[1]
  if (revision !== version) throw new Error(`NDK revision ${revision} does not match ${version}`)
  for (const file of ['ndk-build', 'toolchains/llvm/prebuilt/linux-x86_64/bin/clang']) {
    accessSync(path.join(directory, file), constants.X_OK)
  }
  accessSync(
    path.join(directory, 'toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/include/stdlib.h'),
  )
}

// Deliberately not a generic network/build retry. Licenses, missing packages,
// permissions, timeouts and arbitrary failures stop on their first attempt.
export function isArchiveFailure(result) {
  return (
    !result.error &&
    !result.signal &&
    !/No space left on device|Permission denied|licenses?.*(?:not accepted|not been accepted)|Failed to find package/i.test(
      result.log,
    ) &&
    /(?:Archive is not a ZIP archive|Error reading Zip content from a SeekableByteChannel)/i.test(
      result.log,
    )
  )
}

export function runInstaller(command, args, { env, logFile, timeout = 600_000 }) {
  return new Promise((resolve) => {
    let log = ''
    let error
    const child = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
      killSignal: 'SIGKILL',
    })
    const record = (chunk) => {
      log += chunk.toString()
      process.stdout.write(chunk)
    }
    child.stdout.on('data', record)
    child.stderr.on('data', record)
    child.on('error', (cause) => {
      error = cause.message
    })
    child.on('close', (code, signal) => {
      writeFileSync(logFile, log)
      resolve({ code, signal, error, log })
    })
  })
}

function filesystemFacts(directory) {
  try {
    const disk = statfsSync(directory)
    return { availableBytes: disk.bavail * disk.bsize }
  } catch (error) {
    return { error: error.message }
  }
}

function directoryFacts(directory) {
  try {
    return {
      directory,
      entries: readdirSync(directory)
        .slice(0, 50)
        .map((name) => {
          const stat = lstatSync(path.join(directory, name))
          return { name, bytes: stat.size, directory: stat.isDirectory() }
        }),
    }
  } catch (error) {
    return { directory, error: error.message }
  }
}

export async function prepareAndroidNdk({
  project,
  sdkRoot,
  output,
  toolSdkRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT,
  temporaryRoot = process.env.RUNNER_TEMP ?? tmpdir(),
  env = process.env,
  install = runInstaller,
  warn = (message) => console.warn(`::warning::${message}`),
}) {
  sdkRoot = path.resolve(sdkRoot)
  output = path.resolve(output)
  mkdirSync(output, { recursive: true })
  const report = { passed: false, driverCommit: env.GITHUB_SHA, attempts: [] }
  const save = () =>
    writeFileSync(path.join(output, 'result.json'), `${JSON.stringify(report, null, 2)}\n`)
  try {
    const version = ndkVersion(project)
    report.version = version
    report.sdkRoot = sdkRoot
    mkdirSync(sdkRoot, { recursive: true })
    const target = path.join(sdkRoot, 'ndk', version)
    if (existsSync(target)) {
      // Never delete or overwrite a runner's existing toolchain, even a broken
      // one. Incomplete preinstalls are actionable failures, not cache hits.
      validateNdk(target, version)
      report.reused = true
    } else {
      report.reused = false
      const command = path.join(toolSdkRoot, 'cmdline-tools/latest/bin/sdkmanager')
      for (let number = 1; number <= 2; number++) {
        // Separate SDK roots AND user caches prevent reusing a corrupt first
        // download. Only this exact mkdtemp directory belongs to this attempt;
        // preserve it for investigation rather than deleting shared SDK data.
        const stage = mkdtempSync(path.join(temporaryRoot, 'hozo-ndk-'))
        const userHome = path.join(stage, 'user-home')
        mkdirSync(userHome)
        const licenses = path.join(toolSdkRoot, 'licenses')
        if (existsSync(licenses))
          cpSync(licenses, path.join(stage, 'licenses'), { recursive: true })
        const args = [`--sdk_root=${stage}`, '--verbose', '--install', `ndk;${version}`]
        const attempt = {
          number,
          stage,
          command,
          args,
          startedAt: new Date().toISOString(),
          diskBefore: filesystemFacts(stage),
        }
        report.attempts.push(attempt)
        save()
        const result = await install(command, args, {
          env: { ...env, ANDROID_USER_HOME: userHome },
          logFile: path.join(output, `attempt-${number}.log`),
        })
        Object.assign(attempt, {
          code: result.code,
          signal: result.signal,
          error: result.error,
          finishedAt: new Date().toISOString(),
          diskAfter: filesystemFacts(stage),
          directories: ['.temp', 'ndk', 'user-home/cache'].map((dir) =>
            directoryFacts(path.join(stage, dir)),
          ),
        })
        const stagedNdk = path.join(stage, 'ndk', version)
        let validationError
        try {
          validateNdk(stagedNdk, version)
        } catch (error) {
          validationError = error.message
        }
        attempt.validationError = validationError
        // Some SDK tool failures print warnings yet exit zero. Both the exit
        // AND installed payload must pass; an archive warning cannot be success.
        if (
          result.code === 0 &&
          !result.error &&
          !result.signal &&
          !isArchiveFailure(result) &&
          !validationError
        ) {
          mkdirSync(path.dirname(target), { recursive: true })
          if (existsSync(target))
            throw new Error(`NDK target appeared during preparation: ${target}`)
          try {
            renameSync(stagedNdk, target)
          } catch (error) {
            if (error.code !== 'EXDEV') throw error
            cpSync(stagedNdk, target, { recursive: true, force: false, errorOnExist: true })
          }
          validateNdk(target, version)
          attempt.passed = true
          break
        }
        attempt.passed = false
        attempt.archiveFailure = isArchiveFailure(result)
        save()
        if (number === 1 && attempt.archiveFailure) {
          warn(
            'NDK archive preparation failed; retrying acquisition once with a fresh SDK/cache. First log retained (#952).',
          )
          continue
        }
        throw new Error(
          `NDK acquisition failed on attempt ${number}: ${result.error ?? result.signal ?? validationError ?? `exit ${result.code}`}`,
        )
      }
    }
    report.passed = true
    return report
  } catch (error) {
    report.error = error.message
    throw error
  } finally {
    save()
  }
}

if (import.meta.filename === process.argv[1]) {
  const { values } = parseArgs({
    options: {
      project: { type: 'string', default: 'examples/native-demo/android' },
      'sdk-root': { type: 'string' },
      output: { type: 'string', default: 'artifacts/android-ndk' },
    },
  })
  const toolSdkRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
  if (process.platform !== 'linux' || !toolSdkRoot) {
    throw new Error('NDK preparation requires Linux and ANDROID_HOME or ANDROID_SDK_ROOT')
  }
  await prepareAndroidNdk({
    project: values.project,
    sdkRoot: values['sdk-root'] ?? toolSdkRoot,
    output: values.output,
    toolSdkRoot,
  })
}
