import { Text, View } from '@hozo/core'
import { Button } from '@hozo/ui'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'

function App() {
  const [count, setCount] = useState(0)
  return (
    <View className="p-4">
      <Text>Count: {count}</Text>
      <Button tone="accent" onPress={() => setCount(count + 1)}>
        Increment
      </Button>
    </View>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
