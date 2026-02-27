import {
  DISPOSITION,
  PRIMARY_STATUS,
  VALID_PRIMARY_STATUS,
  VALID_SURPLUS_DISPOSITION
} from "./constants.js";

export function validateAsset(record) {
  if (!record.assetName || !record.assetTag || !record.deviceType || !record.primaryStatus) {
    return "Asset Name, Asset Tag, Device Type, and Primary Status are required.";
  }

  if (!String(record.assetName).trim()) {
    return "Asset Name is required.";
  }

  if (!String(record.assetTag).trim()) {
    return "Asset Tag is required.";
  }

  if (!VALID_PRIMARY_STATUS.includes(record.primaryStatus)) {
    return `Primary status must be one of ${VALID_PRIMARY_STATUS.join(", ")}.`;
  }

  if (record.primaryStatus === PRIMARY_STATUS.SURPLUSED && !VALID_SURPLUS_DISPOSITION.includes(record.disposition)) {
    return "Surplused assets must be Recycled or Deferred.";
  }

  if (record.primaryStatus !== PRIMARY_STATUS.SURPLUSED && record.disposition !== DISPOSITION.NA) {
    return "Only Surplused assets can have Recycled/Deferred disposition.";
  }

  return null;
}
