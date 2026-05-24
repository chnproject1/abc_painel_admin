/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        avocado: {
          50:  "#f4f7ee",
          100: "#e5edcf",
          200: "#ccdc9f",
          300: "#aac568",
          400: "#8aad3e",
          500: "#6b9228",
          600: "#52731e",
          700: "#3f591a",
          800: "#344817",
          900: "#2b3c15",
        },
      },
    },
  },
  plugins: [],
};
