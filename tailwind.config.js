/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        what: 'var(--color-what)',
        how: 'var(--color-how)',
        end: 'var(--color-end)',
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        canvas: 'var(--color-bg)',
        panel: 'var(--color-panel)',
        line: 'var(--color-line)',
        alert: 'var(--color-alert)',
        'alert-bg': 'var(--color-alert-bg)',
        'success-bg': 'var(--color-success-bg)',
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
      },
      borderRadius: { DEFAULT: 'var(--radius)' },
      fontFamily: { sans: 'var(--font-sans)' },
    },
  },
  plugins: [],
}
