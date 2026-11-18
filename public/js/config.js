const defaultApiUrl = "https://cv-gadgets-backend.vercel.app/api";
const configuredApiUrl = (window.CV_GADGETS_API_URL || defaultApiUrl)
  .replace(/\/+$/, "");

export const API_BASE_URL = configuredApiUrl.endsWith("/api")
  ? configuredApiUrl
  : `${configuredApiUrl}/api`;

let whatsappNumber = "";

export function setShopWhatsappNumber(value) {
  if (typeof value === "string" && /^\d{7,20}$/.test(value)) {
    whatsappNumber = value;
  }
}

export function getWhatsappNumber() { return whatsappNumber; }
export function getShopWhatsappNumber() { return whatsappNumber; }
