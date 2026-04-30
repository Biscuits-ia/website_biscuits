// tailwind.config.mjs — configuration couleurs métiers
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        corps: {
          dev: { DEFAULT: '#2563eb', bg: '#dbeafe' },
          db: { DEFAULT: '#7c3aed', bg: '#ede9fe' },
          design: { DEFAULT: '#f97316', bg: '#ffedd5' },
          qa: { DEFAULT: '#16a34a', bg: '#dcfce7' },
          data: { DEFAULT: '#0d9488', bg: '#ccfbf1' },
          pm: { DEFAULT: '#dc2626', bg: '#fee2e2' },
        },
      },
    },
  },
  plugins: [],
};
