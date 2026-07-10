export function isDevEnvironment() {
  return process.env.NODE_ENV !== "production";
}

export function devLog(...args) {
  if (isDevEnvironment()) {
    console.log(...args);
  }
}

export function devWarn(...args) {
  if (isDevEnvironment()) {
    console.warn(...args);
  }
}
