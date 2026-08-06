"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
const AppModal = dynamic(() => import("./AppModal"), { ssr: false });
const AppModalContext = createContext(null);
const DEFAULT_TITLES = {
  success: "تمت العملية بنجاح",
  error: "حدث خطأ",
  warning: "تنبيه",
  info: "معلومة",
};
export function AppModalProvider({ children }) {
  const [modal, setModal] = useState({
    open: false,
    type: "info",
    title: "",
    message: "",
    buttonText: "حسناً",
    mode: "alert",
    confirmText: "تأكيد",
    cancelText: "إلغاء",
    autoCloseMs: null,
    resolve: null,
  });
  const closeModal = useCallback(() => {
    setModal((current) => {
      if (typeof current.resolve === "function") {
        current.resolve(false);
      }
      return { ...current, open: false, resolve: null };
    });
  }, []);
  const pathname = usePathname();
  useEffect(() => {
    closeModal();
  }, [pathname, closeModal]);
  const showAppModal = useCallback(
    ({
      type = "info",
      title,
      message,
      buttonText = "حسناً",
      autoCloseMs = null,
    } = {}) => {
      setModal({
        open: true,
        type,
        title: title || DEFAULT_TITLES[type] || DEFAULT_TITLES.info,
        message: message || "",
        buttonText,
        autoCloseMs,
        mode: "alert",
        confirmText: "تأكيد",
        cancelText: "إلغاء",
        resolve: null,
      });
    },
    [],
  );
  const showAppConfirm = useCallback(
    ({
      type = "warning",
      title = "تأكيد العملية",
      message = "",
      confirmText = "تأكيد",
      cancelText = "إلغاء",
    } = {}) =>
      new Promise((resolve) => {
        setModal({
          open: true,
          type,
          title,
          message,
          buttonText: "حسناً",
          autoCloseMs: null,
          mode: "confirm",
          confirmText,
          cancelText,
          resolve,
        });
      }),
    [],
  );
  const handleClose = useCallback(() => {
    closeModal();
  }, [closeModal]);
  const handleConfirm = useCallback(() => {
    setModal((current) => {
      if (typeof current.resolve === "function") {
        current.resolve(true);
      }
      return { ...current, open: false, resolve: null };
    });
  }, []);
  const handleCancel = useCallback(() => {
    setModal((current) => {
      if (typeof current.resolve === "function") {
        current.resolve(false);
      }
      return { ...current, open: false, resolve: null };
    });
  }, []);
  const value = useMemo(
    () => ({ showAppModal, showAppConfirm, closeModal }),
    [showAppModal, showAppConfirm, closeModal],
  );
  return (
    <AppModalContext.Provider value={value}>
      {" "}
      {children}{" "}
      {modal.open ? (
        <AppModal
          open
          type={modal.type}
          title={modal.title}
          message={modal.message}
          buttonText={modal.buttonText}
          confirmText={modal.confirmText}
          cancelText={modal.cancelText}
          autoCloseMs={modal.autoCloseMs}
          mode={modal.mode}
          onClose={handleClose}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      ) : null}{" "}
    </AppModalContext.Provider>
  );
}
export function useAppModal() {
  const context = useContext(AppModalContext);
  if (!context) {
    throw new Error("useAppModal must be used within AppModalProvider");
  }
  return context;
}
