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

export const THEME_CRITICAL_CSS = `
html[data-theme="dark"],
html[data-theme="dark"] body {
  background: #020617;
  color: #ffffff;
}

html[data-theme="light"],
html[data-theme="light"] body {
  background: #edf7ff;
  color: #0f172a;
}
`;
