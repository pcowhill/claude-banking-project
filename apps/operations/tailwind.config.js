/** @type {import('tailwindcss').Config} */
// Brand palette mirrors packages/shared/src/brand.ts (BRAND_COLORS).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#0A2540',
          'navy-deep': '#071B30',
          teal: '#0EA5A4',
          'teal-dark': '#0B7E7D',
          gold: '#E0A82E',
          'gold-soft': '#F2C14E',
          ink: '#0F172A',
          mist: '#F1F5F9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
