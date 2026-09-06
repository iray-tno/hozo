import { createElement, type ReactElement } from 'react'
import type { ViewProps } from 'react-native'

import { hozoBackdropFilterAdapter } from './backdrop.ts'

export interface HozoBackdropFilterProps extends ViewProps {
  hozoBlurRadius: number
}

/** Native component boundary for the opt-in backdrop-filter adapter. */
export function HozoBackdropFilter({
  hozoBlurRadius,
  ...props
}: HozoBackdropFilterProps): ReactElement {
  const Adapter = hozoBackdropFilterAdapter()
  if (!Adapter) {
    throw new Error(
      '[hozo] backdropFilter needs a Native adapter. Configure one with ' +
        'configureHozoBackdropFilter(createExpoBlurAdapter(BlurView, options)).',
    )
  }
  return createElement(Adapter, { ...props, blurRadius: hozoBlurRadius })
}
