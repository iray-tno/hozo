import AsyncStorage from '@react-native-async-storage/async-storage'
import { view } from './storybook.requires'

export default view.getStorybookUI({
  // Cold launch must not implicitly compile the GPU study's shaders before
  // Storybook is usable. Enter GPU stories explicitly from the gallery.
  initialSelection: 'primitives-shared-showcase--buttons',
  storage: { getItem: AsyncStorage.getItem, setItem: AsyncStorage.setItem },
})
