import { query } from "./test-db.mjs";

export function createServiceSupabaseFromDb(db) {
  return {
    async rpc(fn, params = {}) {
      const entries = Object.entries(params);
      const values = entries.map(([, v]) => v);
      const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
      try {
        const res = await query(db, `SELECT public.${fn}(${placeholders}) AS result`, values);
        return { data: res.rows[0]?.result, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    from(table) {
      const ctx = {
        table,
        filters: [],
        rangeFilters: [],
        notNullCol: null,
        cols: "*",
        payload: null,
        op: "select",
        countOnly: false,
        single: false,
        onConflict: null,
        inCol: null,
        inVals: null,
        order: null,
        limit: null,
      };
      const builder = {
        select(cols, opts) {
          ctx.cols = cols;
          ctx.countOnly = Boolean(opts?.head && opts?.count);
          if (!["insert", "upsert", "update"].includes(ctx.op)) {
            ctx.op = "select";
          }
          return builder;
        },
        insert(row) {
          ctx.op = "insert";
          ctx.payload = row;
          return builder;
        },
        upsert(row, opts) {
          ctx.op = "upsert";
          ctx.payload = row;
          ctx.onConflict = opts?.onConflict;
          return builder;
        },
        update(row) {
          ctx.op = "update";
          ctx.payload = row;
          return builder;
        },
        eq(col, val) {
          ctx.filters.push([col, val]);
          return builder;
        },
        in(col, vals) {
          ctx.inCol = col;
          ctx.inVals = vals;
          return builder;
        },
        gte(col, val) {
          ctx.rangeFilters.push(["gte", col, val]);
          return builder;
        },
        lte(col, val) {
          ctx.rangeFilters.push(["lte", col, val]);
          return builder;
        },
        neq(col, val) {
          ctx.rangeFilters.push(["neq", col, val]);
          return builder;
        },
        not(col, op) {
          if (op === "is") ctx.notNullCol = col;
          return builder;
        },
        order(col, { ascending = true } = {}) {
          ctx.order = [col, ascending];
          return builder;
        },
        limit(n) {
          ctx.limit = n;
          return builder;
        },
        maybeSingle() {
          ctx.single = true;
          return builder._run();
        },
        single() {
          ctx.single = true;
          return builder._run();
        },
        then(resolve, reject) {
          return builder._run().then(resolve, reject);
        },
        async _run() {
          if (ctx.op === "insert") {
            const cols = Object.keys(ctx.payload);
            const vals = Object.values(ctx.payload);
            try {
              const res = await query(
                db,
                `INSERT INTO public.${ctx.table} (${cols.join(", ")}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
                vals
              );
              return { data: ctx.single ? res.rows[0] : res.rows, error: null };
            } catch (error) {
              return { data: null, error };
            }
          }
          if (ctx.op === "upsert") {
            const cols = Object.keys(ctx.payload);
            const vals = Object.values(ctx.payload);
            const updates = cols.map((c) => `${c} = EXCLUDED.${c}`).join(", ");
            const res = await query(
              db,
              `INSERT INTO public.${ctx.table} (${cols.join(", ")}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(", ")})
               ON CONFLICT (${ctx.onConflict}) DO UPDATE SET ${updates} RETURNING *`,
              vals
            );
            return { data: ctx.single ? res.rows[0] : res.rows, error: null };
          }
          if (ctx.op === "update") {
            const sets = Object.entries(ctx.payload).map(([k], i) => `${k} = $${i + 1}`);
            const vals = Object.values(ctx.payload);
            const wh = ctx.filters.map(([c], i) => `${c} = $${vals.length + i + 1}`).join(" AND ");
            vals.push(...ctx.filters.map(([, v]) => v));
            const res = await query(db, `UPDATE public.${ctx.table} SET ${sets.join(", ")} WHERE ${wh} RETURNING *`, vals);
            return { data: res.rows, error: null };
          }
          let sql = ctx.countOnly
            ? `SELECT count(*)::int AS c FROM public.${ctx.table}`
            : `SELECT ${ctx.cols} FROM public.${ctx.table}`;
          const vals = [];
          const wh = [];
          ctx.filters.forEach(([c, v]) => {
            vals.push(v);
            wh.push(`${c} = $${vals.length}`);
          });
          if (ctx.inCol) {
            vals.push(ctx.inVals);
            wh.push(`${ctx.inCol} = ANY($${vals.length})`);
          }
          ctx.rangeFilters.forEach(([op, c, v]) => {
            vals.push(v);
            if (op === "gte") wh.push(`${c} >= $${vals.length}`);
            if (op === "lte") wh.push(`${c} <= $${vals.length}`);
            if (op === "neq") wh.push(`${c} <> $${vals.length}`);
          });
          if (ctx.notNullCol) wh.push(`${ctx.notNullCol} IS NOT NULL`);
          if (wh.length) sql += ` WHERE ${wh.join(" AND ")}`;
          if (ctx.order) sql += ` ORDER BY ${ctx.order[0]} ${ctx.order[1] ? "ASC" : "DESC"}`;
          if (ctx.limit) sql += ` LIMIT ${ctx.limit}`;
          const res = await query(db, sql, vals);
          if (ctx.countOnly) return { data: null, error: null, count: res.rows[0]?.c || 0 };
          return { data: ctx.single ? res.rows[0] || null : res.rows, error: null, count: res.rows.length };
        },
      };
      return builder;
    },
  };
}
