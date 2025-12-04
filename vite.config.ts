import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

// Custom plugin to start the backend automatically and restart on changes
const startBackend = () => {
  let backend: ChildProcess | undefined;

  const runBackend = () => {
    if (backend) {
      console.log('\x1b[33m%s\x1b[0m', 'Restarting NodeStack Backend...');
      backend.kill();
    } else {
      console.log('\x1b[36m%s\x1b[0m', 'Starting NodeStack Backend...');
    }

    backend = spawn('node', ['server.js'], { 
      stdio: 'inherit', 
      shell: true 
    });

    backend.on('error', (err) => {
      console.error('Failed to start backend:', err);
    });
  };

  return {
    name: 'start-backend',
    configureServer(server) {
      runBackend();

      // Watch server.js for changes
      server.watcher.add(path.resolve('server.js'));
      server.watcher.on('change', (file) => {
        if (file.endsWith('server.js')) {
          runBackend();
        }
      });

      // Cleanup on exit
      (process as any).on('exit', () => {
        if (backend) backend.kill();
      });
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    startBackend()
  ],
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
        secure: false,
      }
    }
  }
});