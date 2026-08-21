import { randomUUID } from "node:crypto";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createMockSupabase(initial = {}) {
  const state = {
    posts: [],
    images: [],
    buffer: [],
    groupState: [],
    ingress: [],
    storage: new Map(),
    rpcHandlers: {},
    ...(initial.state || {}),
  };

  const supabase = {
    state,
    storage: {
      from(bucket) {
        return {
          async upload(path, buffer) {
            state.storage.set(`${bucket}:${path}`, Buffer.from(buffer));
            return { data: { path }, error: null };
          },
          async remove(paths) {
            for (const path of paths) {
              state.storage.delete(`telegram-content-images:${path}`);
            }
            return { data: paths.map((name) => ({ name })), error: null };
          },
        };
      },
    },
    from(table) {
      return createTableBuilder(table, state);
    },
    rpc(name, args) {
      const handler = state.rpcHandlers[name] || initial.rpc?.[name];
      if (!handler) {
        return Promise.resolve({ data: null, error: { message: `missing rpc ${name}` } });
      }
      return Promise.resolve({ data: handler(args, state), error: null });
    },
  };

  return supabase;
}

function createTableBuilder(table, state) {
  const ctx = {
    table,
    state,
    filters: [],
    orderBy: null,
    limitCount: null,
    mutation: null,
    mutationConflict: null,
    selectColumns: "*",
    maybeSingle: false,
    countExact: false,
  };

  const api = {
    select(columns = "*", options = {}) {
      ctx.selectColumns = columns;
      ctx.countExact = options.count === "exact";
      return api;
    },
    eq(column, value) {
      ctx.filters.push({ op: "eq", column, value });
      return api;
    },
    lte(column, value) {
      ctx.filters.push({ op: "lte", column, value });
      return api;
    },
    is(column, value) {
      ctx.filters.push({ op: "is", column, value });
      return api;
    },
    order(column, options = {}) {
      ctx.orderBy = { column, ascending: options.ascending !== false };
      return api;
    },
    limit(n) {
      ctx.limitCount = n;
      return api;
    },
    maybeSingle() {
      ctx.maybeSingle = true;
      return api;
    },
    insert(row) {
      ctx.mutation = { type: "insert", row: clone(row) };
      return api;
    },
    upsert(row, options = {}) {
      ctx.mutation = { type: "upsert", row: clone(row), onConflict: options.onConflict || null };
      return api;
    },
    update(patch) {
      ctx.mutation = { type: "update", patch: clone(patch) };
      return api;
    },
    delete() {
      ctx.mutation = { type: "delete" };
      return api;
    },
    single() {
      ctx.maybeSingle = true;
      return execute(ctx);
    },
    then(resolve, reject) {
      return execute(ctx).then(resolve, reject);
    },
  };

  return api;
}

function getTableRows(table, state) {
  switch (table) {
    case "telegram_content_posts":
      return state.posts;
    case "telegram_content_images":
      return state.images;
    case "telegram_media_group_buffer":
      return state.buffer;
    case "telegram_media_group_state":
      return state.groupState;
    case "telegram_webhook_ingress_log":
      return state.ingress;
    default:
      return [];
  }
}

function applyFilters(rows, filters) {
  return rows.filter((row) =>
    filters.every((filter) => {
      if (filter.op === "eq") return row[filter.column] === filter.value;
      if (filter.op === "lte") return row[filter.column] <= filter.value;
      if (filter.op === "is") return row[filter.column] === filter.value;
      return true;
    })
  );
}

function uniqueConflict(table, row, onConflict, state) {
  if (table === "telegram_webhook_ingress_log") {
    return state.ingress.some((item) => item.telegram_update_id === row.telegram_update_id);
  }
  if (table === "telegram_media_group_buffer") {
    return state.buffer.some(
      (item) =>
        item.telegram_channel_id === row.telegram_channel_id &&
        item.telegram_message_id === row.telegram_message_id
    );
  }
  if (table === "telegram_content_posts") {
    if (row.telegram_media_group_id) {
      return state.posts.some(
        (item) =>
          item.telegram_channel_id === row.telegram_channel_id &&
          item.telegram_media_group_id === row.telegram_media_group_id &&
          item.sync_status === "published"
      );
    }
    return state.posts.some(
      (item) =>
        item.telegram_channel_id === row.telegram_channel_id &&
        item.telegram_message_id === row.telegram_message_id &&
        !item.telegram_media_group_id &&
        item.sync_status === "published"
    );
  }
  if (table === "telegram_media_group_state" && onConflict) {
    return state.groupState.some(
      (item) =>
        item.telegram_channel_id === row.telegram_channel_id &&
        item.telegram_media_group_id === row.telegram_media_group_id
    );
  }
  return false;
}

