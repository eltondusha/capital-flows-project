import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Replace 'two_country_lags' with your actual GitHub repository name
export default defineConfig({
  plugins: [react()],
  base: '/two_country_lags/', 
})