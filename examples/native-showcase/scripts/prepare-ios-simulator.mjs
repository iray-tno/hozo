import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { prepareIosSimulator } from './ios-simulator.mjs'

const output = resolve(
  process.argv[2] ?? 'artifacts/native-showcase-ios/simulator-preparation.json',
)
mkdirSync(dirname(output), { recursive: true })
const observation = {}
const run = (command, args, timeout = 30_000) =>
  execFileSync(command, args, { timeout, maxBuffer: 16 * 1024 * 1024 })
try {
  const device = prepareIosSimulator(
    run,
    { udid: process.env.IOS_UDID, name: process.env.IOS_DEVICE },
    observation,
  )
  if (process.env.GITHUB_ENV) {
    assert.match(device.udid, /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i)
    appendFileSync(process.env.GITHUB_ENV, `IOS_UDID=${device.udid}\n`)
  }
  console.log(`Preparing exact iOS simulator ${device.name} (${device.udid}) during the build`)
} finally {
  writeFileSync(output, `${JSON.stringify(observation, null, 2)}\n`)
}
