/**
 * A colour picker with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is the pattern's: swatches as a radio group, hue,
 * saturation and lightness as sliders that say their value in words, the
 * hex as a field. This file draws round swatches with a ring on the chosen
 * one, rounded tracks the pattern paints with the colour, and a thumb.
 */

import { ColorPicker, type ColorPickerProps } from '@hozo/core'

export type HozoColorPickerProps = ColorPickerProps

const root = 'flex flex-col gap-3'
const swatch =
  'size-8 rounded-full border border-hozo-border cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'
const selected = 'ring-2 ring-offset-2 ring-hozo-accent'
const slider = 'relative h-3 w-full rounded-full'
const thumb =
  'absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-hozo-surface bg-transparent shadow-hozo-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'
const input =
  'w-32 rounded-hozo-control border border-hozo-border-strong bg-hozo-surface px-3 py-2 font-mono text-sm text-hozo-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'
const eyeDropper =
  'self-start rounded-hozo-control border border-hozo-border px-3 py-2 text-sm text-hozo-text-body hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'

const plus = (own: string, extra: string | undefined) => (extra ? `${own} ${extra}` : own)

// Not named `HozoColorPicker` here: compiled output imports a runtime
// component under that name for the `<ColorPicker>` below (#670).
function StyledColorPicker({
  className,
  swatchClassName,
  selectedSwatchClassName,
  sliderClassName,
  thumbClassName,
  inputClassName,
  eyeDropperClassName,
  ...rest
}: HozoColorPickerProps) {
  return (
    <ColorPicker
      {...rest}
      className={plus(root, className)}
      swatchClassName={plus(swatch, swatchClassName)}
      selectedSwatchClassName={plus(selected, selectedSwatchClassName)}
      sliderClassName={plus(slider, sliderClassName)}
      thumbClassName={plus(thumb, thumbClassName)}
      inputClassName={plus(input, inputClassName)}
      eyeDropperClassName={plus(eyeDropper, eyeDropperClassName)}
    />
  )
}

export {
  type HozoColorPickerProps as ColorPickerProps,
  StyledColorPicker as ColorPicker,
  StyledColorPicker as HozoColorPicker,
}
