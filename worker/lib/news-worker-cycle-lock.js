const LOCK_TTL_MS = 120_000;
let inMemoryLocked = false;
let lockOwner = null;
let lockAcquiredAt = 0;

function getInstanceId() {
  return (
    process.env.RAILWAY_REPLICA_ID ||
    process.env.RAILWAY_DEPLOYMENT_ID ||
    process.env.HOSTNAME ||
    `pid-${process.pid}`
  );
}

function acquireCycleLock() {
  const now = Date.now();
  if (inMemoryLocked && now - lockAcquiredAt > LOCK_TTL_MS) {
    inMemoryLocked = false;
    lockOwner = null;
  }
  if (inMemoryLocked) {
    return { acquired: false, reason: "overlap", owner: lockOwner };
  }
  inMemoryLocked = true;
  lockOwner = getInstanceId();
  lockAcquiredAt = now;
  return { acquired: true, owner: lockOwner };
}

function releaseCycleLock() {
  inMemoryLocked = false;
  lockOwner = null;
  lockAcquiredAt = 0;
}

function isCycleInFlight() {
  if (!inMemoryLocked) return false;
  if (Date.now() - lockAcquiredAt > LOCK_TTL_MS) {
    releaseCycleLock();
    return false;
  }
  return true;
}

function resetCycleLockForTests() {
  releaseCycleLock();
}

module.exports = {
  acquireCycleLock,
  releaseCycleLock,
  isCycleInFlight,
  resetCycleLockForTests,
  LOCK_TTL_MS,
};
