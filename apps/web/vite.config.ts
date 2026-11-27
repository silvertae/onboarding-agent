/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // 서비스 기준 시간대(서울)로 테스트한다. 실행하는 PC·CI 시간대에 따라 날짜 테스트가 하루 밀리지 않게 한다.
    env: { TZ: 'Asia/Seoul' },
  },
})
