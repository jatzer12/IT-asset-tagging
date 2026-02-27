import { DISPOSITION, PRIMARY_STATUS, VALID_PRIMARY_STATUS } from "./constants.js";
import { normalizeAssetRecord, normalizeDisposition, normalizeHeader, normalizePrimaryStatus } from "./normalizers.js";

const TEMPLATE_HEADERS = [
  "Asset Name",
  "Asset Tag",
  "Serial Number",
  "Device Type",
  "Model",
  "Assigned User",
  "Location",
  "Room Number",
  "Department",
  "Purchase Date",
  "Lifecycle Year",
  "Asset Value",
  "Primary Status",
  "Disposition Status",
  "Reason/Notes"
];

const TEMPLATE_HEADERS_NORMALIZED = TEMPLATE_HEADERS.map((header) => normalizeHeader(header));

function detectDelimiter(text) {
  const firstNonEmptyLine = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) || "";

  const counts = {
    ",": (firstNonEmptyLine.match(/,/g) || []).length,
    ";": (firstNonEmptyLine.match(/;/g) || []).length,
    "\t": (firstNonEmptyLine.match(/\t/g) || []).length,
    "|": (firstNonEmptyLine.match(/\|/g) || []).length
  };

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ",";
}

function parseCsv(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function hasStrictTemplateHeader(headerRow) {
  const normalized = headerRow.map((header) => normalizeHeader(header));
  return normalized.length === TEMPLATE_HEADERS_NORMALIZED.length
    && TEMPLATE_HEADERS_NORMALIZED.every((header, index) => normalized[index] === header);
}

function templateHeaderLine() {
  return TEMPLATE_HEADERS.join(",");
}

export function parseAssetCsv(text, validateAsset) {
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter).filter((row) => row.some((cell) => String(cell).trim() !== ""));

  if (rows.length < 2) {
    return { fatalError: "CSV is empty or missing data rows.", records: [], errors: [] };
  }

  const headerRow = rows[0].map((cell) => String(cell || "").trim());
  if (!hasStrictTemplateHeader(headerRow)) {
    return {
      fatalError: `CSV must match the official template exactly. Required header row:\n${templateHeaderLine()}`,
      records: [],
      errors: []
    };
  }

  const records = [];
  const errors = [];

  for (let i = 1; i < rows.length; i += 1) {
    const line = rows[i];
    const assignedToValue = String(line[5] || "").trim();
    const notesValue = String(line[14] || "").trim();
    const rawStatus = normalizePrimaryStatus(line[12]);
    const rawDisposition = normalizeDisposition(line[13]);

    let primaryStatusValue = rawStatus;
    if (!VALID_PRIMARY_STATUS.includes(primaryStatusValue)) {
      primaryStatusValue = assignedToValue ? PRIMARY_STATUS.IN_USE : PRIMARY_STATUS.INVENTORY;
    }

    let dispositionValue = rawDisposition;
    if (primaryStatusValue === PRIMARY_STATUS.SURPLUSED) {
      if (![DISPOSITION.RECYCLED, DISPOSITION.DEFERRED].includes(dispositionValue)) {
        dispositionValue = notesValue.toLowerCase().includes("defer") ? DISPOSITION.DEFERRED : DISPOSITION.RECYCLED;
      }
    } else {
      dispositionValue = DISPOSITION.NA;
    }

    const record = normalizeAssetRecord({
      assetName: line[0],
      serialNumber: line[2],
      assetTag: line[1],
      deviceType: line[3],
      model: line[4],
      assignedTo: assignedToValue,
      location: line[6],
      roomNumber: line[7],
      department: line[8],
      purchaseDate: line[9],
      lifecycleYear: line[10],
      assetValue: line[11],
      primaryStatus: primaryStatusValue,
      disposition: dispositionValue,
      notes: notesValue
    });

    const error = validateAsset(record);
    if (error) {
      errors.push(`Row ${i + 1}: ${error}`);
      continue;
    }

    records.push(record);
  }

  return { fatalError: null, records, errors };
}
