import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoModal } from './modal.ts'

test('Modal renders one top-layer surface with Native intent markers', () => {
  const html = renderToStaticMarkup(
    createElement(
      HozoModal,
      {
        animationType: 'fade',
        presentationStyle: 'formSheet',
        style: [{ padding: 8 }, { padding: 16 }],
        testID: 'settings-modal',
        transparent: true,
        visible: true,
      },
      'Settings',
    ),
  )

  assert.match(html, /^<dialog/)
  assert.match(html, /data-hozo-modal=""/)
  assert.match(html, /data-hozo-transparent=""/)
  assert.match(html, /data-hozo-animation="fade"/)
  assert.match(html, /data-hozo-presentation="formSheet"/)
  assert.match(html, /padding:16px/)
  assert.match(html, />Settings<\/dialog>$/)
})
