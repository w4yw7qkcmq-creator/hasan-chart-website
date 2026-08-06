"use client";
import AppModal from "./AppModal";
export default function SuccessModal({
  open,
  type = "success",
  title = "تمت العملية بنجاح",
  message = "تم تنفيذ الطلب بنجاح",
  buttonText = "حسناً",
  onClose,
}) {
  return (
    <AppModal
      open={open}
      type={type}
      title={title}
      message={message}
      buttonText={buttonText}
      onClose={onClose}
    />
  );
}
