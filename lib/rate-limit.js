

const requests = new Map();

export function rateLimit({
  windowMs = 15 * 60 * 1000,
  max = 10,
} = {}) {
  return function check(identifier) {
    const now = Date.now();

    const current = requests.get(identifier) || {
      count: 0,
      resetTime: now + windowMs,
    };

    if (now > current.resetTime) {
      current.count = 0;
      current.resetTime = now + windowMs;
    }

    current.count += 1;
    requests.set(identifier, current);

    return {
      success: current.count <= max,
      remaining: Math.max(0, max - current.count),
      resetTime: current.resetTime,
    };
  };
}

export const accountManagementLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 1,
});

export const analysisRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
});

export const alertLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
});