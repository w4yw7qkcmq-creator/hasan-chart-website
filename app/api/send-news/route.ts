export async function POST(req: Request) {
  try {
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
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHANNEL_ID,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );

    const data = await response.json();

    return Response.json({
      success: true,
      telegram: data,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error,
    });
  }
}