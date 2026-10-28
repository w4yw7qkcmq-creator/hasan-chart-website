const axios = require("axios");
const { sanitizeRssDraftAiText } = require("./rss-draft-sanitize");
const { applyTrumpOfficeholderGuardToMessage } = require("./trump-officeholder-role-guard");
const { applyFedOfficeholderGuardToMessage } = require("./fed-officeholder-role-guard");
const {
  OPENAI_FAILURE_REASONS,
  editorialChatRequestFields,
  classifyOpenAiChatFailure,
  logOpenAiChatFailure,
  isOpenAiFailureReason,
} = require("../openai/editorial-chat");

const RSS_EDITORIAL_ENDPOINT = "https://api.openai.com/v1/chat/completions";

function failedDraft(title, reason) {
  return {
    message: null,
    imageTitle: title,
    aiFailed: true,
    reason,
  };
}

async function generateRssEditorialDraft(title, options = {}) {
  const httpPost = options.httpPost || axios.post.bind(axios);
  const isEconomicReleaseTitle = options.isEconomicReleaseTitle;

  try {
    const response = await httpPost(
      RSS_EDITORIAL_ENDPOINT,
      {
        ...editorialChatRequestFields(),
        messages: [
          {
            role: "system",
            content:
              "أنت محرر أخبار مالية عاجلة لقناة تيليجرام احترافية مختصة بالفوركس والأسواق العالمية. اكتب الخبر باللغة العربية فقط. ممنوع كتابة أي كلمات إنجليزية نهائياً حتى لو كان عنوان المصدر بالإنجليزية، باستثناء الرموز الاقتصادية الضرورية مثل CPI أو PPI أو NFP أو FOMC. ترجم أسماء الأخبار والأسواق والشركات إلى العربية أو احذفها إذا كانت غير مهمة. لا تخلط العربية والإنجليزية في نفس السطر. اكتب بأسلوب أخبار عاجلة ومختصرة. التنسيق الإجباري: السطر الأول عنوان عربي عاجل مع إيموجي مناسب. بعده سطر فارغ. بعده ملخص الخبر بالعربية بجملة أو جملتين فقط. لا تكتب كلمة التأثير إلا إذا كان الخبر نتيجة اقتصادية رسمية مثل CPI أو PPI أو NFP أو Jobless Claims أو FOMC أو قرار فائدة أو بيانات بطالة أو GDP أو PMI. أما أخبار الذهب أو النفط أو الكريبتو أو الأسهم أو إيران أو إسرائيل أو الحروب أو العقوبات أو التصعيدات الجيوسياسية فلا تكتب فيها كلمة التأثير نهائياً. إذا كان الخبر نتيجة اقتصادية رسمية وكان التأثير واضحاً، اكتب سطر التأثير بصيغة مختصرة. إذا كان التأثير غير واضح أو غير مؤكد، لا تكتب كلمة التأثير ولا تضف سطر التأثير نهائيًا. لا تقدم توصية شراء أو بيع. لا تستخدم عبارات فرصة استثمارية أو فرصة شراء أو فرصة بيع أو بناء مراكز أو هدف سعري. لا تذكر المصدر ولا تضع روابط. لا تكتب أي جملة ختامية. Donald Trump is the current U.S. President for current-context news. Do not describe him as former president unless the source is explicitly discussing a historical period in which that description is contextually required. Kevin Warsh is the current Federal Reserve Chair. Jerome Powell is a former Federal Reserve Chair. Preserve historically correct roles when the article discusses an earlier period.",
          },
          {
            role: "user",
            content: `عنوان الخبر: ${title}\nمهم جدًا: لا تكتب رابط المصدر ولا تذكر اسم المصدر داخل المنشور. أعد صياغة الخبر بالكامل بصياغة عربية مختلفة عن المصدر ولا تنسخ نفس ترتيب الجمل. لا تكتب كلمة "التأثير" إلا إذا كان الخبر نتيجة اقتصادية رسمية مثل CPI أو PPI أو NFP أو Jobless Claims أو FOMC أو قرار فائدة أو بيانات بطالة أو GDP أو PMI. أما أخبار الذهب أو النفط أو الكريبتو أو الأسهم أو إيران أو إسرائيل أو الحروب أو العقوبات فلا تكتب فيها كلمة التأثير نهائياً. للأخبار العادية اكتب عنواناً عاجلاً وملخصاً قصيراً فقط. ممنوع عبارات فرصة استثمارية أو فرصة شراء أو فرصة بيع أو بناء مراكز أو توصية أو هدف سعري.`,
          },
        ],
        temperature: 0.4,
        max_tokens: 350,
      },
      {
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: options.timeoutMs,
      }
    );

    const aiText = response.data.choices?.[0]?.message?.content?.trim();
    if (!aiText) {
      throw new Error("Empty AI response");
    }

    const sanitizedDraft = sanitizeRssDraftAiText(aiText, {
      title,
      isEconomicReleaseTitle,
    });
    if (!sanitizedDraft.ok) {
      throw new Error(sanitizedDraft.reason || "AI response contains English or empty Arabic text");
    }

    let cleanedAiText = sanitizedDraft.cleanedText;
    if (!cleanedAiText || /[A-Za-z]{4,}/.test(cleanedAiText)) {
      throw new Error("AI response contains English or empty Arabic text");
    }

    const trumpRoleGuard = applyTrumpOfficeholderGuardToMessage(cleanedAiText, title);
    if (trumpRoleGuard.changed) {
      cleanedAiText = trumpRoleGuard.text;
    }

    const fedRoleGuard = applyFedOfficeholderGuardToMessage(cleanedAiText, title);
    if (fedRoleGuard.changed) {
      cleanedAiText = fedRoleGuard.text;
    }

    const firstLine = cleanedAiText
      .split("\n")
      .find((line) => line.trim().length > 10) || title;

    return {
      message: `${cleanedAiText.replace(/\n/g, "\n\n")}\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi`,
      imageTitle: firstLine
        .replace(/🚨|📌|📈|📉|🔥|⚡|🛢️|💰|🇺🇸|🇮🇷|🔴|🟢|🟡|🎯|📊|📰/g, "")
        .trim(),
    };
  } catch (error) {
    if (error.message === "Empty AI response") {
      logOpenAiChatFailure(OPENAI_FAILURE_REASONS.RESPONSE_INVALID, error);
      return failedDraft(title, OPENAI_FAILURE_REASONS.RESPONSE_INVALID);
    }

    const apiReason = classifyOpenAiChatFailure(error);
    if (apiReason) {
      logOpenAiChatFailure(apiReason, error);
      return failedDraft(title, apiReason);
    }

    return failedDraft(title, "EDITORIAL_OUTPUT_INVALID");
  }
}

module.exports = {
  RSS_EDITORIAL_ENDPOINT,
  generateRssEditorialDraft,
  isOpenAiFailureReason,
};
