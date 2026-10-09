import { useHozoMessage } from '@hozo/behaviors'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { type Hsla, hexToHsla, hslaToHex } from './color-rules.ts'
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
  const swatches = useRef<(HTMLButtonElement | null)[]>([])

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
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
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

  return (
    <div role="group" aria-label={accessibilityLabel} className={className} data-testid={testID}>
      {presets && presets.length > 0 ? (
        <div role="radiogroup" aria-label={message('hozo.colorPicker.presets')}>
          {presets.map((preset, index) => {
            const parsed = hexToHsla(preset) ?? FALLBACK
            const checked = index === selectedPreset
            return (
              <button
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
        thumbClassName={thumbClassName}
        style={{ background: HUE_SPECTRUM }}
      />
      <HozoSlider
        accessibilityLabel={message('hozo.colorPicker.saturation')}
        value={Math.round(hsla.s)}
        onValueChange={(s) => update({ ...hsla, s })}
        valueText={percent}
        disabled={disabled}
        className={sliderClassName}
        thumbClassName={thumbClassName}
        style={{
          background: `linear-gradient(to right, ${hslaToHex({ ...hsla, s: 0, a: 1 })}, ${hslaToHex({ ...hsla, s: 100, a: 1 })})`,
        }}
      />
      <HozoSlider
        accessibilityLabel={message('hozo.colorPicker.lightness')}
        value={Math.round(hsla.l)}
        onValueChange={(l) => update({ ...hsla, l })}
        valueText={percent}
        disabled={disabled}
        className={sliderClassName}
        thumbClassName={thumbClassName}
        style={{
          background: `linear-gradient(to right, #000000, ${hslaToHex({ ...hsla, l: 50, a: 1 })}, #ffffff)`,
        }}
      />
      {alpha ? (
        <HozoSlider
          accessibilityLabel={message('hozo.colorPicker.alpha')}
          value={Math.round(hsla.a * 100)}
          onValueChange={(a) => update({ ...hsla, a: a / 100 })}
          valueText={(a) => message('hozo.colorPicker.alphaValue', { value: a })}
          disabled={disabled}
          className={sliderClassName}
          thumbClassName={thumbClassName}
          style={{
            background: `linear-gradient(to right, transparent, ${hslaToHex({ ...hsla, a: 1 })})`,
          }}
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

/** The hue track: every hue at full saturation, as the slider moves through them. */
const HUE_SPECTRUM =
  'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'

export { HozoColorPicker as ColorPicker, type HozoColorPickerProps as ColorPickerProps }
