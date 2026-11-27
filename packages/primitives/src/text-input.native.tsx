import {
  type HozoPressableInteractionState,
  usePressableInteraction,
} from '@hozo/behaviors/pressable-interaction'
import { type ComponentRef, type Ref, useContext, useLayoutEffect } from 'react'
import { TextInput, type TextInputProps } from 'react-native'
import { HozoPeerContext } from './peer-context.native.ts'
import { type NativeTextInputProps, nativeTextInputProps } from './text-input-props.native.ts'

export interface HozoTextInputProps extends NativeTextInputProps {
  ref?: Ref<ComponentRef<typeof TextInput>>
  /** Compiler-only style evaluation on this input, not an ancestor Pressable. */
  hozoStyle?: (state: HozoPressableInteractionState) => TextInputProps['style']
  /** Channel ID inside an enclosing `HozoPeerScope` when a following sibling reads `peer-focus:`/`peer-focus-visible:`. */
  hozoPeerId?: number
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
  // only for a compiler callback or peer channel and still renders exactly one RN field.
  if (!props.hozoStyle && props.hozoPeerId === undefined) {
    const { hozoStyle: _hozoStyle, hozoPeerId: _hozoPeerId, ref, ...hostProps } = props
    return <TextInput {...nativeTextInputProps(hostProps)} ref={ref} />
  }
  return <FocusedTextInput {...props} />
}

function FocusedTextInput({
  ref,
  hozoStyle,
  hozoPeerId,
  style,
  onFocus,
  onBlur,
  ...props
}: HozoTextInputProps) {
  const { state, handlers } = usePressableInteraction({ focusVisible: 'keyboard-input' })
  const peerStore = useContext(HozoPeerContext)
  useLayoutEffect(() => {
    if (peerStore && hozoPeerId !== undefined) {
      peerStore.publish(hozoPeerId, state)
    }
  }, [peerStore, hozoPeerId, state])
  useLayoutEffect(() => {
    if (!peerStore || hozoPeerId === undefined) return
    return () => peerStore.clear(hozoPeerId)
  }, [peerStore, hozoPeerId])
  return (
    <TextInput
      {...nativeTextInputProps(props)}
      ref={ref}
      style={hozoStyle ? [hozoStyle(state), style] : style}
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
