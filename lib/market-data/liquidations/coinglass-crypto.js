import crypto from "crypto";
import zlib from "zlib";

const AES_KEY_LENGTH = 16;

function deriveKey0({ v, urlPath, cacheTsV2, timeHeader }) {
  let constant = "";
  const version = String(v ?? "1");

  if (version === "0") {
    constant = String(cacheTsV2 ?? "");
  } else if (version === "1") {
    constant = urlPath;
  } else if (version === "2") {
    constant = String(timeHeader ?? "");
  } else if (version === "55") {
    constant = "170b070da9654622";
  } else if (version === "66") {
    constant = "d6537d845a964081";
  } else if (version === "77") {
    constant = "863f08689c97435b";
  } else {
    throw new Error(`COINGLASS_UNSUPPORTED_V_${version}`);
  }

  const b64 = Buffer.from(constant, "utf8").toString("base64");
  return b64.slice(0, AES_KEY_LENGTH);
}

function aesEcbDecrypt(ciphertext, keyText) {
  const keyBuf = Buffer.from(String(keyText).slice(0, AES_KEY_LENGTH), "utf8");
  const decipher = crypto.createDecipheriv("aes-128-ecb", keyBuf, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function maybeGunzip(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return zlib.gunzipSync(buffer);
  }
  return buffer;
}

export function decryptCoinglassPayload({
  encryptedBodyB64,
  userTokenB64,
  v,
  urlPath,
  cacheTsV2,
  timeHeader,
}) {
  if (!encryptedBodyB64 || !userTokenB64) {
    throw new Error("COINGLASS_DECRYPT_MISSING_FIELDS");
  }

  const key0 = deriveKey0({ v, urlPath, cacheTsV2, timeHeader });
  const token = Buffer.from(userTokenB64, "base64");
  const actualKey = maybeGunzip(aesEcbDecrypt(token, key0)).toString("utf8");
  const payload = Buffer.from(encryptedBodyB64, "base64");
  const plain = maybeGunzip(aesEcbDecrypt(payload, actualKey)).toString("utf8");
  return JSON.parse(plain);
}

export function buildCoinglassRequestHeaders({ cacheTsV2 = Date.now() } = {}) {
  return {
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://www.coinglass.com/liquidations",
    Origin: "https://www.coinglass.com",
    encryption: "true",
    language: "en",
    "cache-ts-v2": String(cacheTsV2),
  };
}
