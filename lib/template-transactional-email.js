import { buildEmailLayout, sendEmail } from "./email.js";
import { dispatchTransactionalEmail } from "./email-dispatch.js";

export async function dispatchTemplateTransactionalEmail(
  {
    idempotencyKey,
    recipientEmail,
    messageType,
    recordId,
    subject,
    title,
    content,
    actionText,
    actionUrl,
    preheader,
    metadata = {},
    attachments,
  },
  deps = {}
) {
  const html = buildEmailLayout({
    title,
    content,
    actionText,
    actionUrl,
    preheader,
  });

  const directAttachments = Array.isArray(attachments) ? attachments : undefined;

  return dispatchTransactionalEmail(
    {
      idempotencyKey,
      recipientEmail,
      subject,
      html,
      messageType,
      recordId,
      metadata,
    },
    {
      sendDirectEmail:
        deps.sendDirectEmail ||
        ((payload) =>
          sendEmail({
            ...payload,
            attachments: directAttachments,
          })),
      enqueueEmail: deps.enqueueEmail,
    }
  );
}
