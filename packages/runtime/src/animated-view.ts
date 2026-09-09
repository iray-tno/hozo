import { createElement, forwardRef, type Ref, useEffect, useMemo, useReducer } from 'react'

import type { HozoDomStyle } from './dom-style.ts'
import { HozoView, type HozoViewProps } from './view.ts'

interface AnimatedNode {
  __getValue(): unknown
  addListener?(listener: (state: { value: unknown }) => void): string | number
  removeListener?(id: string | number): void
}

function isAnimatedNode(value: unknown): value is AnimatedNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<AnimatedNode>).__getValue === 'function'
  )
}

function collectAnimatedNodes(value: unknown, nodes: Set<AnimatedNode>, seen: Set<object>) {
  if (isAnimatedNode(value)) {
    nodes.add(value)
    return
  }
  if (typeof value !== 'object' || value === null || seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    for (const part of value) collectAnimatedNodes(part, nodes, seen)
  } else {
    for (const part of Object.values(value)) collectAnimatedNodes(part, nodes, seen)
  }
}

function resolveAnimated(value: unknown, seen = new Map<object, unknown>()): unknown {
  if (isAnimatedNode(value)) return resolveAnimated(value.__getValue(), seen)
  if (typeof value !== 'object' || value === null) return value
  const known = seen.get(value)
  if (known) return known
  if (Array.isArray(value)) {
    const resolved: unknown[] = []
    seen.set(value, resolved)
    for (const part of value) resolved.push(resolveAnimated(part, seen))
    return resolved
  }
  const resolved: Record<string, unknown> = {}
  seen.set(value, resolved)
  for (const [key, part] of Object.entries(value)) resolved[key] = resolveAnimated(part, seen)
  return resolved
}

export interface HozoAnimatedViewProps extends Omit<HozoViewProps, 'style'> {
  style?: HozoDomStyle
}

/** A DOM View that subscribes only when its style actually contains Animated nodes. */
export const HozoAnimatedView = forwardRef<HTMLDivElement, HozoAnimatedViewProps>(
  function HozoAnimatedView({ style, ...props }, ref: Ref<HTMLDivElement>) {
    const [, redraw] = useReducer((version: number) => version + 1, 0)
    const nodes = useMemo(() => {
      const found = new Set<AnimatedNode>()
      collectAnimatedNodes(style, found, new Set())
      return found
    }, [style])

    useEffect(() => {
      const subscriptions: Array<[AnimatedNode, string | number]> = []
      for (const node of nodes) {
        const id = node.addListener?.(() => redraw())
        if (id !== undefined) subscriptions.push([node, id])
      }
      return () => {
        for (const [node, id] of subscriptions) node.removeListener?.(id)
      }
    }, [nodes])

    return createElement(HozoView, {
      ...props,
      ref,
      style: resolveAnimated(style) as HozoDomStyle,
    })
  },
)
