/**
 * Bounded await helper — prevents hung external dependencies from blocking auth paths.
 */
export async function withBoundedTimeout(promise, ms, label = "operation") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timeout:${label}:${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function isTimeoutError(error) {
  return String(error?.message || error).startsWith("timeout:");
}
