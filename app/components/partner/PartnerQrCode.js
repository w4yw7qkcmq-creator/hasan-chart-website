"use client";

import { useEffect, useState } from "react";

export function PartnerQrCode({ value, size = 220 }) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    if (!value) {
      setDataUrl("");
      return undefined;
    }

    let active = true;

    void (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(value, {
          width: size,
          margin: 2,
          color: {
            dark: "#020617",
            light: "#ffffff",
          },
        });

        if (active) {
          setDataUrl(url);
        }
      } catch {
        if (active) {
          setDataUrl("");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return null;
  }

  return (
    <img
      src={dataUrl}
      alt="QR Code لرابط الإحالة"
      width={size}
      height={size}
      className="rounded-xl"
    />
  );
}
