import { useHozoMessage } from '@hozo/behaviors'
import { usePressableInteraction } from '@hozo/behaviors/pressable-interaction'
import { hozoClasses } from '@hozo/engine/project'
import { useEffect, useState } from 'react'
import { type StyleProp, TextInput, type TextStyle, View, type ViewStyle } from 'react-native'
import { type Hsla, hexToHsla, hslaToHex } from './color-rules.ts'
import { describedColor, spokenName } from './color-words.ts'
import { type InteractionState, Pressable } from './pressable.native.tsx'
import { HozoSlider } from './slider.native.tsx'
import type { ColorPickerSlotFacts, TextInputSlotFacts } from './slot-facts.native.ts'

type Style = StyleProp<ViewStyle | TextStyle>
type SwatchState = InteractionState & ColorPickerSlotFacts
type InputState = Pick<InteractionState, 'focused' | 'focusVisible'> & TextInputSlotFacts

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
   * not read leaves them here as strings, resolved through the project's
   * candidate map (#886) before the matching style prop, a swatch with its
   * interaction, `aria-checked` and `disabled` state. There is no eye dropper
   * here, so `eyeDropperClassName` is unused.
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
  /** @internal Static state classes, driven by each swatch's own host. */
  hozoSwatchStyle?: (state: SwatchState) => Style
  /** @internal Evaluated only on the currently selected swatch. */
  hozoSelectedSwatchStyle?: (state: SwatchState) => Style
  /** @internal Only the hex field supplies focus and editable-input facts. */
  hozoInputStyle?: (state: InputState) => Style
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
  className,
  swatchClassName,
  selectedSwatchClassName,
  sliderClassName,
  thumbClassName,
  inputClassName,
  style,
  swatchStyle,
  selectedSwatchStyle,
  hozoSwatchStyle,
  hozoSelectedSwatchStyle,
  hozoInputStyle,
  sliderStyle,
  thumbStyle,
  inputStyle,
  testID,
}: HozoColorPickerProps) {
  const message = useHozoMessage()
  const [hsla, setHsla] = useState<Hsla>(() => hexToHsla(value ?? defaultValue ?? '') ?? FALLBACK)
  const hex = hslaToHex(alpha ? hsla : { ...hsla, a: 1 })
  const [draft, setDraft] = useState(hex)
  const { state: inputInteraction, handlers: inputHandlers } = usePressableInteraction({
    focusVisible: 'keyboard-input',
  })
  const editing = inputInteraction.focused
  // Disabling a Web input blurs it. Native's editable=false need not deliver
  // the same OS event, so stale focus/draft must not survive re-enabling it.
  useEffect(() => {
    if (disabled) {
      inputHandlers.blur()
      setDraft(hex)
    }
  }, [disabled, hex, inputHandlers])

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
  const slider = [hozoClasses(sliderClassName), sliderStyle] as StyleProp<ViewStyle>
  const thumb = [hozoClasses(thumbClassName), thumbStyle] as StyleProp<ViewStyle>
  const inputFacts = {
    focused: !disabled && inputInteraction.focused,
    focusVisible: !disabled && inputInteraction.focusVisible,
    disabled: Boolean(disabled),
    enabled: !disabled,
    readOnly: Boolean(disabled),
    'aria-disabled': false,
    'aria-selected': false,
    'aria-checked': false,
  } satisfies TextInputSlotFacts
  // As on Web, a radio group has one checked preset, not every equivalent
  // spelling of its colour. An invalid preset's visual fallback is not a match.
  const selectedPreset = presets?.findIndex((preset) => {
    const parsed = hexToHsla(preset)
    return parsed !== null && hslaToHex(parsed) === hex
  })

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[hozoClasses(className), style] as StyleProp<ViewStyle>}
      testID={testID}
    >
      {presets && presets.length > 0 ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={message('hozo.colorPicker.presets')}
          style={ROW}
        >
          {presets.map((preset, index) => {
            const parsed = hexToHsla(preset) ?? FALLBACK
            const checked = index === selectedPreset
            return (
              <Pressable
                key={preset}
                accessibilityRole="radio"
                accessibilityLabel={describedColor(message, parsed, hslaToHex(parsed))}
                accessibilityState={{ checked, disabled: Boolean(disabled) }}
                disabled={disabled}
                onPress={() => chooseHex(preset)}
                style={(interaction) => {
                  // One snapshot for candidate classes and generated callbacks.
                  // Native's disabled announcement does not write aria-disabled
                  // on the Web button; checked is the radio's actual attribute.
                  const state = {
                    ...interaction,
                    disabled: Boolean(disabled),
                    enabled: !disabled,
                    'aria-checked': checked,
                    'aria-disabled': false,
                    'aria-selected': false,
                  } satisfies ColorPickerSlotFacts
                  return [
                    hozoClasses(swatchClassName, state),
                    hozoSwatchStyle?.(state) as StyleProp<ViewStyle>,
                    swatchStyle as StyleProp<ViewStyle>,
                    checked && [
                      hozoClasses(selectedSwatchClassName, state),
                      hozoSelectedSwatchStyle?.(state) as StyleProp<ViewStyle>,
                      selectedSwatchStyle as StyleProp<ViewStyle>,
                    ],
                    { backgroundColor: preset },
                  ]
                }}
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
        onFocus={() => {
          if (!disabled) inputHandlers.focus()
        }}
        onBlur={() => {
          inputHandlers.blur()
          setDraft(hex)
        }}
        onPointerDown={inputHandlers.pointerDown}
        onPressIn={inputHandlers.pointerDown}
        onKeyDown={inputHandlers.keyDown}
        style={
          [
            hozoClasses(inputClassName, inputFacts),
            hozoInputStyle?.(inputFacts),
            inputStyle,
          ] as StyleProp<TextStyle>
        }
      />
    </View>
  )
}

const ROW: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap' }

export { HozoColorPicker as ColorPicker, type HozoColorPickerProps as ColorPickerProps }
