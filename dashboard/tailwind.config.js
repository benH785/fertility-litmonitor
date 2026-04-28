/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Display serif — Newsreader, designed for screen reading
        display: ['"Newsreader"', "Georgia", "serif"],
        // UI sans — refined, distinctive
        sans: ['"Inter Tight"', "-apple-system", "system-ui", "sans-serif"],
        // Technical metadata
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        // Editorial palette: warm cream paper + deep ink + restrained accent
        paper: "#F7F4ED",
        "paper-dim": "#EFEAE0",
        ink: "#1A1611",
        "ink-soft": "#3D362F",
        muted: "#6B6660",
        "muted-soft": "#9A9388",
        rule: "#E5E2DA",
        accent: "#9A2A2A",       // muted burgundy for priority indicators
        "accent-soft": "#C66565",
        teal: "#1E5F5F",         // for links
      },
      maxWidth: {
        reading: "65ch",
      },
      letterSpacing: {
        smallcaps: "0.08em",
      },
    },
  },
  plugins: [],
};
