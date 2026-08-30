import { THEME_COLOR_DARK } from "../lib/theme-shared";

export default function manifest() {
  return {
    name: "HasaN CharT World",
    short_name: "HasaN CharT",
    start_url: "/",
    display: "standalone",
    background_color: THEME_COLOR_DARK,
    theme_color: THEME_COLOR_DARK,
    icons: [
      {
        src: "/favicon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
