import { buildPrivateMetadata } from "../../../lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildPrivateMetadata({
  title: "تعيين كلمة مرور جديدة",
});

export default function ResetPasswordLayout({ children }) {
  return children;
}
