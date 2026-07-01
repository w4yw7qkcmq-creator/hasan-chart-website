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

  const payload = {
    user_email: normalizedEmail,
    title: String(title).trim(),
    message: String(message || "").trim(),
    type,
    is_read: false,
  };

  const { data, error } = await supabase
    .from("notifications")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    console.error(
      "notifications:insert:error",
      JSON.stringify({
        userEmail: normalizedEmail,
        type,
        code: error.code || null,
        message: error.message || String(error),
      })
    );
  }

  return { data, error };
}

module.exports = {
  createUserNotification,
};
