import assert from 'node:assert/strict'

export function nativeThemeFailures(bundle) {
  const marker = bundle.indexOf('you@example.com')
  assert.ok(marker >= 0, 'the compiled example App is not in the bundle')
  const start = bundle.lastIndexOf('__d(function', marker)
  const next = bundle.indexOf('__d(function', marker)
  assert.ok(start >= 0, 'the App has no Metro module boundary')
  const app = bundle.slice(start, next < 0 ? bundle.length : next)
  const failures = []
  if (!/paddingTop: 19\.2/.test(app)) failures.push('the project spacing scale reached the styles')
  if (!app.includes('#3581f6')) failures.push('the project colour resolved')
  if (/hozo-unresolved/.test(app)) failures.push('no colour was left unresolved')
  return failures
}
