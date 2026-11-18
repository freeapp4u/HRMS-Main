import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const disableHmr = process.env.DISABLE_HMR === 'true';

  return {
    base: '/HRMS-Main/',
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true as const,
      hmr: false as const,
      watch: disableHmr ? { ignored: ['**/*'] } : {},
    },
  };
});
