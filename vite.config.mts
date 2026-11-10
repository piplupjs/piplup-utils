import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import packageJSON from './package.json' with { type: 'json' };

const license = readFileSync(path.resolve('./LICENSE'), {
  encoding: 'utf-8',
});
const banner = ['/*', '@license', license, '*/', "'use client';"].join('\n');

// Everything a consumer brings themselves stays out of the bundle.
const external = [...new Set([...Object.keys(packageJSON.peerDependencies), 'react/jsx-runtime'])];

export default defineConfig({
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    emptyOutDir: true,
    lib: {
      entry: {
        index: 'src/index.ts',
      },
      fileName: (format, entryName) => {
        const extension = format === 'es' ? 'mjs' : 'js';
        return `${entryName}.${extension}`;
      },
      formats: ['es', 'cjs'],
      name: 'piplupUtils',
    },
    minify: true,
    outDir: './dist',
    reportCompressedSize: true,
    sourcemap: false,
    rollupOptions: {
      external,
      output: {
        banner,
        sourcemapExcludeSources: true,
      },
    },
  },
  plugins: [
    dts({
      entryRoot: 'src',
      tsconfigPath: 'tsconfig.lib.json',
    }),
  ],
});
