import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' } },
      {
        extends: true,
        test: {
          name: 'rules',
          include: ['firebase/tests/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20000,
          fileParallelism: false,
        },
      },
    ],
  },
});
