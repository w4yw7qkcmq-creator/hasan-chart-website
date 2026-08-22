import { EmailOpsShell } from "./components/email-ops/EmailOpsShell";
import { EmailOpsTabs } from "./components/email-ops/EmailOpsTabs";

export default function EmailOperationsLayout({ children }) {
  return (
    <EmailOpsShell>
      <EmailOpsTabs />
      {children}
    </EmailOpsShell>
  );
}
