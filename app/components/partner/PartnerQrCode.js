"use client";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { getUiToken } from "../../lib/chart-theme";
export function PartnerQrCode({ value, size = 220 }) {
  const [colors, setColors] = useState({ bg: "", fg: "" });
  useEffect(() => {
    setColors({
      bg: getUiToken("--ui-glass-solid"),
      fg: getUiToken("--ui-page-dark-bg"),
    });
  }, []);
  if (!value) {
    return null;
  }
  return (
    <div
      className="rounded-xl ui-glass-solid p-3"
      style={{ width: size, height: size }}
    >
      {" "}
      {colors.bg && colors.fg ? (
        <QRCode
          value={value}
          size={size - 24}
          bgColor={colors.bg}
          fgColor={colors.fg}
          level="M"
        />
      ) : null}{" "}
    </div>
  );
}
