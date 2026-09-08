import { ExpoRouterNavigationProvider } from '@hozo/navigation/expo-router'
import { Stack, useRouter } from 'expo-router'

export default function RootLayout() {
  const router = useRouter()
  return (
    <ExpoRouterNavigationProvider router={router}>
      <Stack />
    </ExpoRouterNavigationProvider>
  )
}
