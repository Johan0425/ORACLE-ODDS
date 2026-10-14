import type { Config } from 'tailwindcss';

/**
 * Identidad oscura con acentos dorados. Los tonos de texto están elegidos para
 * contraste AA sobre `background` y `surface` (verificado ≥ 4.5:1).
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0B0B0D',
        surface: '#141417',
        'surface-2': '#1C1C21',
        line: 'rgba(255,255,255,0.10)',
        foreground: '#F4F1EA',
        muted: '#A9A59C',
        gold: { DEFAULT: '#D9B44A', soft: '#E8CF7D', deep: '#9C7C25' },
        positive: '#3DDC97',
        negative: '#FF7A7A',
        warning: '#F5B94A',
        info: '#7CB8FF',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: { glow: '0 0 0 1px rgba(217,180,74,0.25), 0 8px 30px -12px rgba(217,180,74,0.35)' },
      keyframes: { pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } } },
      animation: { 'pulse-dot': 'pulseDot 1.6s ease-in-out infinite' },
    },
  },
  plugins: [],
};

export default config;
