const crypto = require("crypto");
const { allowMemoryIdempotencyFallback, isProductionRuntime } = require("./runtime-mode");

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

function createInMemoryPublicationStore(options = {}) {
  const identities = new Map();

  return {
    mode: "memory",
    async acquirePublicationIdentity(record) {
      const key = buildIdentityKey(record);
      const existing = identities.get(key);
      if (existing) {
        return { acquired: false, reason: BLOCK_REASONS.DUPLICATE_BLOCKED, record: existing, memoryOnly: true };
      }
      const created = createPublicationRecord(record);
      identities.set(key, created);
      return { acquired: true, record: created, memoryOnly: true };
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
  };
}

function createSupabasePublicationStore(supabase, options = {}) {
  const memoryStore = createInMemoryPublicationStore(options);
  const production = isProductionRuntime(options);
  const allowMemoryFallback = allowMemoryIdempotencyFallback(options);

  async function acquirePublicationIdentity(record) {
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
  createPublicationRecord,
  createInMemoryPublicationStore,
  createSupabasePublicationStore,
  createPublicationStore,
};
