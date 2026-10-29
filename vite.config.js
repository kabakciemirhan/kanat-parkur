import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // Yerel ağdan erişim (ileride HTTPS ile)
  },
});
