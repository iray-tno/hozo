// An owned, silent AVC fixture, not an external server or third-party movie.
// Regeneration is manual; tests consume the checked-in bytes.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((candidate) => candidate && existsSync(candidate))
if (!executablePath) throw new Error('Generating the MP4 fixture requires Chrome; set CHROME_PATH')
const browser = await chromium.launch({ executablePath, headless: true })
try {
  const page = await browser.newPage()
  const bytes = await page.evaluate(async () => {
    const mimeType = 'video/mp4;codecs=avc1.42001E'
    if (!MediaRecorder.isTypeSupported(mimeType))
      throw new Error('Chrome must support AVC recording')
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    const context = canvas.getContext('2d')
    const stream = canvas.captureStream(10)
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 120_000 })
    const parts = []
    recorder.ondataavailable = ({ data }) => parts.push(data)
    const done = new Promise((resolve, reject) => {
      recorder.onstop = resolve
      recorder.onerror = reject
    })
    recorder.start()
    for (let frame = 0; frame < 40; frame++) {
      context.fillStyle = '#0f172b'
      context.fillRect(0, 0, 320, 180)
      context.fillStyle = '#818cf8'
      context.fillRect(20 + frame * 6, 65, 40, 40)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    recorder.stop()
    await done
    for (const track of stream.getTracks()) track.stop()
    return Array.from(new Uint8Array(await new Blob(parts, { type: mimeType }).arrayBuffer()))
  })
  const output = fileURLToPath(new URL('../assets/', import.meta.url))
  mkdirSync(output, { recursive: true })
  const buffer = Buffer.from(bytes)
  writeFileSync(`${output}/hozo-video.mp4`, buffer)
  console.log(
    `Generated ${buffer.length} bytes; sha256 ${createHash('sha256').update(buffer).digest('hex')}`,
  )
} finally {
  await browser.close()
}
