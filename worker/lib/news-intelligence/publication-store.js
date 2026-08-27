const crypto = require("crypto");
const { allowMemoryIdempotencyFallback, isProductionRuntime } = require("./runtime-mode");
const { PUBLICATION_TYPES } = require("./publication-types");
const {
  buildReleaseBucketIdentity,
  legacyEventKeyMatchesReleaseBucket,
} = require("./release-identity-compat");

const LEG_STATUS = {
  PENDING: "pending",
  SUCCESS: "success",
  FAILED: "failed",
  SKIPPED: "skipped",
};

const BLOCK_REASONS = {
  DUPLICATE_BLOCKED: "DUPLICATE_BLOCKED",
  IDEMPOTENCY_STORE_UNAVAILABLE: "IDEMPOTENCY_STORE_UNAVAILABLE",
  LOCK_ERROR: "LOCK_ERROR",
};

function buildIdentityKey({ eventKey, publicationType }) {
  return `${eventKey}|${publicationType}`;
}

function buildEventFingerprintKey({ eventFingerprint, publicationType }) {
  return `${eventFingerprint}|${publicationType}`;
}

function createPublicationRecord(input) {
  return {
    id: input.id || crypto.randomUUID(),
    eventKey: input.eventKey,
    publicationType: input.publicationType,
    sourceType: input.sourceType || null,
    sourceId: input.sourceId || null,
    metadata: input.metadata || {},
    telegramLegStatus: input.telegramLegStatus || LEG_STATUS.PENDING,
    siteLegStatus: input.siteLegStatus || LEG_STATUS.PENDING,
    acquiredAt: input.acquiredAt || new Date().toISOString(),
  };
}

function findLegacyBucketIdentityMatch(identities, targetIdentity, publicationType) {
  if (!targetIdentity || publicationType !== PUBLICATION_TYPES.RELEASE) {
    return null;
  }

  for (const record of identities.values()) {
    if (record.publicationType !== publicationType) {
      continue;
    }
    if (legacyEventKeyMatchesReleaseBucket(record.eventKey, targetIdentity)) {
      return record;
    }
  }

  return null;
}

function createInMemoryPublicationStore(options = {}) {
  const identities = new Map();
  const eventFingerprints = new Map();

  function findPublishedReleaseIdentity(input = {}) {
    const targetIdentity = buildReleaseBucketIdentity(input);
    const publicationType = input.publicationType;

    if (input.eventFingerprint) {
      const existingFingerprint = eventFingerprints.get(
        buildEventFingerprintKey({ eventFingerprint: input.eventFingerprint, publicationType })
      );
      if (existingFingerprint) {
        return { record: existingFingerprint, duplicateBy: "event_fingerprint" };
      }
    }

    if (input.eventKey) {
      const exact = identities.get(buildIdentityKey({ eventKey: input.eventKey, publicationType }));
      if (exact) {
        return { record: exact, duplicateBy: "event_key" };
      }
    }

    const legacyMatch = findLegacyBucketIdentityMatch(identities, targetIdentity, publicationType);
    if (legacyMatch) {
      return { record: legacyMatch, duplicateBy: "legacy_event_key_bucket" };
    }

    return null;
  }

  return {
    mode: "memory",
    findPublishedReleaseIdentity,
    async acquirePublicationIdentity(record) {
      const existingRelease = findPublishedReleaseIdentity({
        eventKey: record.eventKey,
        eventFingerprint: record.metadata?.eventFingerprint || null,
        country: record.metadata?.country || null,
        eventType: record.metadata?.eventType || null,
        releaseDate: record.metadata?.sourcePublishedAt || record.metadata?.releaseDate || null,
        period: record.metadata?.facts?.period || record.metadata?.period || null,
        publicationType: record.publicationType,
      });
      if (existingRelease) {
        return {
          acquired: false,
          reason: BLOCK_REASONS.DUPLICATE_BLOCKED,
          record: existingRelease.record,
          memoryOnly: true,
          duplicateBy: existingRelease.duplicateBy,
        };
      }

      const eventFingerprint = record.metadata?.eventFingerprint || null;
      const key = buildIdentityKey(record);
      const created = createPublicationRecord(record);
      identities.set(key, created);
      if (eventFingerprint) {
        eventFingerprints.set(
          buildEventFingerprintKey({
            eventFingerprint,
            publicationType: record.publicationType,
          }),
          created
        );
      }
      return { acquired: true, record: created, memoryOnly: true };
    },
    async hasPublishedEventFingerprint(eventFingerprint, publicationType) {
      if (!eventFingerprint) {
        return null;
      }
      const existing = findPublishedReleaseIdentity({ eventFingerprint, publicationType });
      return existing?.record || null;
    },
    async getPublicationIdentity(record) {
      return identities.get(buildIdentityKey(record)) || null;
    },
    async updateDeliveryLeg(record, leg, status) {
      const key = buildIdentityKey(record);
      const existing = identities.get(key);
      if (!existing) {
        return null;
      }
      if (leg === "telegram") {
        existing.telegramLegStatus = status;
      } else if (leg === "site") {
        existing.siteLegStatus = status;
      }
      identities.set(key, existing);
      return existing;
    },
    _identities: identities,
    _eventFingerprints: eventFingerprints,
  };
}

