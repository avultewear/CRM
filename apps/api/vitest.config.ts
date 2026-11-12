import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['testes/**/*.test.ts'],
    globalSetup: ['testes/preparar-banco.ts'],
    fileParallelism: false,
    testTimeout: 15000,
  },
});
