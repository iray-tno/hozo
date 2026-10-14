import {
  type HozoPressableInteractionState,
  usePressableInteraction,
} from '@hozo/behaviors/pressable-interaction'
import type { ComponentRef, Ref } from 'react'
import { TextInput, type TextInputProps } from 'react-native'
import { type NativeTextInputProps, nativeTextInputProps } from './text-input-props.native.ts'

export interface HozoTextInputProps extends NativeTextInputProps {
  ref?: Ref<ComponentRef<typeof TextInput>>
  /** Compiler-only style evaluation on this input, not an ancestor Pressable. */
  hozoStyle?: (state: HozoPressableInteractionState) => TextInputProps['style']
}

/**
 * Generated-code host when static or dynamic classes need input focus. Ordinary
 * compiled inputs stay RN TextInput. No extra box, context, animation or
 * subscriptions; the same native field keeps its ref, events and semantics.
 *
 * A keyboard-input field indicates focus even after a pointer/touch focuses
 * it (Selectors 4 §9.4). A button's pointer modality is not its policy.
 */
export function HozoTextInput(props: HozoTextInputProps) {
  // A prop-only adapter needs no state subscription. The focus child exists
  // only for a compiler callback and still renders exactly one RN field.
  if (!props.hozoStyle) {
    const { hozoStyle: _hozoStyle, ref, ...hostProps } = props
    return <TextInput {...nativeTextInputProps(hostProps)} ref={ref} />
  }
  return <FocusedTextInput {...props} />
}

function FocusedTextInput({
  ref,
  hozoStyle,
  style,
  onFocus,
  onBlur,
  ...props
}: HozoTextInputProps) {
  const { state, handlers } = usePressableInteraction({ focusVisible: 'keyboard-input' })
  return (
    <TextInput
      {...nativeTextInputProps(props)}
      ref={ref}
      style={[hozoStyle?.(state), style]}
      onFocus={(event) => {
        handlers.focus()
        onFocus?.(event)
      }}
      onBlur={(event) => {
        handlers.blur()
        onBlur?.(event)
      }}
    />
  )
}