function createSupabasePublicationStore(supabase, options = {}) {
  const memoryStore = createInMemoryPublicationStore(options);
  const production = isProductionRuntime(options);
  const allowMemoryFallback = allowMemoryIdempotencyFallback(options);

  async function hasPublishedEventFingerprint(eventFingerprint, publicationType) {
    if (!eventFingerprint) {
      return null;
    }
    const existing = await findPublishedReleaseIdentity({ eventFingerprint, publicationType });
    return existing?.record || null;
  }

  async function findPublishedReleaseIdentity(input = {}) {
    const targetIdentity = buildReleaseBucketIdentity(input);
    const publicationType = input.publicationType;

    if (input.eventFingerprint) {
      if (!supabase) {
        const existing = await memoryStore.findPublishedReleaseIdentity(input);
        if (existing) {
          return existing;
        }
      } else {
        const { data, error } = await supabase
          .from("news_event_publications")
          .select("*")
          .eq("publication_type", publicationType)
          .filter("metadata->>eventFingerprint", "eq", input.eventFingerprint)
          .maybeSingle();

        if (error?.code === "42P01") {
          if (allowMemoryFallback) {
            return memoryStore.findPublishedReleaseIdentity(input);
          }
        } else if (data) {
          return { record: mapDbRow(data), duplicateBy: "event_fingerprint" };
        }
      }
    }

    if (input.eventKey) {
      const exact = await getPublicationIdentity({ eventKey: input.eventKey, publicationType });
      if (exact) {
        return { record: exact, duplicateBy: "event_key" };
      }
    }

    if (!targetIdentity || publicationType !== PUBLICATION_TYPES.RELEASE) {
      return null;
    }

    if (!supabase) {
      return memoryStore.findPublishedReleaseIdentity(input);
    }

    const prefix = `${targetIdentity.country}:${targetIdentity.eventType}:`;
    const { data, error } = await supabase
      .from("news_event_publications")
      .select("*")
      .eq("publication_type", publicationType)
      .like("event_key", `${prefix}%`);

    if (error?.code === "42P01") {
      if (allowMemoryFallback) {
        return memoryStore.findPublishedReleaseIdentity(input);
      }
      return null;
    }

    for (const row of data || []) {
      if (legacyEventKeyMatchesReleaseBucket(row.event_key, targetIdentity)) {
        return { record: mapDbRow(row), duplicateBy: "legacy_event_key_bucket" };
      }
    }

    return null;
  }

  async function acquirePublicationIdentity(record) {
    const existingRelease = await findPublishedReleaseIdentity({
      eventKey: record.eventKey,
      eventFingerprint: record.metadata?.eventFingerprint || null,
      country: record.metadata?.country || null,
      eventType: record.metadata?.eventType || null,
      releaseDate: record.metadata?.sourcePublishedAt || record.metadata?.releaseDate || null,
      period: record.metadata?.facts?.period || record.metadata?.period || null,
      publicationType: record.publicationType,
    });
    if (existingRelease) {
      return {
        acquired: false,
        reason: BLOCK_REASONS.DUPLICATE_BLOCKED,
        dbBacked: Boolean(supabase),
        record: existingRelease.record,
        duplicateBy: existingRelease.duplicateBy,
      };
    }

    if (!supabase) {
      if (production && !allowMemoryFallback) {
        return { acquired: false, reason: BLOCK_REASONS.IDEMPOTENCY_STORE_UNAVAILABLE, detail: "supabase_unconfigured" };
      }
      return memoryStore.acquirePublicationIdentity(record);
    }

    const row = {
      event_key: record.eventKey,
      publication_type: record.publicationType,
      source_type: record.sourceType || null,
      source_id: record.sourceId || null,
      metadata: record.metadata || {},
      telegram_leg_status: LEG_STATUS.PENDING,
      site_leg_status: LEG_STATUS.PENDING,
    };

    const { data, error } = await supabase.from("news_event_publications").insert(row).select("*").maybeSingle();
    if (!error && data) {
      return {
        acquired: true,
        dbBacked: true,
        record: mapDbRow(data),
      };
    }

    if (error?.code === "23505") {
      const existing = await getPublicationIdentity(record);
      return {
        acquired: false,
        reason: BLOCK_REASONS.DUPLICATE_BLOCKED,
        dbBacked: true,
        record: existing,
      };
    }

    if (error?.code === "42P01") {
      if (production && !allowMemoryFallback) {
        return {
          acquired: false,
          reason: BLOCK_REASONS.IDEMPOTENCY_STORE_UNAVAILABLE,
          detail: "table_missing",
          dbBacked: false,
        };
      }
      if (allowMemoryFallback) {
        return memoryStore.acquirePublicationIdentity(record);
      }
      return {
        acquired: false,
        reason: BLOCK_REASONS.IDEMPOTENCY_STORE_UNAVAILABLE,
        detail: "table_missing",
      };
    }

    if (production && !allowMemoryFallback) {
      return {
        acquired: false,
        reason: BLOCK_REASONS.IDEMPOTENCY_STORE_UNAVAILABLE,
        detail: error?.message || "database_error",
        dbBacked: false,
      };
    }

    return { acquired: false, reason: BLOCK_REASONS.LOCK_ERROR, error: error?.message || "database_error" };
  }

  function mapDbRow(row) {
    return createPublicationRecord({
      id: row.id,
      eventKey: row.event_key,
      publicationType: row.publication_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      metadata: row.metadata || {},
      telegramLegStatus: row.telegram_leg_status || LEG_STATUS.PENDING,
      siteLegStatus: row.site_leg_status || LEG_STATUS.PENDING,
      acquiredAt: row.created_at,
    });
  }

  async function getPublicationIdentity(record) {
    if (!supabase) {
      return memoryStore.getPublicationIdentity(record);
    }
    const { data, error } = await supabase
      .from("news_event_publications")
      .select("*")
      .eq("event_key", record.eventKey)
      .eq("publication_type", record.publicationType)
      .maybeSingle();

    if (error?.code === "42P01") {
      if (allowMemoryFallback) {
        return memoryStore.getPublicationIdentity(record);
      }
      return null;
    }
    if (!data) {
      return null;
    }
    return mapDbRow(data);
  }

  async function updateDeliveryLeg(record, leg, status) {
    if (!supabase) {
      return memoryStore.updateDeliveryLeg(record, leg, status);
    }

    const column = leg === "telegram" ? "telegram_leg_status" : "site_leg_status";
    const { data, error } = await supabase
      .from("news_event_publications")
      .update({ [column]: status })
      .eq("event_key", record.eventKey)
      .eq("publication_type", record.publicationType)
      .select("*")
      .maybeSingle();

    if (error || !data) {
      if (allowMemoryFallback) {
        return memoryStore.updateDeliveryLeg(record, leg, status);
      }
      return null;
    }
    return mapDbRow(data);
  }

  return {
    mode: production ? "production" : "supabase",
    acquirePublicationIdentity,
    findPublishedReleaseIdentity,
    hasPublishedEventFingerprint,
    getPublicationIdentity,
    updateDeliveryLeg,
  };
}

function createPublicationStore(options = {}) {
  if (options.store) {
    return options.store;
  }
  if (options.supabase) {
    return createSupabasePublicationStore(options.supabase, options);
  }
  if (allowMemoryIdempotencyFallback(options) || options.forceMemory === true) {
    return createInMemoryPublicationStore(options);
  }
  if (isProductionRuntime(options)) {
    return createSupabasePublicationStore(null, options);
  }
  return createInMemoryPublicationStore(options);
}

module.exports = {
  LEG_STATUS,
  BLOCK_REASONS,
  buildIdentityKey,
  buildEventFingerprintKey,
  createPublicationRecord,
  createInMemoryPublicationStore,
  createSupabasePublicationStore,
  createPublicationStore,
  findLegacyBucketIdentityMatch,
};
