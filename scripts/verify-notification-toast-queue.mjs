/**
 * Sanity check for toast queue behavior (one toast at a time + gap).
 * Run: node scripts/verify-notification-toast-queue.mjs
 */

const TOAST_TTL_MS = 100;
const TOAST_GAP_MS = 50;

function runQueueTest() {
  const events = [];
  const queue = [];
  let showing = false;
  let hideTimer = null;
  let gapTimer = null;
  let active = null;

  const clearTimers = () => {
    if (hideTimer) clearTimeout(hideTimer);
    if (gapTimer) clearTimeout(gapTimer);
    hideTimer = null;
    gapTimer = null;
  };

  const isCycleActive = () => showing || hideTimer || gapTimer;

  const showNext = () => {
    if (showing) return;
    const next = queue.shift();
    if (!next) {
      showing = false;
      active = null;
      return;
    }

    showing = true;
    active = next;
    events.push({ t: Date.now(), type: "show", id: next.id });

    hideTimer = setTimeout(() => {
      hideTimer = null;
      showing = false;
      events.push({ t: Date.now(), type: "hide", id: next.id });
      active = null;

      if (queue.length > 0) {
        gapTimer = setTimeout(() => {
          gapTimer = null;
          showNext();
        }, TOAST_GAP_MS);
      }
    }, TOAST_TTL_MS);
  };

  const enqueue = (id) => {
    queue.push({ id });
    if (!isCycleActive()) showNext();
  };

  return new Promise((resolve, reject) => {
    enqueue("a");
    enqueue("b");
    enqueue("c");

    setTimeout(() => {
      clearTimers();

      const shows = events.filter((e) => e.type === "show");
      const hides = events.filter((e) => e.type === "hide");

      if (shows.length !== 3) {
        reject(new Error(`Expected 3 shows, got ${shows.length}`));
        return;
      }

      if (hides.length !== 3) {
        reject(new Error(`Expected 3 hides, got ${hides.length}`));
        return;
      }

      for (let i = 1; i < shows.length; i += 1) {
        const gap = shows[i].t - hides[i - 1].t;
        if (gap < TOAST_GAP_MS - 5) {
          reject(new Error(`Gap between toast ${i - 1} and ${i} too short: ${gap}ms`));
          return;
        }
      }

      const overlapping = shows.some((show, index) => {
        const nextShow = shows[index + 1];
        if (!nextShow) return false;
        const hideForShow = hides.find((hide) => hide.id === show.id);
        return hideForShow.t > nextShow.t;
      });

      if (overlapping) {
        reject(new Error("Toasts overlapped on screen"));
        return;
      }

      resolve({ ok: true, shows: shows.map((e) => e.id) });
    }, 800);
  });
}

runQueueTest()
  .then((result) => {
    console.log("✅ Toast queue test passed:", result.shows.join(" → "));
  })
  .catch((error) => {
    console.error("❌ Toast queue test failed:", error.message);
    process.exit(1);
  });
