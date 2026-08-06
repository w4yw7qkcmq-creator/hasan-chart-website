import { adaAssetConfig } from "./ada";
import { bnbAssetConfig } from "./bnb";
import { btcAssetConfig } from "./btc";
import { daxAssetConfig } from "./dax";
import { dogeAssetConfig } from "./doge";
import { dowjonesAssetConfig } from "./dowjones";
import { dxyAssetConfig } from "./dxy";
import { ethAssetConfig } from "./eth";
import { eurusdAssetConfig } from "./eurusd";
import { gbpusdAssetConfig } from "./gbpusd";
import { goldAssetConfig } from "./gold";
import { nasdaqAssetConfig } from "./nasdaq";
import { oilAssetConfig } from "./oil";
import { silverAssetConfig } from "./silver";
import { solAssetConfig } from "./sol";
import { sp500AssetConfig } from "./sp500";
import { aaveAssetConfig } from "./aave";
import { atomAssetConfig } from "./atom";
import { filAssetConfig } from "./fil";
import { pepeAssetConfig } from "./pepe";
import { shibAssetConfig } from "./shib";
import { uniAssetConfig } from "./uni";
import { avaxAssetConfig } from "./avax";
import { dotAssetConfig } from "./dot";
import { linkAssetConfig } from "./link";
import { ltcAssetConfig } from "./ltc";
import { maticAssetConfig } from "./matic";
import { trxAssetConfig } from "./trx";
import { eurgbpAssetConfig } from "./eurgbp";
import { eurjpyAssetConfig } from "./eurjpy";
import { gbpjpyAssetConfig } from "./gbpjpy";
import { cac40AssetConfig } from "./cac40";
import { ftseAssetConfig } from "./ftse";
import { nikkeiAssetConfig } from "./nikkei";
import { arbAssetConfig } from "./arb";
import { bchAssetConfig } from "./bch";
import { injAssetConfig } from "./inj";
import { nearAssetConfig } from "./near";
import { opAssetConfig } from "./op";
import { audusdAssetConfig } from "./audusd";
import { nzdusdAssetConfig } from "./nzdusd";
import { usdcadAssetConfig } from "./usdcad";
import { usdchfAssetConfig } from "./usdchf";
import { usdjpyAssetConfig } from "./usdjpy";
import { xauusdAssetConfig } from "./xauusd";
import { xrpAssetConfig } from "./xrp";

/** @type {Record<string, import("./types").AssetHubConfig>} */
export const ASSET_CONFIGS = {
  btc: btcAssetConfig,
  eth: ethAssetConfig,
  sol: solAssetConfig,
  xrp: xrpAssetConfig,
  bnb: bnbAssetConfig,
  doge: dogeAssetConfig,
  ada: adaAssetConfig,
  avax: avaxAssetConfig,
  link: linkAssetConfig,
  matic: maticAssetConfig,
  dot: dotAssetConfig,
  ltc: ltcAssetConfig,
  trx: trxAssetConfig,
  uni: uniAssetConfig,
  aave: aaveAssetConfig,
  shib: shibAssetConfig,
  pepe: pepeAssetConfig,
  atom: atomAssetConfig,
  fil: filAssetConfig,
  bch: bchAssetConfig,
  near: nearAssetConfig,
  op: opAssetConfig,
  arb: arbAssetConfig,
  inj: injAssetConfig,
  gold: goldAssetConfig,
  silver: silverAssetConfig,
  oil: oilAssetConfig,
  eurusd: eurusdAssetConfig,
  gbpusd: gbpusdAssetConfig,
  usdjpy: usdjpyAssetConfig,
  usdchf: usdchfAssetConfig,
  audusd: audusdAssetConfig,
  nzdusd: nzdusdAssetConfig,
  usdcad: usdcadAssetConfig,
  eurjpy: eurjpyAssetConfig,
  gbpjpy: gbpjpyAssetConfig,
  eurgbp: eurgbpAssetConfig,
  dxy: dxyAssetConfig,
  xauusd: xauusdAssetConfig,
  nasdaq: nasdaqAssetConfig,
  sp500: sp500AssetConfig,
  dowjones: dowjonesAssetConfig,
  dax: daxAssetConfig,
  nikkei: nikkeiAssetConfig,
  ftse: ftseAssetConfig,
  cac40: cac40AssetConfig,
};

/**
 * @param {string} id
 * @returns {import("./types").AssetHubConfig | null}
 */
export function getAssetConfig(id) {
  return ASSET_CONFIGS[id] || null;
}

export {
  adaAssetConfig,
  bnbAssetConfig,
  btcAssetConfig,
  daxAssetConfig,
  nikkeiAssetConfig,
  ftseAssetConfig,
  cac40AssetConfig,
  dogeAssetConfig,
  dowjonesAssetConfig,
  dxyAssetConfig,
  ethAssetConfig,
  eurusdAssetConfig,
  gbpusdAssetConfig,
  goldAssetConfig,
  nasdaqAssetConfig,
  oilAssetConfig,
  silverAssetConfig,
  solAssetConfig,
  sp500AssetConfig,
  avaxAssetConfig,
  dotAssetConfig,
  linkAssetConfig,
  ltcAssetConfig,
  maticAssetConfig,
  trxAssetConfig,
  uniAssetConfig,
  aaveAssetConfig,
  shibAssetConfig,
  pepeAssetConfig,
  atomAssetConfig,
  filAssetConfig,
  bchAssetConfig,
  nearAssetConfig,
  opAssetConfig,
  arbAssetConfig,
  injAssetConfig,
  eurgbpAssetConfig,
  eurjpyAssetConfig,
  gbpjpyAssetConfig,
  audusdAssetConfig,
  nzdusdAssetConfig,
  usdcadAssetConfig,
  usdchfAssetConfig,
  usdjpyAssetConfig,
  xauusdAssetConfig,
  xrpAssetConfig,
};
