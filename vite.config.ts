import { defineConfig } from 'vite';

export default defineConfig({
  base: '/backyard-golf/',
  build: { rollupOptions: { input: 'app.html' } },
  plugins: [{
    name: 'pages-entry',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const page = bundle['app.html'];
      if (!page) throw new Error('Vite did not emit app.html');
      delete bundle['app.html'];
      page.fileName = 'index.html';
      bundle['index.html'] = page;
    },
  }],
});
