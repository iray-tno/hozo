import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  fromI18next,
  fromReactIntl,
  type HozoI18n,
  HozoI18nProvider,
  type HozoMessageKey,
  type HozoMessageParams,
  hozoMessages,
  useHozoI18n,
  useHozoMessage,
} from './i18n.ts'

/** Renders one resolved message, under a provider if one is given. */
function resolve(
  key: HozoMessageKey,
  options: { value?: HozoI18n; params?: HozoMessageParams; explicit?: string } = {},
) {
  function Probe() {
    const message = useHozoMessage()
    return createElement('output', null, message(key, options.params, options.explicit))
  }
  const probe = createElement(Probe)
  const tree = options.value
    ? createElement(HozoI18nProvider, { value: options.value }, probe)
    : probe
  return renderToStaticMarkup(tree).replace(/^<output>|<\/output>$/g, '')
}

test('without a provider a string is Hozo’s English, with its parameters filled in', () => {
  assert.equal(resolve('hozo.calendar.previousMonth'), 'Previous month')
  assert.equal(
    resolve('hozo.textArea.remaining', { params: { remaining: 12, maxLength: 200 } }),
    '12 of 200 characters left',
  )
})

test('the provider translates, and is handed the English as its fallback', () => {
  const seen: unknown[] = []
  const value: HozoI18n = {
    translate: (key, params, fallback) => {
      seen.push([key, params, fallback])
      return key === 'hozo.calendar.previousMonth' ? '前の月' : fallback
    },
  }
  assert.equal(resolve('hozo.calendar.previousMonth', { value }), '前の月')
  assert.equal(
    resolve('hozo.textArea.remaining', { value, params: { remaining: 3, maxLength: 10 } }),
    '3 of 10 characters left',
  )
  assert.deepEqual(seen[1], [
    'hozo.textArea.remaining',
    { remaining: 3, maxLength: 10 },
    '3 of 10 characters left',
  ])
})

test('a component’s own prop wins over the provider', () => {
  const value: HozoI18n = { translate: () => 'translated' }
  assert.equal(resolve('hozo.calendar.previousMonth', { value, explicit: 'Earlier' }), 'Earlier')
})

test('the i18next adapter passes the English as defaultValue, and reads locale and direction', () => {
  const calls: unknown[] = []
  const i18n = fromI18next({
    language: 'ar',
    dir: (language) => (language === 'ar' ? 'rtl' : 'ltr'),
    t: (key, options) => {
      calls.push([key, options])
      return 'ترجمة'
    },
  })
  assert.equal(i18n.locale, 'ar')
  assert.equal(i18n.dir, 'rtl')
  assert.equal(i18n.translate?.('hozo.nativeSelect.cancel', {}, 'Cancel'), 'ترجمة')
  assert.deepEqual(calls[0], ['hozo.nativeSelect.cancel', { defaultValue: 'Cancel' }])
})

test('the react-intl adapter uses the key as the id and the English as defaultMessage', () => {
  const calls: unknown[] = []
  const i18n = fromReactIntl({
    locale: 'ja-JP',
    formatMessage: (descriptor, values) => {
      calls.push([descriptor, values])
      return 'キャンセル'
    },
  })
  assert.equal(i18n.locale, 'ja-JP')
  assert.equal(i18n.translate?.('hozo.nativeSelect.cancel', {}, 'Cancel'), 'キャンセル')
  assert.deepEqual(calls[0], [{ id: 'hozo.nativeSelect.cancel', defaultMessage: 'Cancel' }, {}])
})

test('every key is namespaced under hozo., so a project catalogue can hold them beside its own', () => {
  for (const key of Object.keys(hozoMessages)) assert.match(key, /^hozo\.[a-zA-Z]+\.[a-zA-Z]+$/)
})

test('without a provider the context is empty rather than missing', () => {
  function Probe() {
    return createElement('output', null, JSON.stringify(useHozoI18n()))
  }
  assert.equal(renderToStaticMarkup(createElement(Probe)), '<output>{}</output>')
})
