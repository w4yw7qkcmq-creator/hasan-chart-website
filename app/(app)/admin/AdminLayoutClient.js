"use client";
import { AdminAccessGate } from "../../components/AdminAccessGate";
export default function AdminLayoutClient({ children }) {
  return <AdminAccessGate>{children}</AdminAccessGate>;
}
