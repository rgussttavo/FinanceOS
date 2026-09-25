import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // o fuso da pessoa, não o do servidor de CI: data civil tem que sobreviver a ele
    env: { TZ: 'America/Sao_Paulo' },
  },
});
