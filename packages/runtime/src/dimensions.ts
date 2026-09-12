import { useSyncExternalStore } from 'react'

import { createStore } from './ambient.ts'

export interface ScaledSize {
  width: number
  height: number
  scale: number
  fontScale: number
}

export interface DimensionsValue {
  window: ScaledSize
  screen: ScaledSize
}

export type DimensionsChangeHandler = (value: DimensionsValue) => void

const zeroSize = Object.freeze({ width: 0, height: 0, scale: 1, fontScale: 1 })
const serverDimensions: DimensionsValue = Object.freeze({
  window: zeroSize,
  screen: zeroSize,
})

function sameSize(left: ScaledSize, right: ScaledSize) {
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.scale === right.scale &&
    left.fontScale === right.fontScale
  )
}

function sameDimensions(left: DimensionsValue, right: DimensionsValue) {
  return sameSize(left.window, right.window) && sameSize(left.screen, right.screen)
}

const store = createStore(serverDimensions, sameDimensions)
let listening = false

function canUseDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function readBrowserDimensions(): DimensionsValue {
  const pixelRatio = window.devicePixelRatio || 1
  const visualViewport = window.visualViewport
  const windowSize = visualViewport
    ? {
        width: Math.round(visualViewport.width * visualViewport.scale),
        height: Math.round(visualViewport.height * visualViewport.scale),
      }
    : {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      }
  return {
    window: { ...windowSize, scale: pixelRatio, fontScale: 1 },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      scale: pixelRatio,
      fontScale: 1,
    },
  }
}

function update() {
  if (canUseDom()) store.set(readBrowserDimensions())
}

function ensureListening() {
  if (!canUseDom()) return
  update()
  if (listening) return
  listening = true
  const resizeTarget = window.visualViewport ?? window
  resizeTarget.addEventListener('resize', update)
}

const subscriptions = new Map<DimensionsChangeHandler, Set<() => void>>()

/** The React Native Dimensions contract backed by the browser viewport. */
export const Dimensions = {
  get(name: keyof DimensionsValue): ScaledSize {
    ensureListening()
    const value = store.get()[name]
    if (!value) throw new Error(`No dimension set for key ${String(name)}`)
    return value
  },

  set(value: Partial<DimensionsValue> | undefined) {
    if (!value) return
    if (canUseDom()) throw new Error('Dimensions cannot be set in the browser')
    const current = store.get()
    store.set({
      window: value.window ?? current.window,
      screen: value.screen ?? current.screen,
    })
  },

  addEventListener(type: 'change', handler: DimensionsChangeHandler) {
    if (type !== 'change') throw new Error(`Unsupported Dimensions event: ${String(type)}`)
    ensureListening()
    const remove = store.subscribe(() => handler(store.get()))
    const removals = subscriptions.get(handler) ?? new Set()
    removals.add(remove)
    subscriptions.set(handler, removals)
    return {
      remove() {
        remove()
        removals.delete(remove)
        if (removals.size === 0) subscriptions.delete(handler)
      },
    }
  },

  /** @deprecated Use the subscription's `remove()` method. */
  removeEventListener(type: 'change', handler: DimensionsChangeHandler) {
    if (type !== 'change') return
    const removals = subscriptions.get(handler)
    if (!removals) return
    for (const remove of removals) remove()
    subscriptions.delete(handler)
  },
}

/** One shared browser subscription, with stable snapshots for React bail-outs. */
export function useWindowDimensions(): ScaledSize {
  return useSyncExternalStore(
    (listener) => {
      ensureListening()
      return store.subscribe(listener)
    },
    () => Dimensions.get('window'),
    () => store.get().window,
  )
}