function execute(ctx) {
  const rows = getTableRows(ctx.table, ctx.state);
  const filtered = applyFilters(rows, ctx.filters);

  if (ctx.mutation?.type === "insert") {
    const inputRows = Array.isArray(ctx.mutation.row) ? ctx.mutation.row : [ctx.mutation.row];
    const inserted = [];

    for (const input of inputRows) {
      const row = { id: randomUUID(), created_at: new Date().toISOString(), ...input };
      if (uniqueConflict(ctx.table, row, null, ctx.state)) {
        return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } });
      }
      rows.push(row);
      inserted.push(row);
    }

    return Promise.resolve({ data: ctx.maybeSingle ? inserted[0] : inserted, error: null });
  }

  if (ctx.mutation?.type === "upsert") {
    const row = { ...ctx.mutation.row };
    const existingIndex = rows.findIndex((item) => {
      if (ctx.table === "telegram_media_group_state") {
        return (
          item.telegram_channel_id === row.telegram_channel_id &&
          item.telegram_media_group_id === row.telegram_media_group_id
        );
      }
      if (ctx.table === "telegram_media_group_buffer") {
        return (
          item.telegram_channel_id === row.telegram_channel_id &&
          item.telegram_message_id === row.telegram_message_id
        );
      }
      return false;
    });

    if (existingIndex >= 0) {
      rows[existingIndex] = { ...rows[existingIndex], ...row };
      return Promise.resolve({ data: rows[existingIndex], error: null });
    }

    if (ctx.table === "telegram_media_group_buffer" && uniqueConflict(ctx.table, row, null, ctx.state)) {
      return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } });
    }

    rows.push({ id: randomUUID(), ...row });
    return Promise.resolve({ data: row, error: null });
  }

  if (ctx.mutation?.type === "update") {
    let updated = null;
    for (let i = 0; i < rows.length; i += 1) {
      const matches = ctx.filters.every((filter) => {
        if (filter.op === "eq") return rows[i][filter.column] === filter.value;
        return true;
      });
      if (matches) {
        rows[i] = { ...rows[i], ...ctx.mutation.patch };
        updated = rows[i];
      }
    }
    return Promise.resolve({ data: ctx.maybeSingle ? updated : updated ? [updated] : [], error: null });
  }

  if (ctx.mutation?.type === "delete") {
    const shouldDelete = (row) =>
      ctx.filters.every((filter) => (filter.op === "eq" ? row[filter.column] === filter.value : true));
    const remaining = rows.filter((row) => !shouldDelete(row));
    rows.length = 0;
    rows.push(...remaining);
    return Promise.resolve({ data: null, error: null });
  }

  let result = [...filtered];
  if (ctx.orderBy) {
    result.sort((a, b) => {
      const av = a[ctx.orderBy.column];
      const bv = b[ctx.orderBy.column];
      if (av === bv) return 0;
      return ctx.orderBy.ascending ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });
  }
  if (ctx.limitCount !== null) {
    result = result.slice(0, ctx.limitCount);
  }

  return Promise.resolve({
    data: ctx.maybeSingle ? result[0] || null : result,
    error: null,
    count: ctx.countExact ? result.length : undefined,
  });
}

export function installRetentionRpc(stateRef) {
  stateRef.rpcHandlers.enforce_telegram_section_retention = ({ p_section, p_limit }) => {
    const eligible = stateRef.posts
      .filter(
        (post) =>
          post.section === p_section &&
          post.sync_status === "published" &&
          post.qualification_status === "eligible"
      )
      .sort((a, b) => new Date(a.published_at) - new Date(b.published_at));

    const excess = eligible.length - p_limit;
    if (excess <= 0) return [];

    return eligible.slice(0, excess).map((post) => ({
      deleted_post_id: post.id,
      storage_paths: stateRef.images
        .filter((img) => img.post_id === post.id)
        .map((img) => img.storage_path),
    }));
  };

  stateRef.rpcHandlers.cleanup_telegram_content_operational_tables = () => [
    {
      ingress_deleted: 0,
      buffer_deleted: 0,
      group_state_deleted: 0,
    },
  ];
}

export function makePngBuffer() {
  // 10x10 PNG — satisfies TELEGRAM_CONTENT_MIN_DIMENSION (=10)
  return Buffer.from(
    "89504e470d0a1a0a0000000d494844520000000a0000000a08060000001a0b090f0000001049444154789ec4010000000500010d0a2db10000000049454e44ae426082",
    "hex"
  );
}

export function makeOversizeBuffer() {
  return Buffer.alloc(8 * 1024 * 1024 + 1, 1);
}

export function makeCorruptBuffer() {
  return Buffer.from("not-an-image", "utf8");
}
