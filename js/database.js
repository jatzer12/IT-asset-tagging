import { DISPOSITION, formatAssetTag, PRIMARY_STATUS, STORAGE_KEY } from "./constants.js";
import { normalizeAssetRecord } from "./normalizers.js";

function defaultRecord(record = {}) {
  return {
    assetName: record.assetName || "",
    assetTag: record.assetTag || "",
    serialNumber: record.serialNumber || "",
    deviceType: record.deviceType || "",
    model: record.model || "",
    assignedTo: record.assignedTo || "",
    location: record.location || "",
    roomNumber: record.roomNumber || "",
    department: record.department || "",
    purchaseDate: record.purchaseDate || "",
    lifecycleYear: record.lifecycleYear || record.lifecycleDate || "",
    assetValue: record.assetValue || "",
    primaryStatus: record.primaryStatus || PRIMARY_STATUS.INVENTORY,
    disposition: record.disposition || DISPOSITION.NA,
    notes: record.notes || "",
    commentHistory: Array.isArray(record.commentHistory) ? record.commentHistory : []
  };
}

export class AssetDatabase {
  constructor(storage = window.localStorage, key = STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  getAll() {
    const parsed = this.#readRaw();
    return parsed.map((item) => normalizeAssetRecord(defaultRecord(item)));
  }

  saveAll(records) {
    this.storage.setItem(this.key, JSON.stringify(records));
  }

  upsert(records, nextRecord) {
    const next = [...records];
    const existingIndex = next.findIndex((item) => item.assetTag === nextRecord.assetTag);

    if (existingIndex >= 0) {
      next[existingIndex] = nextRecord;
    } else {
      next.unshift(nextRecord);
    }

    this.saveAll(next);
    return next;
  }

  deleteByTag(records, tag) {
    const next = records.filter((item) => item.assetTag !== tag);
    this.saveAll(next);
    return next;
  }

  clear() {
    this.saveAll([]);
    return [];
  }

  getNextAssetNumber(records) {
    const numbers = records
      .map((item) => {
        const match = String(item.assetTag || "").match(/^IT-FA-(\d+)$/);
        return match ? Number(match[1]) : 0;
      })
      .filter((value) => Number.isFinite(value) && value > 0);

    return numbers.length ? Math.max(...numbers) + 1 : 1;
  }

  getNextAssetTag(records) {
    return formatAssetTag(this.getNextAssetNumber(records));
  }

  #readRaw() {
    try {
      const parsed = JSON.parse(this.storage.getItem(this.key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
