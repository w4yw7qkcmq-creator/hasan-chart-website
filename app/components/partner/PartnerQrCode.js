"use client";

import QRCode from "react-qr-code";

export function PartnerQrCode({ value, size = 220 }) {
  if (!value) {
    return null;
  }

  return (
    <div
      className="rounded-xl bg-white p-3"
      style={{ width: size, height: size }}
    >
      <QRCode
        value={value}
        size={size - 24}
        bgColor="#ffffff"
        fgColor="#020617"
        level="M"
      />
    </div>
  );
}
