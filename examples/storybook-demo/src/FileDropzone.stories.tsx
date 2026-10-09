// A file dropzone: a button that opens the file picker -- Enter, Space or a
// click -- with dropping files on it as the shortcut, never the only way in.
// After a pick, what was added and what was refused, with the reason, is
// announced in one sentence.

import { FileDropzone, type HozoPickedFile } from '@hozo/form'
import { Text, View } from '@hozo/primitives'
import { Section } from '@hozo/semantics'
import { Heading, Paragraph } from '@hozo/typography'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const ZONE =
  'flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-400 px-6 py-8 text-center text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'

function FileDropzoneGallery() {
  const [files, setFiles] = useState<HozoPickedFile[]>([])
  return (
    <View className="max-w-xl space-y-6 rounded-2xl bg-white p-8">
      <View className="space-y-2">
        <Heading level={1} className="text-2xl font-bold text-slate-900">
          FileDropzone
        </Heading>
        <Paragraph className="text-slate-700">
          PNG or JPEG, up to 5 MB. Selected:{' '}
          {files.length === 0 ? 'none' : files.map((f) => f.name).join(', ')}
        </Paragraph>
      </View>
      <Section className="space-y-3">
        <FileDropzone
          accessibilityLabel="Upload a photo"
          accept={['image/png', 'image/jpeg']}
          maxSize={5_000_000}
          onFilesSelected={setFiles}
          className={ZONE}
          activeClassName="border-indigo-700 bg-indigo-50"
        >
          <Text className="font-semibold text-slate-900">Drop a photo here</Text>
          <Text className="text-slate-600">or press to choose one</Text>
        </FileDropzone>
      </Section>
    </View>
  )
}

const meta = {
  title: 'Form/FileDropzone',
  component: FileDropzoneGallery,
} satisfies Meta<typeof FileDropzoneGallery>

export default meta

export const Default: StoryObj<typeof meta> = {}
