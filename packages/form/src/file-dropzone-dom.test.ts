import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FileDropzone } from './index.ts'

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(
      FileDropzone,
      { accessibilityLabel: 'Upload photo', ...props },
      'Drop a photo here',
    ),
  )

test('the zone is a button named for what it does, holding its instruction', () => {
  const html = render({})
  assert.match(
    html,
    /^<button type="button" aria-label="Upload photo">Drop a photo here<\/button>/,
    html,
  )
})

test('the picker is a file input kept out of the tab order and the tree', () => {
  const html = render({ accept: ['image/png', '.pdf'], multiple: true })
  assert.match(
    html,
    /<input type="file" accept="image\/png,.pdf" multiple="" tabindex="-1" aria-hidden="true" hidden=""\/>/,
    html,
  )
})

test('a polite live region is there before anything is picked, so the first announcement is heard', () => {
  assert.match(render({}), /role="status" aria-live="polite"/)
})

test('disabled reaches the button and the input', () => {
  const html = render({ disabled: true })
  assert.match(html, /<button type="button" aria-label="Upload photo" disabled="">/, html)
  assert.match(html, /<input type="file" disabled=""/, html)
})
