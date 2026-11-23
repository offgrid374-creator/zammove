/** ZamMove design system (Tailwind CSS).
 *  Build:  npm run css        (writes frontend/customer/css/tailwind.css)
 *  Watch:  npm run css:watch
 *  Classes use the "tw-" prefix so they never clash with the app's own class names (.btn, .card, .tag …).
 *  Preflight is off: app.css still owns the base element styles; tw.css re-themes the shared components. */
module.exports = {
  prefix: 'tw-',
  content: [
    './frontend/customer/index.html',
    './frontend/customer/js/**/*.js',
    './frontend/customer/css/tw.css',
  ],
  darkMode: ['class', 'html[data-mode="dark"]'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        /* primary: deep harbor teal (buttons, links, focus) */
        harbor: {
          50: '#eef8f6',
          100: '#d3eee9',
          200: '#a7ddd3',
          300: '#6fc5b7',
          400: '#3aa898',
          500: '#1e8c7e',
          600: '#137266',
          700: '#0f5c53',
          800: '#0e4a44',
          900: '#0c3d39',
          950: '#062523',
        },
        /* the vinta sail stripe: Zamboanga's boat colours, used only as a thin accent */
        vinta: {
          red: '#e0392b',
          orange: '#f28c28',
          yellow: '#f6c343',
          green: '#2ba36b',
          blue: '#2563eb',
          violet: '#7c3aed',
        },
        sand: { 50: '#f7f7f4', 100: '#efeee8' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        sans: ['Geist', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px -4px rgba(15, 23, 42, 0.08)',
        lift: '0 2px 4px rgba(15, 23, 42, 0.06), 0 12px 32px -8px rgba(15, 23, 42, 0.18)',
      },
      borderRadius: { '4xl': '2rem' },
    },
  },
  plugins: [],
};
