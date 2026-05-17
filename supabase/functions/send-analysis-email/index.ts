import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-secret",
};

const ADMIN_EMAIL_SECRET = Deno.env.get("ADMIN_EMAIL_SECRET") || "";

const escapeHtml = (value: string) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("\n", "<br />");

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const providedSecret = req.headers.get("x-admin-secret") || "";

    if (!ADMIN_EMAIL_SECRET || providedSecret !== ADMIN_EMAIL_SECRET) {
      return jsonResponse({ error: "Unauthorized email request" }, 401);
    }

    const { email, coin, reply } = await req.json();

    if (!email || !coin || !reply) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) {
      return jsonResponse({ error: "Missing RESEND_API_KEY" }, 500);
    }

    const safeCoin = escapeHtml(coin);
    const safeReply = escapeHtml(reply);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "HasaN CharT World <alerts@hasanchartworld.com>",
        to: email,
        subject: `📩 تم الرد على تحليل ${safeCoin}`,
        html: `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<body style="margin:0;padding:0;background:#020617;font-family:Arial,Tahoma,sans-serif;direction:rtl;text-align:right;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:20px 8px;">
<tr>
<td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#07142f;border:1px solid #1e3a5f;border-radius:22px;overflow:hidden;">
<tr>
<td align="center" style="background:#0ea5e9;padding:28px 18px;">
<div style="font-size:28px;font-weight:900;color:white;">HasaN CharT World</div>
<div style="margin-top:10px;font-size:14px;color:#e0f2fe;">تم الرد على طلب التحليل الخاص بك</div>
</td>
</tr>
<tr>
<td style="padding:22px 16px;">
<div style="background:#111c33;border:1px solid #263a5c;border-radius:18px;padding:22px;text-align:center;margin-bottom:18px;">
<div style="font-size:14px;color:#94a3b8;margin-bottom:10px;">العملة المطلوبة</div>
<div style="font-size:32px;font-weight:900;color:#67e8f9;">${safeCoin}</div>
</div>
<div style="background:#020617;border:1px solid #164e63;border-radius:18px;padding:18px;color:#e2e8f0;font-size:16px;line-height:2;">
${safeReply}
</div>
<div style="text-align:center;margin-top:24px;">
<a href="https://www.hasanchartworld.com/my-analysis" style="display:inline-block;background:#0ea5e9;color:white;text-decoration:none;padding:14px 24px;border-radius:16px;font-weight:900;">
مشاهدة التحليل
</a>
</div>
</td>
</tr>
<tr>
<td align="center" style="padding:18px;background:#020617;border-top:1px solid #1e293b;color:#64748b;font-size:12px;">
© 2026 HasaN CharT World
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
        `,
      }),
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error) {
    return jsonResponse({ error: String(error?.message || error) }, 500);
  }
});