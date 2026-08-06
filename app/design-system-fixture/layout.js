import { notFound } from "next/navigation";

export default function DesignSystemFixtureLayout({ children }) {
  const allowFixture =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_DESIGN_SYSTEM_FIXTURE === "1";
  if (!allowFixture) {
    notFound();
  }
  return (
    <div dir="rtl" lang="ar" data-design-system-fixture="1">
      {children}
    </div>
  );
}
