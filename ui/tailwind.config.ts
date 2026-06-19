import type { Config } from 'tailwindcss';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        'primary':             'rgb(var(--color-primary) / <alpha-value>)',
        'primary-hover':       'rgb(var(--color-primary-hover) / <alpha-value>)',
        'secondary':           'rgb(var(--color-secondary) / <alpha-value>)',
        'secondary-hover':     'rgb(var(--color-secondary-hover) / <alpha-value>)',
        'background':          'rgb(var(--color-background) / <alpha-value>)',
        'surface':             'rgb(var(--color-surface) / <alpha-value>)',
        'surface-warm':        'rgb(var(--color-surface-warm) / <alpha-value>)',
        'on-surface':          'rgb(var(--color-on-surface) / <alpha-value>)',
        'on-surface-variant':  'rgb(var(--color-on-surface-variant) / <alpha-value>)',
        'on-primary':          'rgb(var(--color-on-primary) / <alpha-value>)',
        'skin-border':         'rgb(var(--color-border) / <alpha-value>)',
        'blush':               'rgb(var(--color-accent-blush) / <alpha-value>)',
        'sage':                'rgb(var(--color-accent-sage) / <alpha-value>)',
      },
    },
  },
  plugins: [],
} satisfies Config;
