import { useHozoMessage } from '@hozo/behaviors'
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ColorPickerThumbLook, ColorPickerTrack } from './color-picker-look.ts'
import { colorThumbs, colorTracks, type Hsla, hexToHsla, hslaToHex } from './color-rules.ts'
import { describedColor, spokenName } from './color-words.ts'
import { HozoSlider } from './slider.tsx'

export interface HozoColorPickerProps {
  /** A hex colour, `#rrggbb` -- or `#rrggbbaa` with `alpha`. */
  value?: string
  defaultValue?: string
  onChange?: (hex: string) => void
  /** Swatches offered first, as hex. */
  presets?: readonly string[]
  /** Adds an opacity slider, and the hex gains two digits. */
  alpha?: boolean
  /** A button for the browser's eyedropper, where the browser has one. */
  showEyeDropper?: boolean
  disabled?: boolean
  /** The whole control's name -- "Primary theme colour". */
  accessibilityLabel: string
  /** The box around everything. */
  className?: string
  /** Every preset swatch. */
  swatchClassName?: string
  /** Added to the swatch that is the current colour. */
  selectedSwatchClassName?: string
  /** Each slider's track. */
  sliderClassName?: string
  /** Each slider's thumb. */
  thumbClassName?: string
  /** Value-dependent thumb appearance; focus remains owned by each slider. */
  thumbLook?: ColorPickerThumbLook
  inputClassName?: string
  eyeDropperClassName?: string
  testID?: string
}

interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>
}

const FALLBACK: Hsla = { h: 0, s: 0, l: 0, a: 1 }

/**
 * A colour, chosen from swatches, three sliders, or its hex (#153).
 *
 * ## Three sliders, not a square
 *
 * The usual picker has a two-dimensional square for saturation and
 * brightness. There is no ARIA pattern for a value that moves in two
 * directions at once, so a square is a control a keyboard and a screen reader
 * can reach but not operate. Hue, saturation and lightness are three ordinary
 * sliders here -- `Slider`, with its keys, its drag and its Native
 * increment/decrement -- and each says its value in words: "Hue, 217
 * degrees, blue".
 *
 * ## Named and numbered
 *
 * A colour is read as "dark blue, #1e3a8a": a coarse name, so the hex is not
 * six digits of nothing, and the hex, so the name is not the only
 * precision. The names go through the project's translations (decision 008).
 *
 * The swatches are a radio group, one tab stop moved through with the arrow
 * keys. The hue state is kept apart from the hex, because a grey has no hue
 * and recomputing one from it would lose where the hue slider was.
 */
