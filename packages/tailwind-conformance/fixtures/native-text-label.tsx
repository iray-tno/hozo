import { Text } from '@hozo/core'
import { memo, useState } from 'react'
import type { TextProps, TextStyle } from 'react-native'

type LabelProps = {
  name: string
  tick: number
  frame?: TextStyle
  onTextLayout?: TextProps['onTextLayout']
}
let nextMount = 0
export const Label = memo(function Label({ name, tick, onTextLayout }: LabelProps) {
  const [mount] = useState(() => ++nextMount)
  return (
    <Text
      className="text-[#111111] text-[22px] font-semibold leading-[32px] tracking-[1px] text-left uppercase"
      accessibilityRole="text"
      accessibilityLabel={`${name} mount ${mount} tick ${tick}`}
      onTextLayout={onTextLayout}
    >
      Parent <Text className="text-[#1355bb] font-medium">nested sample for wrapping</Text>
    </Text>
  )
})
