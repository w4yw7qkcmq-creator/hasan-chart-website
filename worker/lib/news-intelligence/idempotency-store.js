const {
  createInMemoryPublicationStore,
  createSupabasePublicationStore,
  createPublicationStore,
  BLOCK_REASONS,
} = require("./publication-store");

function createInMemoryIdempotencyStore() {
  return createInMemoryPublicationStore();
}

function createSupabaseIdempotencyStore(supabase, options = {}) {
  return createSupabasePublicationStore(supabase, options);
}

module.exports = {
  createInMemoryIdempotencyStore,
  createSupabaseIdempotencyStore,
  createPublicationStore,
  BLOCK_REASONS,
};
