import { ClientProviders } from "../components/ClientProviders";
import RootLayoutShell from "../components/RootLayoutShell";

export default function AppLayout({ children }) {
  return (
    <ClientProviders>
      <RootLayoutShell>{children}</RootLayoutShell>
    </ClientProviders>
  );
}
