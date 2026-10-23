import { Text, View } from '@hozo/core'
import { ResizablePane } from '@hozo/ui'

export function ResizablePaneDemo() {
  return (
    <View className="w-full flex-row rounded-hozo-surface border border-hozo-border">
      <ResizablePane
        side="start"
        label="Files"
        min={96}
        max={240}
        defaultSize={144}
        collapsible
        paneClassName="bg-hozo-surface-raised p-3"
      >
        <Text className="text-sm text-hozo-text">App.tsx</Text>
        <Text className="text-sm text-hozo-text">theme.css</Text>
      </ResizablePane>
      <View className="min-w-0 flex-1 p-3">
        <Text className="text-sm text-hozo-text">Drag the divider to resize Files.</Text>
      </View>
    </View>
  )
}
