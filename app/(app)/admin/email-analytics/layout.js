import { OperationsTabs } from "./components/OperationsTabs";

export default function EmailOperationsLayout({ children }) {
  return (
    <div className="space-y-6">
      <OperationsTabs />
      {children}
    </div>
  );
}
