/** Fixed screenshot filenames for visual regression. */
export const SCREENSHOT_PAGES = Object.freeze([
  { file: "01-home.png", path: "/", name: "Home", slug: "home" },
  { file: "02-login.png", path: "/login", name: "Login", slug: "login" },
  { file: "03-dashboard.png", path: "/my-dashboard", name: "Dashboard", slug: "dashboard", auth: "user" },
  { file: "05-news.png", path: "/news", name: "News", slug: "news" },
  { file: "06-order-book.png", path: "/order-book?symbol=BTCUSDT", name: "Order Book", slug: "order-book" },
  {
    file: "07-subscription.png",
    path: "/subscriptions",
    name: "Subscription",
    slug: "subscription",
    auth: "user",
  },
  { file: "08-admin.png", path: "/admin", name: "Admin", slug: "admin", auth: "admin" },
]);

export const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
