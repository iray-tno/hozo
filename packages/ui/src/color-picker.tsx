/**
 * A colour picker with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is the pattern's: swatches as a radio group, hue,
 * saturation and lightness as sliders that say their value in words, the
 * hex as a field. This file draws round swatches with a ring on the chosen
 * one, rounded tracks the pattern paints with the colour, and a thumb.
 */

import { ColorPicker, type ColorPickerProps, cx } from '@hozo/core'
import type { ColorPickerThumbLook } from '@hozo/patterns'

export type HozoColorPickerProps = ColorPickerProps

const root = 'flex flex-col gap-3'
const swatch =
  'size-8 rounded-full border border-hozo-border cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'
const selected = 'ring-2 ring-offset-2 ring-hozo-accent'
const slider = 'relative h-3 w-full rounded-full'
// `-ms-3` is half the `size-6` thumb, taken off its inline start so it
// centres on `insetInlineStart` in both LTR and RTL (as `slider.tsx` does).
const thumb =
  'absolute top-1/2 -ms-3 size-6 -translate-y-1/2 rounded-full border-2 bg-transparent shadow-hozo-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'

export const colorThumbLook: ColorPickerThumbLook = ({ color }) => {
  const linear = (at: number) => {
    const channel = Number.parseInt(color.slice(at, at + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5)
  // Equal black/white contrast at sqrt(1.05 * .05) - .05. The opposite
  // outline keeps the circle visible where a gradient changes under its
  // edge, or alpha reveals a surface whose color the picker cannot know.
  return {
    className:
      luminance > Math.sqrt(1.05 * 0.05) - 0.05
        ? 'border-hozo-marker-on-light outline-1 outline-hozo-marker-on-dark'
        : 'border-hozo-marker-on-dark outline-1 outline-hozo-marker-on-light',
  }
}
const input =
  'w-32 rounded-hozo-control border border-hozo-border-strong bg-hozo-surface px-3 py-2 font-mono text-sm text-hozo-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'
const eyeDropper =
  'self-start rounded-hozo-control border border-hozo-border px-3 py-2 text-sm text-hozo-text-body hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'

// Not named `HozoColorPicker` here: compiled output imports a runtime
// component under that name for the `<ColorPicker>` below (#670).
function StyledColorPicker({
  className,
  swatchClassName,
  selectedSwatchClassName,
  sliderClassName,
  thumbClassName,
  thumbLook = colorThumbLook,
  inputClassName,
  eyeDropperClassName,
  ...rest
}: HozoColorPickerProps) {
  return (
    <ColorPicker
      {...rest}
      className={cx(root, className)}
      swatchClassName={cx(swatch, swatchClassName)}
      selectedSwatchClassName={cx(selected, selectedSwatchClassName)}
      sliderClassName={cx(slider, sliderClassName)}
      thumbClassName={cx(thumb, thumbClassName)}
      thumbLook={thumbLook}
      inputClassName={cx(input, inputClassName)}
      eyeDropperClassName={cx(eyeDropper, eyeDropperClassName)}
    />
  )
}

export {
  type HozoColorPickerProps as ColorPickerProps,
  StyledColorPicker as ColorPicker,
  StyledColorPicker as HozoColorPicker,
}
