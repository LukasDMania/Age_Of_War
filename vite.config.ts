import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

/**
 * Dev server only: saves match logs posted by the game (`systems/MatchLogger`)
 * as JSON files in `playtest-logs/`, for balance work on human-played runs.
 */
function playtestLogs(): Plugin {
  const dir = path.resolve(__dirname, 'playtest-logs');
  return {
    name: 'playtest-logs',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__playtest-log', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const log = JSON.parse(body) as { fileStem?: string };
            const stem = String(log.fileStem ?? Date.now()).replace(/[^\w.-]/g, '_');
            fs.mkdirSync(dir, { recursive: true });
            let name = `${stem}.json`;
            for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${stem}-${i}.json`;
            fs.writeFileSync(path.join(dir, name), JSON.stringify(log, null, 1));
            res.end(name);
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err));
          }
        });
      });
    },
  };
}

// Mirrors the "paths" block in tsconfig.json — Vite needs its own
// alias resolution at bundle time, TS needs it for type-checking/IDE.
// Keep the two in sync if you add new top-level src folders.
export default defineConfig({
  base: './',
  plugins: [playtestLogs()],
  server: {
    port: 5173,
    open: true,
    // Saved match logs are data, not source: don't reload the page for them.
    watch: { ignored: ['**/playtest-logs/**'] },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Phaser is large; splitting it into its own chunk keeps
    // rebuilds of game code fast and caches Phaser separately.
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@config': path.resolve(__dirname, 'src/config'),
      '@entities': path.resolve(__dirname, 'src/entities'),
      '@systems': path.resolve(__dirname, 'src/systems'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@state': path.resolve(__dirname, 'src/state'),
      '@utils': path.resolve(__dirname, 'src/utils'),
    },
  },
});
