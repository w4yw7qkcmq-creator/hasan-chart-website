export async function createUserNotification(
  supabase,
  { userEmail, title, message, type }
) {
  const normalizedEmail = String(userEmail || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail || !title || !type) {
    return { data: null, error: new Error("Missing notification fields") };
  }

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_email: normalizedEmail,
      title: String(title).trim(),
      message: String(message || "").trim(),
      type,
      is_read: false,
    })
    .select("*")
    .single();

  return { data, error };
}

export async function createUserNotifications(supabase, notifications = []) {
  const rows = notifications
    .map(({ userEmail, title, message, type }) => {
      const normalizedEmail = String(userEmail || "")
        .trim()
        .toLowerCase();

      if (!normalizedEmail || !title || !type) return null;

      return {
        user_email: normalizedEmail,
        title: String(title).trim(),
        message: String(message || "").trim(),
        type,
        is_read: false,
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from("notifications")
    .insert(rows)
    .select("*");

  return { data, error };
}
