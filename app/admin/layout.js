"use client";

import { AdminAccessGate } from "../components/AdminAccessGate";

export default function AdminLayout({ children }) {
  return <AdminAccessGate>{children}</AdminAccessGate>;
}
