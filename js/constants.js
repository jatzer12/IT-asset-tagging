export const STORAGE_KEY = "it_asset_registry_v1";

export const PRIMARY_STATUS = {
  INVENTORY: "INVENTORY",
  IN_USE: "IN_USE",
  SURPLUSED: "SURPLUSED"
};

export const DISPOSITION = {
  NA: "N/A",
  RECYCLED: "RECYCLED",
  DEFERRED: "DEFERRED"
};

export const VALID_PRIMARY_STATUS = Object.values(PRIMARY_STATUS);
export const VALID_SURPLUS_DISPOSITION = [DISPOSITION.RECYCLED, DISPOSITION.DEFERRED];

export function formatAssetTag(number) {
  return `IT-FA-${String(number).padStart(4, "0")}`;
}
