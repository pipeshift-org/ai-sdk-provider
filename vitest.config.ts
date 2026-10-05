import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const pkg = createRequire(import.meta.url)('./package.json');

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
  define: {
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
  },
});
