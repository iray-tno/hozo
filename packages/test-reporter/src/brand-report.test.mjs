import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  brandReportFile,
  brandReportHtml,
  HOZO_BRAND_BUTTON,
  HOZO_BRAND_SCRIPT,
  HOZO_BRAND_STYLE,
} from './brand-report.mjs'

const MOCK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title> Hozo — Test Reports </title>
</head>
<body>
  <div id="app"></div>
</body>
</html>`

test('normalizes whitespace in title', () => {
  const result = brandReportHtml(MOCK_HTML)
  assert.match(result, /<title>Hozo — Test Reports<\/title>/)
})

test('injects og metadata into head', () => {
  const result = brandReportHtml(MOCK_HTML)
  assert.match(result, /<meta property="og:site_name" content="Hozo" \/>/)
  assert.match(result, /<meta property="og:title" content="Hozo — Test Reports" \/>/)
  assert.match(
    result,
    /<meta name="description" content="CI test reports for Hozo, universal UI compiler for React Native\." \/>/,
  )
})

test('injects brand style into head', () => {
  const result = brandReportHtml(MOCK_HTML)
  assert.ok(result.includes(HOZO_BRAND_STYLE))
  assert.match(result, /--hozo-btn-color: #c8a882;/)
  assert.match(result, /\[data-theme="light"\]/)
})

test('injects home button and mount script into body', () => {
  const result = brandReportHtml(MOCK_HTML)
  assert.ok(result.includes(HOZO_BRAND_BUTTON))
  assert.ok(result.includes(HOZO_BRAND_SCRIPT))
  assert.match(result, /href="\.\.\/"/)
  assert.match(result, /title="Back to Hozo LP Home"/)
  assert.match(result, /aria-label="Back to Hozo LP Home"/)
  assert.match(result, /MutationObserver/)
})

test('is idempotent when run repeatedly', () => {
  const once = brandReportHtml(MOCK_HTML)
  const twice = brandReportHtml(once)
  assert.equal(twice, once)
})

test('brandReportFile brands a file on disk', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hozo-brand-test-'))
  const testFile = join(directory, 'index.html')
  try {
    writeFileSync(testFile, MOCK_HTML, 'utf8')
    const success = brandReportFile(testFile)
    assert.equal(success, true)

    const content = readFileSync(testFile, 'utf8')
    assert.match(content, /<title>Hozo — Test Reports<\/title>/)
    assert.match(content, /id="hozo-back-home"/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('brandReportFile returns false for non-existent file', () => {
  const missingFile = join(tmpdir(), 'non-existent-report-dir', 'index.html')
  const success = brandReportFile(missingFile)
  assert.equal(success, false)
})
