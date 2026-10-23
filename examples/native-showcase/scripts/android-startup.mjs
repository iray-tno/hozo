import assert from 'node:assert/strict'
import { setTimeout as pause } from 'node:timers/promises'

export const ANDROID_INSTALL_TIMEOUT_MS = 120_000

export const SYSTEM_UI_SERVICE = 'com.android.systemui/.SystemUIService'

// Whether System UI has finished starting its service, from `dumpsys activity
// services`. Android prints `executeNesting=` on a ServiceRecord only while
// the service is being created or started, so a record without it is done.
// No record yet is not done either: the process has not got that far.
export function systemUiServiceState(dump) {
  if (!dump.includes('ServiceRecord{') || !dump.includes(SYSTEM_UI_SERVICE)) return 'absent'
  return /executeNesting=[1-9]/.test(dump) ? 'starting' : 'started'
}

// A connected adb transport (even sys.boot_completed) can precede the end
// of the boot animation and a responsive package manager. Only these
// read-only readiness observations are polled; installation is sent once.
export async function prepareAndroid(
  { read, install, now = Date.now, sleep = pause, timeoutMs = 90_000 },
  evidence,
) {
  const started = now()
  const startup = (evidence.startup = {
    phase: 'framework-ready',
    passed: false,
    readinessTimeoutMs: timeoutMs,
    installTimeoutMs: ANDROID_INSTALL_TIMEOUT_MS,
    observations: [],
  })
  let ready = false
  do {
    const sample = { elapsedMs: now() - started }
    startup.observations.push(sample)
    try {
      sample.bootCompleted = read(['shell', 'getprop', 'sys.boot_completed']).toString().trim()
      sample.bootAnimation = read(['shell', 'getprop', 'init.svc.bootanim']).toString().trim()
      // -no-boot-anim may never start the service, leaving its property empty.
      // Empty is not sufficient: boot completion and package-manager response
      // must also be observed. Unknown/non-stopped service states stay unready.
      if (sample.bootCompleted === '1' && ['', 'stopped'].includes(sample.bootAnimation)) {
        sample.packagePath = read(['shell', 'pm', 'path', 'android']).toString().trim()
        // `sys.boot_completed` arrives while System UI is still starting its
        // service on a cold boot. An install started then -- twenty seconds
        // of dex2oat on the runner's two cores -- held it past the 20-second
        // service timeout, and its ANR dialog covered the showcase (#1172:
        // SystemUIService began at 05:25:49, the install at 05:25:58, the
        // ANR at 05:26:09). So the install waits for that service to finish.
        if (/^package:\//.test(sample.packagePath)) {
          sample.systemUi = systemUiServiceState(
            read(['shell', 'dumpsys', 'activity', 'services', SYSTEM_UI_SERVICE]).toString(),
          )
          ready = sample.systemUi === 'started'
        }
      }
    } catch (error) {
      sample.error = String(error)
    }
    sample.ready = ready
    sample.completedMs = now() - started
    if (sample.completedMs > timeoutMs) throw new Error('Android framework readiness timed out')
    if (ready) break
    if (now() - started >= timeoutMs) throw new Error('Android framework readiness timed out')
    await sleep(Math.min(1_000, timeoutMs - (now() - started)))
  } while (now() - started <= timeoutMs)
  assert.ok(ready, 'Android framework readiness timed out')
  startup.readinessMs = now() - started
  startup.phase = 'install'
  const installationStarted = now()
  try {
    // Cold first-install work is not a tap/pixel deadline. Leave all those
    // deadlines unchanged and retain an install failure instead of retrying it.
    startup.installResponse = install(ANDROID_INSTALL_TIMEOUT_MS).toString().trim()
    assert.match(startup.installResponse, /\bSuccess\b/, 'Android did not confirm APK installation')
    startup.phase = 'ready'
    startup.passed = true
  } finally {
    startup.installMs = now() - installationStarted
  }
}
