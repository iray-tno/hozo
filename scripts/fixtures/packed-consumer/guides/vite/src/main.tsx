// A stand-in for what `npm create vite@latest -- --template react-ts`
// writes. The Vite guide's own files go over it.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
