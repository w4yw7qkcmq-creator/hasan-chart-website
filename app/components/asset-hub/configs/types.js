/**
 * @typedef {Object} AssetFaqItem
 * @property {string} q
 * @property {string} a
 */

/**
 * @typedef {Object} AssetLinkItem
 * @property {string} label
 * @property {string} href
 */

/**
 * @typedef {Object} AssetRelatedItem
 * @property {string} symbol
 * @property {string} name
 * @property {string} description
 * @property {string} href
 */

/**
 * @typedef {Object} AssetServiceItem
 * @property {string} icon
 * @property {string} title
 * @property {string} description
 * @property {string} href
 * @property {string} cta
 */

/**
 * @typedef {Object} AssetHubConfig
 * @property {string} id
 * @property {string} slug
 * @property {string} path
 * @property {string} name
 * @property {string} nameEn
 * @property {string} symbol
 * @property {string} tradingViewSymbol
 * @property {string} chartSymbol
 * @property {string} chartExchange
 * @property {string} pricePairLabel
 * @property {"crypto"|"commodity"|"metal"|"energy"|"forex"|"global"|"indices"} category
 * @property {string} categoryLabel
 * @property {string} categoryPath
 * @property {{ badge: string, title: string, description: string, accentRgb: string }} hero
 * @property {{ marketSummary: string, tradingHours: string, platform: string }} description
 * @property {{ keywords: string[], tagHref: string, archiveLabel: string }} news
 * @property {{ keywords: string[], patterns?: RegExp[] }} analysis
 * @property {AssetFaqItem[]} faq
 * @property {AssetRelatedItem[]} relatedAssets
 * @property {{ internal: AssetLinkItem[], jsonLd: AssetLinkItem[], marketSummary: AssetLinkItem[] }} links
 * @property {AssetServiceItem[]} services
 * @property {{ title: string, description: string, keywords: string[] }} metadata
 * @property {{ productName: string, alternateNames: string[], productCategory: string, itemListName: string, fragmentId: string }} jsonLd
 * @property {AssetLinkItem[]} breadcrumbs
 */

export {};
