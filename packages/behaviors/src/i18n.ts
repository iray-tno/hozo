// How Hozo's own strings and locale reach an application's i18n library
// (decision 008).
//
// Hozo does not translate. Applications already have a library for that --
// i18next, react-intl, Lingui -- with plural rules, interpolation and
// catalogues, and Hozo's strings belong in the same catalogue as the rest.
// So this is only the connection: a context carrying `locale`, `dir` and a
// `translate` function, the English every component falls back to, and two
// adapters that are a few lines each and typed structurally, so no
// `@hozo/*` package depends on any library.
//
// Platform-neutral on purpose: one file, imported by both entry points, so a
// provider on one side is the same object on the other.

import { createContext, createElement, type ReactNode, useCallback, useContext } from 'react'

/**
 * Every string Hozo's components show or announce, in English, by key.
 *
 * Exported so a project can seed its catalogue from it, and so a test can
 * check none is missing. Parameters are named (`{remaining}`), because every
 * library this connects to interpolates by name.
 */
export const hozoMessages = {
  'hozo.badge.overflow': 'more than {max}',
  'hozo.bottomSheet.handle': 'Resize',
  'hozo.calendar.nextMonth': 'Next month',
  'hozo.calendar.previousMonth': 'Previous month',
  'hozo.calendar.rangeEnd': 'end of range',
  'hozo.calendar.rangeStart': 'start of range',
  'hozo.calendar.today': 'today',
  'hozo.datePicker.dialog': 'Choose a date',
  'hozo.dateRangePicker.dialog': 'Choose a range of dates',
  'hozo.dateTimePicker.dialog': 'Choose a date and time',
  'hozo.dateTimePicker.done': 'Done',
  'hozo.nativeSelect.cancel': 'Cancel',
  'hozo.textArea.remaining': '{remaining} of {maxLength} characters left',
  'hozo.timePicker.decrease': 'Decrease',
  'hozo.timePicker.empty': '--',
  'hozo.timePicker.hour': 'Hour',
  'hozo.timePicker.increase': 'Increase',
  'hozo.timePicker.minute': 'Minute',
  'hozo.timePicker.period': 'AM or PM',
} as const

export type HozoMessageKey = keyof typeof hozoMessages
export type HozoMessageParams = Readonly<Record<string, string | number>>

export interface HozoI18n {
  /** BCP 47. Used for `Intl`: dates, numbers, the first day of the week. */
  locale?: string
  /**
   * Which way the content runs. Read by behaviours that cannot ask the
   * platform; never applied. The Web's direction is `<html dir>` and
   * Native's is `I18nManager`, and both are the application's to set.
   */
  dir?: 'ltr' | 'rtl'
  /**
   * The project's translation of `key`. `fallback` is Hozo's English with
   * `params` already filled in, for a library that shows its default when a
   * key is missing.
   */
  translate?: (key: HozoMessageKey, params: HozoMessageParams, fallback: string) => string
}

const HozoI18nContext = createContext<HozoI18n>({})

export interface HozoI18nProviderProps {
  value: HozoI18n
  children?: ReactNode
}

/**
 * Puts a project's i18n where Hozo's components can read it.
 *
 * Give it a new `value` when the language changes -- `useMemo` on the
 * language -- and every Hozo string below re-renders in it.
 */
export function HozoI18nProvider({ value, children }: HozoI18nProviderProps) {
  return createElement(HozoI18nContext.Provider, { value }, children)
}

export function useHozoI18n(): HozoI18n {
  return useContext(HozoI18nContext)
}

function interpolate(template: string, params: HozoMessageParams): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  )
}

/**
 * A function resolving one of Hozo's strings: the component's own prop if
 * there is one, then the project's translation, then Hozo's English.
 */
export function useHozoMessage() {
  const { translate } = useHozoI18n()
  return useCallback(
    (key: HozoMessageKey, params: HozoMessageParams = {}, explicit?: string): string => {
      if (explicit !== undefined) return explicit
      const fallback = interpolate(hozoMessages[key], params)
      return translate ? translate(key, params, fallback) : fallback
    },
    [translate],
  )
}

/** The part of an i18next instance this reads. */
export interface I18nextLike {
  t(key: string, options?: Record<string, unknown>): string
  language?: string
  dir?(language?: string): 'ltr' | 'rtl'
}

/**
 * Hozo's i18n from an i18next instance: Hozo's keys are i18next keys, and
 * Hozo's English is i18next's `defaultValue`.
 */
export function fromI18next(i18n: I18nextLike): HozoI18n {
  return {
    locale: i18n.language,
    dir: i18n.dir?.(i18n.language),
    translate: (key, params, fallback) => i18n.t(key, { ...params, defaultValue: fallback }),
  }
}

/** The part of a react-intl `IntlShape` this reads. */
export interface ReactIntlLike {
  formatMessage(
    descriptor: { id: string; defaultMessage?: string },
    values?: Record<string, string | number>,
  ): string
  locale?: string
}

/**
 * Hozo's i18n from react-intl: Hozo's keys are message ids, and Hozo's
 * English is the `defaultMessage`.
 */
export function fromReactIntl(intl: ReactIntlLike): HozoI18n {
  return {
    locale: intl.locale,
    translate: (key, params, fallback) =>
      intl.formatMessage({ id: key, defaultMessage: fallback }, params),
  }
}
