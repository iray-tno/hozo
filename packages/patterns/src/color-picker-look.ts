export type ColorPickerTrack = 'hue' | 'saturation' | 'lightness' | 'alpha'

/** A track's value color, independent of the thumb's interaction state. */
export interface ColorPickerThumb {
  track: ColorPickerTrack
  /** Hex RGB, or RGBA for the alpha track; the surrounding surface is unknown. */
  color: string
}

/** Classes still reach Slider before its own focus/disabled facts are resolved. */
export type ColorPickerThumbLook = (thumb: ColorPickerThumb) => { className: string }
