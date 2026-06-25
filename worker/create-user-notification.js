function normalizeEmail(userEmail) {
  return String(userEmail || "").trim().toLowerCase();
}

async function createUserNotification(
  supabase,
  { userEmail, title, message, type }
) {
  const normalizedEmail = normalizeEmail(userEmail);

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

module.exports = {
  createUserNotification,
};
