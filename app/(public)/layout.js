import { PublicClientProviders } from "../components/PublicClientProviders";
import RootLayoutShell from "../components/RootLayoutShell";
export default function PublicLayout({ children }) {
  return (
    <PublicClientProviders>
      
      <RootLayoutShell>{children}</RootLayoutShell>
    </PublicClientProviders>
  );
}
