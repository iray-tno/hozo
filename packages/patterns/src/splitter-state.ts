import { useRef, useState } from 'react'

export type SplitterSide = 'start' | 'end' | 'top' | 'bottom'

export interface SplitterSizeProps {
  min: number
  max: number
  size?: number
  defaultSize?: number
  onSizeChange?: (size: number) => void
  onSizeCommit?: (size: number) => void
  /** A cancelled drag restores its starting size without committing it. */
  onSizeCancel?: () => void
  step?: number
  bigStep?: number
  /** Alias of bigStep, matching the original RFC. bigStep takes precedence. */
  largeStep?: number
  collapsible?: boolean
  collapsedSize?: number
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  valueText?: (size: number) => string
}

export function splitterSign(side: SplitterSide) {
  return side === 'end' || side === 'bottom' ? -1 : 1
}

export function splitterKey(key: string, side: SplitterSide, rtl: boolean): number | null {
  const sign = splitterSign(side)
  if (side === 'start' || side === 'end') {
    if (key === 'ArrowRight') return sign * (rtl ? -1 : 1)
    if (key === 'ArrowLeft') return -sign * (rtl ? -1 : 1)
  } else {
    if (key === 'ArrowDown') return sign
    if (key === 'ArrowUp') return -sign
  }
  return null
}

export function useSplitterState(props: SplitterSizeProps) {
  const { min, max, step = 8, bigStep = props.largeStep ?? 32, collapsedSize = 0 } = props
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min)
    throw new RangeError('Splitter requires finite 0 <= min <= max')
  if (![step, bigStep].every((value) => Number.isFinite(value) && value > 0))
    throw new RangeError('Splitter steps must be finite and positive')
  if (!Number.isFinite(collapsedSize) || collapsedSize < 0 || collapsedSize > min)
    throw new RangeError('Splitter collapsedSize must be between zero and min')
  const clamp = (value: number) =>
    Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
  const [uncontrolled, setUncontrolled] = useState(() => clamp(props.defaultSize ?? min))
  const [closed, setClosed] = useState(false)
  const collapsed = Boolean(props.collapsible && (props.collapsed ?? closed))
  const expanded = clamp(props.size ?? uncontrolled)
  const current = collapsed ? collapsedSize : expanded
  const remembered = useRef(expanded)
  const gesture = useRef({ start: current, latest: current, collapsed, expanded })
  const active = useRef(false)
  if (!active.current) gesture.current.latest = current
  if (!collapsed) remembered.current = expanded
  const setCollapsed = (next: boolean) => {
    if (props.collapsed === undefined) setClosed(next)
    if (next !== collapsed) props.onCollapsedChange?.(next)
  }
  const change = (value: number) => {
    const next = clamp(value)
    if (collapsed) setCollapsed(false)
    if (props.size === undefined) setUncontrolled(next)
    if (next !== gesture.current.latest || collapsed) props.onSizeChange?.(next)
    gesture.current.latest = next
    return next
  }
  const commit = (next: number) => props.onSizeCommit?.(next)
  return {
    current,
    expanded,
    collapsed,
    min,
    max,
    step,
    bigStep,
    collapsedSize,
    collapsible: Boolean(props.collapsible),
    change,
    commit,
    begin() {
      active.current = true
      gesture.current = { start: current, latest: current, collapsed, expanded }
    },
    move(delta: number) {
      return change(gesture.current.start + delta)
    },
    end(delta: number) {
      commit(change(gesture.current.start + delta))
      active.current = false
    },
    cancel() {
      active.current = false
      const start = gesture.current
      if (props.size === undefined) setUncontrolled(clamp(start.expanded))
      remembered.current = start.expanded
      if (props.collapsed === undefined) setClosed(start.collapsed)
      if (start.collapsed !== collapsed) props.onCollapsedChange?.(start.collapsed)
      if (start.latest !== start.start) props.onSizeChange?.(start.start)
      props.onSizeCancel?.()
    },
    toggle() {
      if (!props.collapsible) return
      const next = collapsed ? clamp(remembered.current) : collapsedSize
      if (collapsed && props.size === undefined) setUncontrolled(next)
      setCollapsed(!collapsed)
      props.onSizeChange?.(next)
      commit(next)
    },
    key(key: string, side: SplitterSide, rtl: boolean, shift = false) {
      if (key === 'Enter' && props.collapsible) {
        this.toggle()
        return true
      }
      const direction = splitterKey(key, side, rtl)
      const next =
        key === 'Home'
          ? min
          : key === 'End'
            ? max
            : key === 'PageUp'
              ? current + bigStep
              : key === 'PageDown'
                ? current - bigStep
                : direction === null
                  ? null
                  : current + direction * (shift ? bigStep : step)
      if (next === null) return false
      gesture.current.latest = current
      commit(change(next))
      return true
    },
  }
}

export type SplitterState = ReturnType<typeof useSplitterState>
