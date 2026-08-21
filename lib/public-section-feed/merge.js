export function mergeFeedItemsByPublishedAt(items = [], { cap = 100 } = {}) {
  const sorted = [...items].sort((a, b) => {
    const aTime = new Date(a.published_at || a.createdAt || a.created_at || 0).getTime();
    const bTime = new Date(b.published_at || b.createdAt || b.created_at || 0).getTime();
    return bTime - aTime;
  });

  if (!cap || cap <= 0) return sorted;
  return sorted.slice(0, cap);
}
