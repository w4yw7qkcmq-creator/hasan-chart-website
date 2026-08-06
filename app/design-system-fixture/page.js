"use client";

import { useState } from "react";
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiInput,
  UiLoadingState,
  UiModal,
  UiPageHeader,
  UiPageShell,
  UiSelect,
} from "../components/ui";

export default function DesignSystemFixturePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectValue, setSelectValue] = useState("a");
  const [inputValue, setInputValue] = useState("نص عربي طويل 12345");

  return (
    <UiPageShell className="ui-page-shell p-4 md:p-6" data-testid="ds-page-shell">
      <UiPageHeader
        title="Design System Fixture"
        subtitle="Runtime verification only — not for production traffic"
        actions={
          <UiButton
            variant="ghost"
            data-testid="ds-theme-toggle"
            onClick={() => {
              const root = document.documentElement;
              const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
              root.setAttribute("data-theme", next);
            }}
          >
            Toggle theme
          </UiButton>
        }
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-2" data-testid="ds-page-header">
        <UiCard data-testid="ds-card-root">
          <h2 className="mb-4 text-lg font-black ui-text-strong">Actions & Forms</h2>
          <div className="flex flex-wrap gap-2">
            <UiButton data-testid="ds-button-primary">Primary CTA</UiButton>
            <UiButton variant="secondary" data-testid="ds-button-secondary">
              Secondary
            </UiButton>
            <UiButton variant="ghost" data-testid="ds-button-ghost">
              Ghost
            </UiButton>
            <UiButton variant="danger" data-testid="ds-button-danger">
              Danger
            </UiButton>
            <UiButton disabled data-testid="ds-button-disabled">
              Disabled
            </UiButton>
          </div>

          <div className="mt-4 space-y-3">
            <UiInput
              data-testid="ds-input-text"
              aria-label="حقل نص تجريبي"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="اكتب هنا"
            />
            <UiInput
              data-testid="ds-input-disabled"
              aria-label="حقل معطل"
              disabled
              placeholder="disabled"
            />
            <UiSelect
              data-testid="ds-select-native"
              aria-label="قائمة تجريبية"
              value={selectValue}
              onChange={(event) => setSelectValue(event.target.value)}
            >
              <option value="a">Alpha — ألفا</option>
              <option value="b">Beta — بيتا</option>
              <option value="c">12345 LTR</option>
            </UiSelect>
          </div>

          <UiButton
            className="mt-4"
            data-testid="ds-modal-opener"
            onClick={() => setModalOpen(true)}
          >
            Open modal
          </UiButton>
        </UiCard>

        <UiCard>
          <h2 className="mb-4 text-lg font-black ui-text-strong">Feedback</h2>
          <div className="flex flex-wrap gap-2">
            <UiBadge data-testid="ds-badge-neutral">Neutral</UiBadge>
            <UiBadge variant="positive" data-testid="ds-badge-positive">
              Positive
            </UiBadge>
            <UiBadge variant="negative" data-testid="ds-badge-negative">
              Negative
            </UiBadge>
            <UiBadge variant="warning" data-testid="ds-badge-warning">
              Warning
            </UiBadge>
          </div>
          <div className="mt-4 space-y-3">
            <UiAlert variant="info" data-testid="ds-alert-info">
              Info alert — تنبيه معلومات
            </UiAlert>
            <UiAlert variant="success" data-testid="ds-alert-success">
              Success alert
            </UiAlert>
            <UiAlert variant="warning" data-testid="ds-alert-warning">
              Warning alert
            </UiAlert>
            <UiAlert variant="error" data-testid="ds-alert-error">
              Error alert
            </UiAlert>
            <UiLoadingState data-testid="ds-loading-state" label="جاري التحميل..." />
            <UiEmptyState
              data-testid="ds-empty-state"
              title="لا توجد بيانات"
              description="حالة فارغة للاختبار"
            />
            <UiErrorState
              data-testid="ds-error-state"
              title="حدث خطأ"
              description="حالة خطأ للاختبار"
            />
          </div>
        </UiCard>
      </div>

      <UiModal
        open={modalOpen}
        type="info"
        title="Fixture modal"
        message="نافذة تجريبية للاختبار — اضغط Escape للإغلاق"
        buttonText="إغلاق"
        onClose={() => setModalOpen(false)}
      />
    </UiPageShell>
  );
}
