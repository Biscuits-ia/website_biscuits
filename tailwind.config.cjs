/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.astro",
    "./src/**/*.svelte",
    "./src/**/*.js",
    "./src/**/*.ts",
    "./public/**/*.html"
  ],
  theme: {
    extend: {}
  },
  darkMode: "class",
  corePlugins: {
    preflight: true
  }
};