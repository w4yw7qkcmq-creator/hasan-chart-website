import { verifyAdminOrCronSecret } from "../../../lib/admin-auth";

export async function POST(req: Request) {
  try {
    const authCheck = await verifyAdminOrCronSecret(req);

    if (!authCheck.ok) {
      return Response.json(
        {
          success: false,
          error: authCheck.error,
        },
        { status: authCheck.status }
      );
    }

    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = process.env.TELEGRAM_CHANNEL_ID?.trim();

    if (!token || !chatId) {
      return Response.json({
        success: false,
        error: "Missing Telegram env",
        hasToken: !!token,
        hasChatId: !!chatId,
      });
    }

    const body = await req.json();

    const message = `
🚨 <b>خبر اقتصادي عاجل</b>

📌 <b>${body.title}</b>

📊 الفعلي: ${body.actual}
📈 المتوقع: ${body.forecast}
📉 السابق: ${body.previous}

🧠 ${body.analysis}
`;

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );

    const data = await response.json();

    return Response.json({
      success: data.ok === true,
      telegram: data,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: String(error),
    });
  }
}
