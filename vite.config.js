import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Default build: static site for GitHub Pages (relative base works from any sub-path).
// `vite build --mode artifact`: one self-contained HTML file for the Claude artifact,
// single-player only (artifacts cannot open outside network connections).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'artifact' ? [viteSingleFile()] : [],
  define: { __ARTIFACT__: JSON.stringify(mode === 'artifact') },
  build: mode === 'artifact' ? { outDir: 'dist-artifact', emptyOutDir: true } : {},
  test: { include: ['tests/**/*.test.js'] }
}));
