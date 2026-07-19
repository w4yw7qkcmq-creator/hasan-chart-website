export const THEME_COOKIE_BOOT_SCRIPT = `
(function () {
  var COOKIE_NAME = "hc_theme";

  function readThemeCookie() {
    try {
      var match = document.cookie.match(new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]*)"));
      var value = match ? decodeURIComponent(match[1]) : "";
      return value === "light" ? "light" : "dark";
    } catch (error) {
      return "dark";
    }
  }

  try {
    document.documentElement.setAttribute("data-theme", readThemeCookie());
  } catch (error) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
`;

export const THEME_BOOT_SCRIPT = `
(function () {
  var revealed = false;

  function revealTheme() {
    if (revealed) return;
    revealed = true;

    var root = document.documentElement;
    root.classList.remove("theme-pending");
    root.classList.add("theme-ready");

    var loader = document.getElementById("theme-boot-loader");
    if (loader) {
      loader.setAttribute("aria-busy", "false");
    }
  }

  function scheduleReveal() {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        requestAnimationFrame(revealTheme);
      });
      return;
    }

    setTimeout(revealTheme, 0);
  }

  try {
    scheduleReveal();

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", revealTheme, { once: true });
    } else if (document.readyState !== "complete") {
      window.addEventListener("load", revealTheme, { once: true });
    }

    setTimeout(revealTheme, 1200);
  } catch (error) {
    revealTheme();
  }
})();
`;

export const THEME_CRITICAL_CSS = `
html.theme-pending,
html.theme-pending body {
  overflow: hidden;
  background: #020617;
  color: #ffffff;
}

html[data-theme="light"].theme-pending,
html[data-theme="light"].theme-pending body {
  background: #edf7ff;
  color: #0f172a;
}

html.theme-pending #site-root {
  pointer-events: none !important;
}

html.theme-ready #site-root {
  pointer-events: auto;
}

#theme-boot-loader {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: none;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem;
  text-align: center;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  background: #020617;
  color: #ffffff;
}

html[data-theme="light"] #theme-boot-loader {
  background: #edf7ff;
  color: #0f172a;
}

html.theme-pending #theme-boot-loader {
  display: flex !important;
}

html.theme-ready #theme-boot-loader {
  display: none !important;
}

@keyframes themeBootSpin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes themeBootPulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.88;
    transform: scale(0.98);
  }
}

.theme-boot-logo {
  display: grid;
  place-items: center;
  width: 5.5rem;
  height: 5.5rem;
  border-radius: 1.75rem;
  border: 1px solid rgba(34, 211, 238, 0.35);
  background: linear-gradient(135deg, rgba(11, 99, 255, 0.45), rgba(0, 163, 255, 0.18) 55%, #020617);
  box-shadow: 0 0 50px rgba(0, 163, 255, 0.35);
  font-size: 1.5rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  animation: themeBootPulse 2.2s ease-in-out infinite;
}

html[data-theme="light"] .theme-boot-logo {
  border-color: rgba(37, 99, 235, 0.28);
  background: linear-gradient(135deg, #ffffff, #dff1ff 60%, #cfe9ff);
  box-shadow: 0 18px 50px rgba(37, 99, 235, 0.18);
  color: #0f172a;
}

.theme-boot-spinner {
  width: 3rem;
  height: 3rem;
  border-radius: 9999px;
  border: 3px solid rgba(34, 211, 238, 0.18);
  border-top-color: #22d3ee;
  animation: themeBootSpin 0.85s linear infinite;
}

html[data-theme="light"] .theme-boot-spinner {
  border-color: rgba(37, 99, 235, 0.16);
  border-top-color: #2563eb;
}

.theme-boot-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 800;
  line-height: 1.5;
}

.theme-boot-subtitle {
  margin: 0;
  font-size: 0.875rem;
  opacity: 0.72;
  line-height: 1.6;
}
`;
