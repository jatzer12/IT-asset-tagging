import {
  DISPOSITION,
  PRIMARY_STATUS,
  VALID_PRIMARY_STATUS
} from "./constants.js";

export function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function findHeaderIndex(header, matchers) {
  return header.findIndex((item) => matchers.some((matcher) => item === matcher || item.includes(matcher)));
}

export function normalizePrimaryStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (["IN-USE", "IN USE", PRIMARY_STATUS.IN_USE].includes(normalized)) return PRIMARY_STATUS.IN_USE;
  if (normalized === PRIMARY_STATUS.INVENTORY) return PRIMARY_STATUS.INVENTORY;
  if (normalized === PRIMARY_STATUS.SURPLUSED) return PRIMARY_STATUS.SURPLUSED;
  return normalized;
}

export function normalizeDisposition(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized || normalized === "NA" || normalized === DISPOSITION.NA) return DISPOSITION.NA;
  if (normalized === DISPOSITION.RECYCLED) return DISPOSITION.RECYCLED;
  if (normalized === DISPOSITION.DEFERRED) return DISPOSITION.DEFERRED;
  return normalized;
}

export function normalizeAssetTag(value) {
  return String(value || "").trim();
}

function normalizeCommentHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((item) => {
      const id = String(item && item.id ? item.id : "").trim();
      let text = String(item && item.text ? item.text : "").trim();
      const timestamp = String(item && item.timestamp ? item.timestamp : "").trim();
      let username = String(item && item.username ? item.username : "").trim();
      const legacyMatch = text.match(/\(posted by\s+([^)]+)\)\s*$/i);
      if (!username && legacyMatch) {
        username = String(legacyMatch[1] || "").trim();
        text = text.replace(/\(posted by\s+([^)]+)\)\s*$/i, "").trim();
      }
      if (!text || !timestamp) return null;
      return {
        id: id || `${timestamp}|${text}`.replace(/\s+/g, "_").slice(0, 120),
        text,
        timestamp,
        username: username || "system"
      };
    })
    .filter(Boolean);
}

export function normalizeAssetRecord(record) {
  const primaryStatus = normalizePrimaryStatus(record.primaryStatus);
  const disposition = normalizeDisposition(record.disposition);

  return {
    assetName: String(record.assetName || "").trim(),
    assetTag: normalizeAssetTag(record.assetTag),
    serialNumber: String(record.serialNumber || "").trim(),
    deviceType: String(record.deviceType || "").trim(),
    model: String(record.model || "").trim(),
    assignedTo: String(record.assignedTo || "").trim(),
    location: String(record.location || "").trim(),
    roomNumber: String(record.roomNumber || "").trim(),
    department: String(record.department || "").trim(),
    purchaseDate: String(record.purchaseDate || "").trim(),
    lifecycleYear: String(record.lifecycleYear || record.lifecycleDate || "").trim().replace(/[^0-9]/g, "").slice(0, 4),
    assetValue: String(record.assetValue || "").trim(),
    primaryStatus: VALID_PRIMARY_STATUS.includes(primaryStatus) ? primaryStatus : PRIMARY_STATUS.INVENTORY,
    disposition,
    notes: String(record.notes || "").trim(),
    commentHistory: normalizeCommentHistory(record.commentHistory)
  };
}
