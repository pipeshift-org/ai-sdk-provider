import { createRequire } from 'node:module';
import { defineConfig } from 'tsup';

const pkg = createRequire(import.meta.url)('./package.json');

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  define: {
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
  },
});
