import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: hier,
  plugins: [react()],
  build: {
    outDir: join(hier, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 4322,
    strictPort: true,
    // Im Entwicklungsbetrieb laeuft die Oberflaeche auf 4322 und spricht mit
    // dem Cockpit-Server auf 4321. Im gebauten Zustand liefert dieser die
    // Oberflaeche selbst aus und der Proxy entfaellt.
    proxy: {
      '/api': 'http://127.0.0.1:4321',
      '/vorschau': 'http://127.0.0.1:4321',
      '/bild': 'http://127.0.0.1:4321',
    },
  },
});
