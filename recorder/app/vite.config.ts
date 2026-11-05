import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwindcss()],server:{port:4183,strictPort:true,proxy:{'/api':`http://127.0.0.1:${Number(process.env.SCENEFORGE_PORT)||4184}`}},build:{target:'es2022',sourcemap:true}});
