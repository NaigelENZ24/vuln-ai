import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Las librerías van en archivos propios: cambian poco, así el navegador las conserva en caché entre despliegues.
const LIBRERIAS = { react: /node_modules[\/](react|react-dom|scheduler|react-router|react-router-dom)[\/]/, supabase: /node_modules[\/]@supabase[\/]/, iconos: /node_modules[\/]lucide-react[\/]/ }

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: { groups: Object.entries(LIBRERIAS).map(([name, test]) => ({ name, test })) },
      },
    },
  },
})
