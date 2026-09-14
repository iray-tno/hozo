import { type ComponentType, createElement, type ReactNode } from 'react'

/** Props handed to a platform component that can blur content behind itself. */
export interface HozoBackdropFilterAdapterProps {
  blurRadius: number
  children?: ReactNode
  style?: unknown
  [name: string]: unknown
}

export type HozoBackdropFilterAdapter = ComponentType<HozoBackdropFilterAdapterProps>

let backdropFilterAdapter: HozoBackdropFilterAdapter | undefined

/**
 * Installs the Native implementation used by compiled `backdropFilter` styles.
 *
 * Configuration is explicit because React Native has no backdrop-filter style
 * and loading Expo unconditionally would make it a dependency of every app.
 * Configure this once during application startup. The returned cleanup is
 * primarily useful for isolated tests.
 */
export function configureHozoBackdropFilter(adapter: HozoBackdropFilterAdapter): () => void {
  const previous = backdropFilterAdapter
  backdropFilterAdapter = adapter
  return () => {
    if (backdropFilterAdapter === adapter) backdropFilterAdapter = previous
  }
}

/** @internal Used by the Native wrapper emitted by the compiler. */
export function hozoBackdropFilterAdapter(): HozoBackdropFilterAdapter | undefined {
  return backdropFilterAdapter
}

export interface ExpoBlurAdapterOptions<Props extends object> {
  /** Expo intensity is not a CSS pixel radius, so applications may calibrate it. */
  intensityForRadius?: (radius: number) => number
  /** Expo-version-specific props such as Android blurMethod and blurTarget. */
  props?: Partial<Props>
}

/**
 * Adapts Expo BlurView without making `expo-blur` a dependency of Hozo.
 *
 * The default maps the common 0-25px CSS range onto Expo's 0-100 intensity
 * range. Apps that need visual calibration can replace the mapping.
 */
export function createExpoBlurAdapter<Props extends { intensity?: number }>(
  BlurView: ComponentType<Props>,
  options: ExpoBlurAdapterOptions<Props> = {},
): HozoBackdropFilterAdapter {
  const intensityForRadius =
    options.intensityForRadius ?? ((radius: number) => Math.min(100, Math.max(0, radius * 4)))

  function ExpoBlurAdapter({ blurRadius, ...props }: HozoBackdropFilterAdapterProps) {
    return createElement(BlurView, {
      ...options.props,
      ...props,
      intensity: intensityForRadius(blurRadius),
    } as Props)
  }

  ExpoBlurAdapter.displayName = 'HozoExpoBlurAdapter'
  return ExpoBlurAdapter
}
