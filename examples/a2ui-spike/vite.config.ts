import { hozo } from '@hozo/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [hozo({ css: 'src/index.css' }), react()],
})
