import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { useColorScheme } from './color-scheme.ts'

test('useColorScheme has the same light server fallback as React Native Web', () => {
  function Probe() {
    return createElement('span', null, useColorScheme())
  }

  assert.equal(renderToStaticMarkup(createElement(Probe)), '<span>light</span>')
})
