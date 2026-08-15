import type { Config } from 'tailwindcss';

// Paleta "Wall Street de las apuestas deportivas": grafito/negro de fondo,
// dorado como acento de marca, verde neón reservado para probabilidad alta.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0A0A0B',
        surface: '#141416',
        foreground: '#F5F5F0',
        gold: '#D4AF37',
        neon: '#39FF88',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
