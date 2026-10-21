import { Paragraph, Text, View } from '@hozo/core'
import { FileDropzone } from '@hozo/ui'
import { useState } from 'react'

export function FileDropzoneDemo() {
  const [message, setMessage] = useState('No file yet')
  return (
    <View className="w-full max-w-md gap-3">
      <FileDropzone
        accessibilityLabel="Upload a photo"
        accept={['image/png', 'image/jpeg']}
        maxSize={5_000_000}
        onFilesSelected={(files) => setMessage(`Chosen: ${files.map((f) => f.name).join(', ')}`)}
        onRejected={(rejections) =>
          setMessage(`Refused: ${rejections.map((r) => r.reason).join(', ')}`)
        }
      >
        <Text className="font-semibold text-hozo-text">Drop a photo here</Text>
        <Text className="text-sm text-hozo-text-body">or press to choose one, up to 5 MB</Text>
      </FileDropzone>
      <Paragraph className="text-sm text-hozo-text-body">{message}</Paragraph>
    </View>
  )
}
