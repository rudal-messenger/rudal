import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ⚠️ Change `rudal` below if your GitHub repo name differs
export default defineConfig({
  plugins: [react()],
  base: '/rudal/', // <-- important for GitHub Pages (repo name)
});
