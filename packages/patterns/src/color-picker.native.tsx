import { useHozoMessage } from '@hozo/behaviors'
import { useEffect, useState } from 'react'
import {
  Pressable,
  type StyleProp,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import { type Hsla, hexToHsla, hslaToHex } from './color-rules.ts'
import { describedColor, spokenName } from './color-words.ts'
import { HozoSlider } from './slider.native.tsx'

type Style = StyleProp<ViewStyle | TextStyle>

export interface HozoColorPickerProps {
  value?: string
  defaultValue?: string
  onChange?: (hex: string) => void
  presets?: readonly string[]
  alpha?: boolean
  /** Web only: React Native has no eyedropper to open. Carried and unused here. */
  showEyeDropper?: boolean
  disabled?: boolean
  accessibilityLabel: string
  /**
   * Tailwind classes, the same props the Web half takes. Read by the
   * compiler, which hands them over as the style props below; a file it did
   * not read leaves them here, where a Native pattern has no class list to
   * resolve.
   */
  className?: string
  swatchClassName?: string
  selectedSwatchClassName?: string
  sliderClassName?: string
  thumbClassName?: string
  inputClassName?: string
  eyeDropperClassName?: string
  style?: Style
  swatchStyle?: Style
  selectedSwatchStyle?: Style
  sliderStyle?: Style
  thumbStyle?: Style
  inputStyle?: Style
  testID?: string
}

const FALLBACK: Hsla = { h: 0, s: 0, l: 0, a: 1 }

/**
 * A colour on React Native: swatches that are radio buttons, three sliders
 * that say their value in words, and the hex, for the reasons the Web half
 * gives. The sliders are `Slider`'s, so a swipe up or down with a screen
 * reader on moves them. The tracks are plain here -- a gradient needs a
 * drawing library, which is the application's to choose -- so the colour
 * itself is the swatch beside them and the words a reader hears.
 */
export function HozoColorPicker({
  value,
  defaultValue,
  onChange,
  presets,
  alpha = false,
  disabled,
  accessibilityLabel,
  style,
  swatchStyle,
  selectedSwatchStyle,
  sliderStyle,
  thumbStyle,
  inputStyle,
  testID,
}: HozoColorPickerProps) {
  const message = useHozoMessage()
  const [hsla, setHsla] = useState<Hsla>(() => hexToHsla(value ?? defaultValue ?? '') ?? FALLBACK)
  const hex = hslaToHex(alpha ? hsla : { ...hsla, a: 1 })
  const [draft, setDraft] = useState(hex)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (value === undefined) return
    const incoming = hexToHsla(value)
    if (incoming && hslaToHex(alpha ? incoming : { ...incoming, a: 1 }) !== hex) setHsla(incoming)
  }, [value, alpha, hex])
  useEffect(() => {
    if (!editing) setDraft(hex)
  }, [hex, editing])

  const update = (next: Hsla) => {
    setHsla(next)
    onChange?.(hslaToHex(alpha ? next : { ...next, a: 1 }))
  }
  const chooseHex = (text: string) => {
    const next = hexToHsla(text)
    if (next) update(alpha ? next : { ...next, a: 1 })
  }
  const percent = (n: number) => message('hozo.colorPicker.percent', { value: Math.round(n) })
  const slider = sliderStyle as StyleProp<ViewStyle>
  const thumb = thumbStyle as StyleProp<ViewStyle>

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={style as StyleProp<ViewStyle>}
      testID={testID}
    >
      {presets && presets.length > 0 ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={message('hozo.colorPicker.presets')}
          style={ROW}
        >
          {presets.map((preset) => {
            const parsed = hexToHsla(preset) ?? FALLBACK
            const checked = hslaToHex(parsed) === hslaToHex({ ...hsla, a: alpha ? hsla.a : 1 })
            return (
              <Pressable
                key={preset}
                accessibilityRole="radio"
                accessibilityLabel={describedColor(message, parsed, hslaToHex(parsed))}
                accessibilityState={{ checked, disabled: Boolean(disabled) }}
                disabled={disabled}
                onPress={() => chooseHex(preset)}
                style={[
                  swatchStyle as StyleProp<ViewStyle>,
                  checked && (selectedSwatchStyle as StyleProp<ViewStyle>),
                  { backgroundColor: preset },
                ]}
              />
            )
          })}
        </View>
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
        style={slider}
        thumbStyle={thumb}
      />
      <HozoSlider
        accessibilityLabel={message('hozo.colorPicker.saturation')}
        value={Math.round(hsla.s)}
        onValueChange={(s) => update({ ...hsla, s })}
        valueText={percent}
        disabled={disabled}
        style={slider}
        thumbStyle={thumb}
      />
      <HozoSlider
        accessibilityLabel={message('hozo.colorPicker.lightness')}
        value={Math.round(hsla.l)}
        onValueChange={(l) => update({ ...hsla, l })}
        valueText={percent}
        disabled={disabled}
        style={slider}
        thumbStyle={thumb}
      />
      {alpha ? (
        <HozoSlider
          accessibilityLabel={message('hozo.colorPicker.alpha')}
          value={Math.round(hsla.a * 100)}
          onValueChange={(a) => update({ ...hsla, a: a / 100 })}
          valueText={(a) => message('hozo.colorPicker.alphaValue', { value: a })}
          disabled={disabled}
          style={slider}
          thumbStyle={thumb}
        />
      ) : null}
      <TextInput
        accessibilityLabel={message('hozo.colorPicker.hex')}
        accessibilityHint={describedColor(message, hsla, hex)}
        autoCorrect={false}
        autoCapitalize="none"
        editable={!disabled}
        value={draft}
        onChangeText={(text) => {
          setDraft(text)
          chooseHex(text)
        }}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false)
          setDraft(hex)
        }}
        style={inputStyle as StyleProp<TextStyle>}
      />
    </View>
  )
}

const ROW: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap' }

export { HozoColorPicker as ColorPicker, type HozoColorPickerProps as ColorPickerProps }