export function HozoColorPicker({
  value,
  defaultValue,
  onChange,
  presets,
  alpha = false,
  showEyeDropper = false,
  disabled,
  accessibilityLabel,
  className,
  swatchClassName,
  selectedSwatchClassName,
  sliderClassName,
  thumbClassName,
  thumbLook,
  inputClassName,
  eyeDropperClassName,
  testID,
}: HozoColorPickerProps) {
  const message = useHozoMessage()
  const [hsla, setHsla] = useState<Hsla>(() => hexToHsla(value ?? defaultValue ?? '') ?? FALLBACK)
  const hex = hslaToHex(alpha ? hsla : { ...hsla, a: 1 })
  const [draft, setDraft] = useState(hex)
  // While the field has focus its text is the person's: `#abc` is a colour,
  // and rewriting it to `#aabbcc` mid-word would fight their typing.
  const [editing, setEditing] = useState(false)
  const [eyeDropper, setEyeDropper] = useState(false)
  const [rtl, setRtl] = useState(false)
  const group = useRef<HTMLDivElement>(null)
  const swatches = useRef<(HTMLButtonElement | null)[]>([])

  useLayoutEffect(() => {
    if (!group.current) return
    const next = readDirection(group.current) === 'rtl'
    if (next !== rtl) setRtl(next)
  })

  // A new `value` from outside replaces the colour, unless it is the one
  // already showing -- which is every echo of our own `onChange`.
  useEffect(() => {
    if (value === undefined) return
    const incoming = hexToHsla(value)
    if (incoming && hslaToHex(alpha ? incoming : { ...incoming, a: 1 }) !== hex) setHsla(incoming)
  }, [value, alpha, hex])
  useEffect(() => {
    if (!editing) setDraft(hex)
  }, [hex, editing])
  useEffect(() => {
    setEyeDropper(showEyeDropper && typeof window !== 'undefined' && 'EyeDropper' in window)
  }, [showEyeDropper])

  const update = (next: Hsla) => {
    setHsla(next)
    onChange?.(hslaToHex(alpha ? next : { ...next, a: 1 }))
  }
  const chooseHex = (text: string) => {
    const next = hexToHsla(text)
    if (!next) return false
    update(alpha ? next : { ...next, a: 1 })
    return true
  }

  const selectedPreset = presets?.findIndex((preset) => {
    const parsed = hexToHsla(preset)
    return parsed !== null && hslaToHex(parsed) === hslaToHex({ ...hsla, a: alpha ? hsla.a : 1 })
  })
  const focusable = selectedPreset !== undefined && selectedPreset >= 0 ? selectedPreset : 0
  const onSwatchKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!presets) return
    const rtl = readDirection(event.currentTarget) === 'rtl'
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft'
    const step =
      event.key === forward || event.key === 'ArrowDown'
        ? 1
        : event.key === backward || event.key === 'ArrowUp'
          ? -1
          : 0
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? presets.length - 1
          : step === 0
            ? null
            : (index + step + presets.length) % presets.length
    if (target === null) return
    event.preventDefault()
    chooseHex(presets[target] as string)
    swatches.current[target]?.focus()
  }

  const percent = (n: number) => message('hozo.colorPicker.percent', { value: Math.round(n) })
  const invalid = hexToHsla(draft) === null
  const tracks = colorTracks(hsla, rtl)
  const samples = thumbLook ? colorThumbs(hsla) : undefined
  const thumbClasses = (track: ColorPickerTrack) =>
    [thumbClassName, samples && thumbLook?.({ track, color: samples[track] }).className]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div
      ref={group}
      role="group"
      aria-label={accessibilityLabel}
      className={className}
      data-testid={testID}
    >
      {presets && presets.length > 0 ? (
        <div role="radiogroup" aria-label={message('hozo.colorPicker.presets')}>
          {presets.map((preset, index) => {
            const parsed = hexToHsla(preset) ?? FALLBACK
            const checked = index === selectedPreset
            return (
              <button
                data-hozo-pressable=""
                key={preset}
                ref={(node) => {
                  swatches.current[index] = node
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={describedColor(message, parsed, hslaToHex(parsed))}
                tabIndex={index === focusable ? 0 : -1}
                disabled={disabled}
                className={
                  [swatchClassName, checked && selectedSwatchClassName].filter(Boolean).join(' ') ||
                  undefined
                }
                // The swatch's colour is its meaning, not its look.
                style={{ backgroundColor: preset }}
                onClick={() => chooseHex(preset)}
                onKeyDown={(event) => onSwatchKey(event, index)}
              />
            )
          })}
        </div>
      ) : null}
      <HozoSlider
        accessibilityLabel={message('hozo.colorPicker.hue')}
        min={0}
        max={359}
        value={Math.round(hsla.h)}
        onValueChange={(h) => update({ ...hsla, h })}
        valueText={(h) =>
          message('hozo.colorPicker.hueValue', {
            degrees: h,
            name: spokenName(message, { ...hsla, h, s: Math.max(hsla.s, 50), l: 50 }),
          })
        }
        disabled={disabled}
        className={sliderClassName}
        thumbClassName={thumbClasses('hue')}
        style={{ background: tracks.hue }}
      />
      <HozoSlider
        accessibilityLabel={message('hozo.colorPicker.saturation')}
        value={Math.round(hsla.s)}
        onValueChange={(s) => update({ ...hsla, s })}
        valueText={percent}
        disabled={disabled}
        className={sliderClassName}
        thumbClassName={thumbClasses('saturation')}
        style={{ background: tracks.saturation }}
      />
      <HozoSlider
        accessibilityLabel={message('hozo.colorPicker.lightness')}
        value={Math.round(hsla.l)}
        onValueChange={(l) => update({ ...hsla, l })}
        valueText={percent}
        disabled={disabled}
        className={sliderClassName}
        thumbClassName={thumbClasses('lightness')}
        style={{ background: tracks.lightness }}
      />
      {alpha ? (
        <HozoSlider
          accessibilityLabel={message('hozo.colorPicker.alpha')}
          value={Math.round(hsla.a * 100)}
          onValueChange={(a) => update({ ...hsla, a: a / 100 })}
          valueText={(a) => message('hozo.colorPicker.alphaValue', { value: a })}
          disabled={disabled}
          className={sliderClassName}
          thumbClassName={thumbClasses('alpha')}
          style={{ background: tracks.alpha }}
        />
      ) : null}
      <input
        type="text"
        aria-label={message('hozo.colorPicker.hex')}
        aria-description={describedColor(message, hsla, hex)}
        aria-invalid={invalid || undefined}
        spellCheck={false}
        autoComplete="off"
        disabled={disabled}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          chooseHex(event.target.value)
        }}
        // A half-typed hex goes back to the colour on leaving, rather than
        // staying as text that matches nothing.
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false)
          setDraft(hex)
        }}
        className={inputClassName}
      />
      {eyeDropper ? (
        <button
          data-hozo-pressable=""
          type="button"
          disabled={disabled}
          className={eyeDropperClassName}
          onClick={async () => {
            const Picker = (window as unknown as { EyeDropper: new () => EyeDropperLike })
              .EyeDropper
            try {
              const { sRGBHex } = await new Picker().open()
              chooseHex(sRGBHex)
            } catch {
              // Escape while picking is a cancellation, not an error.
            }
          }}
        >
          {message('hozo.colorPicker.eyeDropper')}
        </button>
      ) : null}
    </div>
  )
}

function readDirection(element: Element): string {
  if (typeof window === 'undefined') return 'ltr'
  return window.getComputedStyle(element).direction || 'ltr'
}

export { HozoColorPicker as ColorPicker, type HozoColorPickerProps as ColorPickerProps }
