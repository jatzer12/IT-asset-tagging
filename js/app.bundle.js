(async function () {

  const PRIMARY_STATUS = {
    INVENTORY: "INVENTORY",
    IN_USE: "IN_USE",
    DEFERRED: "DEFERRED",
    SURPLUSED: "SURPLUSED"
  };

  const VALID_PRIMARY_STATUS = Object.values(PRIMARY_STATUS);
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
    "Status",
    "Reason/Notes"
  ];
  const TEMPLATE_HEADERS_NORMALIZED = TEMPLATE_HEADERS.map(function (header) {
    return normalizeHeader(header);
  });

  function normalizeHeader(value) {
    return String(value || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function findHeaderIndex(header, matchers) {
    return header.findIndex(function (item) {
      return matchers.some(function (matcher) {
        return item === matcher || item.includes(matcher);
      });
    });
  }

  function normalizePrimaryStatus(value) {
    const normalized = String(value || "").trim().toUpperCase();
    if (["IN-USE", "IN USE", PRIMARY_STATUS.IN_USE].includes(normalized)) return PRIMARY_STATUS.IN_USE;
    if (["DEFERRED", "DEFFERED"].includes(normalized)) return PRIMARY_STATUS.DEFERRED;
    if (normalized === "DISPOSED") return PRIMARY_STATUS.SURPLUSED;
    if (normalized === PRIMARY_STATUS.INVENTORY) return PRIMARY_STATUS.INVENTORY;
    if (normalized === PRIMARY_STATUS.SURPLUSED) return PRIMARY_STATUS.SURPLUSED;
    return normalized;
  }

  function primaryStatusLabel(status) {
    if (status === PRIMARY_STATUS.INVENTORY) return "Inventory";
    if (status === PRIMARY_STATUS.IN_USE) return "In-Use";
    if (status === PRIMARY_STATUS.DEFERRED) return "Deferred";
    if (status === PRIMARY_STATUS.SURPLUSED) return "Disposed";
    return status || "-";
  }

  function normalizeCommentHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
      .map(function (item) {
        const id = String(item && item.id ? item.id : "").trim();
        let text = String(item && item.text ? item.text : "").trim();
        const timestamp = String(item && item.timestamp ? item.timestamp : "").trim();
        let username = String(item && item.username ? item.username : "").trim();
        const legacyMatch = text.match(/\(posted by\s+([^)]+)\)\s*$/i);
        if (legacyMatch) {
          if (!username) username = String(legacyMatch[1] || "").trim();
          text = text.replace(/\(posted by\s+([^)]+)\)\s*$/i, "").trim();
        }
        if (!text || !timestamp) return null;
        return {
          id: id || (timestamp + "|" + text).replace(/\s+/g, "_").slice(0, 120),
          text: text,
          timestamp: timestamp,
          username: username || "Unknown User"
        };
      })
      .filter(Boolean);
  }

  function normalizePendingDelete(value) {
    if (!value || typeof value !== "object") return null;
    const requestedBy = String(value.requestedBy || "").trim();
    const requestedAt = String(value.requestedAt || "").trim();
    const requestedById = String(value.requestedById || "").trim();
    if (!requestedBy || !requestedAt) return null;
    return { requestedBy: requestedBy, requestedAt: requestedAt, requestedById: requestedById };
  }

  function normalizeAssetRecord(record) {
    const primaryStatus = normalizePrimaryStatus(record.primaryStatus);
    const legacyDisposition = String(record.disposition || "").trim().toUpperCase();
    let resolvedPrimaryStatus = VALID_PRIMARY_STATUS.includes(primaryStatus) ? primaryStatus : PRIMARY_STATUS.INVENTORY;
    if (resolvedPrimaryStatus !== PRIMARY_STATUS.DEFERRED && ["DEFERRED", "DEFFERED"].includes(legacyDisposition)) {
      resolvedPrimaryStatus = PRIMARY_STATUS.DEFERRED;
    }

    return {
      assetName: String(record.assetName || "").trim(),
      assetTag: String(record.assetTag || "").trim(),
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
      primaryStatus: resolvedPrimaryStatus,
      notes: String(record.notes || "").trim(),
      commentHistory: normalizeCommentHistory(record.commentHistory),
      pendingDelete: normalizePendingDelete(record.pendingDelete)
    };
  }

  function validateAsset(record) {
    if (!record.assetName || !record.assetTag || !record.deviceType || !record.primaryStatus) {
      return "Asset Name, Asset Tag, Device Type, and Status are required.";
    }

    if (!String(record.assetName).trim()) {
      return "Asset Name is required.";
    }

    if (!String(record.assetTag).trim()) {
      return "Asset Tag is required.";
    }

    if (!VALID_PRIMARY_STATUS.includes(record.primaryStatus)) {
      return "Status must be one of " + VALID_PRIMARY_STATUS.join(", ") + ".";
    }

    return null;
  }

  function defaultRecord(record) {
    const next = record || {};
    return {
      assetName: next.assetName || "",
      assetTag: next.assetTag || "",
      serialNumber: next.serialNumber || "",
      deviceType: next.deviceType || "",
      model: next.model || "",
      assignedTo: next.assignedTo || "",
      location: next.location || "",
      roomNumber: next.roomNumber || "",
      department: next.department || "",
      purchaseDate: next.purchaseDate || "",
      lifecycleYear: next.lifecycleYear || next.lifecycleDate || "",
      assetValue: next.assetValue || "",
      primaryStatus: next.primaryStatus || PRIMARY_STATUS.INVENTORY,
      notes: next.notes || "",
      commentHistory: Array.isArray(next.commentHistory) ? next.commentHistory : [],
      pendingDelete: next.pendingDelete || null
    };
  }

  function detectDelimiter(text) {
    const firstNonEmptyLine = String(text || "")
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .find(function (line) { return line.length > 0; }) || "";

    const counts = {
      ",": (firstNonEmptyLine.match(/,/g) || []).length,
      ";": (firstNonEmptyLine.match(/;/g) || []).length,
      "\t": (firstNonEmptyLine.match(/\t/g) || []).length,
      "|": (firstNonEmptyLine.match(/\|/g) || []).length
    };

    const sorted = Object.entries(counts).sort(function (a, b) { return b[1] - a[1]; });
    return sorted[0][1] > 0 ? sorted[0][0] : ",";
  }

  function parseCsv(text, delimiter) {
    const actualDelimiter = delimiter || ",";
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
      } else if (char === actualDelimiter && !inQuotes) {
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
    const normalized = headerRow.map(function (header) {
      return normalizeHeader(header);
    });

    return normalized.length === TEMPLATE_HEADERS_NORMALIZED.length
      && TEMPLATE_HEADERS_NORMALIZED.every(function (header, index) {
        return normalized[index] === header;
      });
  }

  function templateHeaderLine() {
    return TEMPLATE_HEADERS.join(",");
  }

  function parseAssetCsv(text) {
    const delimiter = detectDelimiter(text);
    const rows = parseCsv(text, delimiter).filter(function (row) {
      return row.some(function (cell) { return String(cell).trim() !== ""; });
    });

    if (rows.length < 2) {
      return { fatalError: "CSV is empty or missing data rows.", records: [], errors: [] };
    }

    const headerRow = rows[0].map(function (cell) { return String(cell || "").trim(); });
    if (!hasStrictTemplateHeader(headerRow)) {
      return {
        fatalError: "CSV must match the official template exactly. Required header row:\n" + templateHeaderLine(),
        records: [],
        errors: []
      };
    }

    const records = [];
    const errors = [];

    for (let i = 1; i < rows.length; i += 1) {
      const line = rows[i];
      const assignedToValue = String(line[5] || "").trim();
      const notesValue = String(line[13] || "").trim();
      const rawStatus = normalizePrimaryStatus(line[12]);

      let primaryStatusValue = rawStatus;
      if (!VALID_PRIMARY_STATUS.includes(primaryStatusValue)) {
        primaryStatusValue = assignedToValue ? PRIMARY_STATUS.IN_USE : PRIMARY_STATUS.INVENTORY;
      }

      const record = normalizeAssetRecord({
        assetName: line[0],
        assetTag: line[1],
        serialNumber: line[2],
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
        notes: notesValue
      });

      const error = validateAsset(record);
      if (error) {
        errors.push("Row " + (i + 1) + ": " + error);
        continue;
      }

      records.push(record);
    }

    return { fatalError: null, records: records, errors: errors };
  }

  const form = document.getElementById("assetForm");
  const openDashboardBtn = document.getElementById("openDashboardBtn");
  const closeDashboardBtn = document.getElementById("closeDashboardBtn");
  const dashboardModal = document.getElementById("dashboardModal");
  const dashboardOverlay = document.getElementById("dashboardOverlay");
  const dashDepartment = document.getElementById("dashDepartment");
  const dashDepartmentOptions = document.getElementById("dashDepartmentOptions");
  const dashStatus = document.getElementById("dashStatus");
  const dashYear = document.getElementById("dashYear");
  const clearDashFiltersBtn = document.getElementById("clearDashFiltersBtn");
  const dashMeta = document.getElementById("dashMeta");
  const openAssetPanelBtn = document.getElementById("openAssetPanelBtn");
  const actionsMenu = document.querySelector("details.actions-menu");
  const manageDepartmentsBtn = document.getElementById("manageDepartmentsBtn");
  const importExportBtn = document.getElementById("importExportBtn");
  const refreshDataBtn = document.getElementById("refreshDataBtn");
  const currentUserBadge = document.getElementById("currentUserBadge");
  const logoutBtn = document.getElementById("logoutBtn");
  const manageUsersBtn = document.getElementById("manageUsersBtn");
  const massDeleteLink = document.getElementById("massDeleteLink");
  const openDeleteRequestsBtn = document.getElementById("openDeleteRequestsBtn");
  const openTrashBinBtn = document.getElementById("openTrashBinBtn");
  const closeAssetPanelBtn = document.getElementById("closeAssetPanelBtn");
  const panelOverlay = document.getElementById("panelOverlay");
  const assetDetailsModal = document.getElementById("assetDetailsModal");
  const closeAssetDetailsBtn = document.getElementById("closeAssetDetailsBtn");
  const editFromDetailsBtn = document.getElementById("editFromDetailsBtn");
  const deleteFromDetailsBtn = document.getElementById("deleteFromDetailsBtn");
  const detailsOverlay = document.getElementById("detailsOverlay");
  const assetRows = document.getElementById("assetRows");
  const emptyState = document.getElementById("emptyState");
  const primaryStatus = document.getElementById("primaryStatus");
  const submitBtn = document.getElementById("submitBtn");

  const totalCount = document.getElementById("totalCount");
  const inventoryCount = document.getElementById("inventoryCount");
  const inUseCount = document.getElementById("inUseCount");
  const deferredCount = document.getElementById("deferredCount");
  const repComputersPast = document.getElementById("repComputersPast");
  const repAssetsPast = document.getElementById("repAssetsPast");
  const repDueThisYear = document.getElementById("repDueThisYear");
  const repDueNextYear = document.getElementById("repDueNextYear");
  const repDeptRows = document.getElementById("repDeptRows");
  const repBucketRows = document.getElementById("repBucketRows");
  const statusPieChart = document.getElementById("statusPieChart");
  const bucketPieChart = document.getElementById("bucketPieChart");
  const statusPieLegend = document.getElementById("statusPieLegend");
  const bucketPieLegend = document.getElementById("bucketPieLegend");
  const searchInput = document.getElementById("searchInput");
  const clearSearchBtn = document.getElementById("clearSearchBtn");
  const searchMeta = document.getElementById("searchMeta");
  const csvInput = document.getElementById("csvInput");

  const filterPrimaryStatus = document.getElementById("filterPrimaryStatus");
  const filterDeviceType = document.getElementById("filterDeviceType");
  const filterDepartment = document.getElementById("filterDepartment");
  const filterLifecycleYear = document.getElementById("filterLifecycleYear");
  const departmentCombo = document.getElementById("departmentCombo");
  const departmentComboBtn = document.getElementById("departmentComboBtn");
  const departmentComboList = document.getElementById("departmentComboList");
  const clearFiltersBtn = document.getElementById("clearFiltersBtn");
  const viewModeSelect = document.getElementById("viewModeSelect");
  const pageSizeSelect = document.getElementById("pageSizeSelect");
  const paginationControls = document.getElementById("paginationControls");
  const departmentAdminModal = document.getElementById("departmentAdminModal");
  const departmentAdminOverlay = document.getElementById("departmentAdminOverlay");
  const closeDepartmentAdminBtn = document.getElementById("closeDepartmentAdminBtn");
  const departmentAdminInput = document.getElementById("departmentAdminInput");
  const departmentAdminAddBtn = document.getElementById("departmentAdminAddBtn");
  const departmentAdminSelect = document.getElementById("departmentAdminSelect");
  const departmentAdminRemoveBtn = document.getElementById("departmentAdminRemoveBtn");
  const departmentImpactPanel = document.getElementById("departmentImpactPanel");
  const departmentImpactText = document.getElementById("departmentImpactText");
  const departmentMoveTargetSelect = document.getElementById("departmentMoveTargetSelect");
  const departmentMoveConfirmBtn = document.getElementById("departmentMoveConfirmBtn");
  const departmentDeleteAnywayBtn = document.getElementById("departmentDeleteAnywayBtn");
  const departmentImpactCancelBtn = document.getElementById("departmentImpactCancelBtn");

  const resetBtn = document.getElementById("resetBtn");
  const clearBtn = document.getElementById("clearBtn");
  const detailAssetName = document.getElementById("detailAssetName");
  const detailAssetTag = document.getElementById("detailAssetTag");
  const detailSerialNumber = document.getElementById("detailSerialNumber");
  const detailDeviceType = document.getElementById("detailDeviceType");
  const detailModel = document.getElementById("detailModel");
  const detailAssignedTo = document.getElementById("detailAssignedTo");
  const detailLocation = document.getElementById("detailLocation");
  const detailRoomNumber = document.getElementById("detailRoomNumber");
  const detailDepartment = document.getElementById("detailDepartment");
  const detailPurchaseDate = document.getElementById("detailPurchaseDate");
  const detailLifecycleYear = document.getElementById("detailLifecycleYear");
  const detailAssetValue = document.getElementById("detailAssetValue");
  const detailPrimary = document.getElementById("detailPrimary");
  const detailDeleteRequest = document.getElementById("detailDeleteRequest");
  const detailNotes = document.getElementById("detailNotes");
  const assetCommentInput = document.getElementById("assetCommentInput");
  const addAssetCommentBtn = document.getElementById("addAssetCommentBtn");
  const assetCommentMeta = document.getElementById("assetCommentMeta");
  const assetCommentTimeline = document.getElementById("assetCommentTimeline");
  const appDialog = document.getElementById("appDialog");
  const appDialogOverlay = document.getElementById("appDialogOverlay");
  const appDialogTitle = document.getElementById("appDialogTitle");
  const appDialogMessage = document.getElementById("appDialogMessage");
  const appDialogCancelBtn = document.getElementById("appDialogCancelBtn");
  const appDialogConfirmBtn = document.getElementById("appDialogConfirmBtn");
  const userAdminModal = document.getElementById("userAdminModal");
  const userAdminOverlay = document.getElementById("userAdminOverlay");
  const closeUserAdminBtn = document.getElementById("closeUserAdminBtn");
  const newAgentUsername = document.getElementById("newAgentUsername");
  const newAgentPassword = document.getElementById("newAgentPassword");
  const newUserRole = document.getElementById("newUserRole");
  const createAgentBtn = document.getElementById("createAgentBtn");
  const resetTargetLabel = document.getElementById("resetTargetLabel");
  const resetTargetUserId = document.getElementById("resetTargetUserId");
  const resetAccountPassword = document.getElementById("resetAccountPassword");
  const resetAccountPasswordBtn = document.getElementById("resetAccountPasswordBtn");
  const userAdminRows = document.getElementById("userAdminRows");
  const deleteRequestsModal = document.getElementById("deleteRequestsModal");
  const deleteRequestsOverlay = document.getElementById("deleteRequestsOverlay");
  const closeDeleteRequestsBtn = document.getElementById("closeDeleteRequestsBtn");
  const deleteRequestsRows = document.getElementById("deleteRequestsRows");
  const trashBinModal = document.getElementById("trashBinModal");
  const trashBinOverlay = document.getElementById("trashBinOverlay");
  const closeTrashBinBtn = document.getElementById("closeTrashBinBtn");
  const trashBinRows = document.getElementById("trashBinRows");
  const fileOpsDialog = document.getElementById("fileOpsDialog");
  const fileOpsOverlay = document.getElementById("fileOpsOverlay");
  const fileOpsImportBtn = document.getElementById("fileOpsImportBtn");
  const fileOpsExportBtn = document.getElementById("fileOpsExportBtn");
  const fileOpsCloseBtn = document.getElementById("fileOpsCloseBtn");

  const supabaseConfig = window.SUPABASE_CONFIG || null;
  const supabaseClient = (window.supabase && supabaseConfig && supabaseConfig.url && supabaseConfig.anonKey)
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
    : null;
  const auth = window.PCCAuth || null;
  if (auth && typeof auth.ensureDefaultAccounts === "function") auth.ensureDefaultAccounts();
  const session = auth && typeof auth.requireAuthAsync === "function"
    ? await auth.requireAuthAsync({ allowRoles: ["MANAGER", "SUPERVISOR", "AGENT"] })
    : (auth && typeof auth.requireAuth === "function"
      ? auth.requireAuth({ allowRoles: ["MANAGER", "SUPERVISOR", "AGENT"] })
      : null);
  if (!session) return;
  const currentUser = session;
  const currentUserId = currentUser && currentUser.userId ? currentUser.userId : null;
  if (!supabaseClient) {
    document.body.innerHTML = "<div style='padding:24px;font-family:Space Grotesk,sans-serif;'><h2>Cloud Connection Required</h2><p>This application is configured for Supabase-only data storage.</p><p><a href='./login.html'>Return to login</a></p></div>";
    return;
  }
  let editingTag = null;
  let assets = [];
  let assetIndexByTag = new Map();
  let searchableAssets = [];
  let searchInputDebounceTimer = null;
  let searchInputTouchedByUser = false;
  let panelCloseTimer = null;
  let dashboardCloseTimer = null;
  let currentViewMode = "standard";
  let currentPage = 1;
  let currentPageSize = 10;
  const DEFAULT_DEPARTMENTS = ["Finance", "IT", "Office Of President", "HR", "Culinary"];
  let departmentList = loadDepartmentList();
  let pendingDepartmentRemoval = null;
  let departmentComboOpen = false;
  let trashArchiveRows = [];

  function canonicalAssetTag(value) {
    return String(value || "").trim().toLowerCase();
  }

  function rebuildAssetIndexes() {
    assetIndexByTag = new Map();
    searchableAssets = assets.map(function (asset, index) {
      const assetTag = String(asset.assetTag || "").trim();
      const assetTagLower = assetTag.toLowerCase();
      const assetNameLower = String(asset.assetName || "").toLowerCase();
      const serialLower = String(asset.serialNumber || "").toLowerCase();
      const assignedLower = String(asset.assignedTo || "").toLowerCase();
      const deviceTypeLower = String(asset.deviceType || "").toLowerCase();
      const departmentLower = String(asset.department || "").trim().toLowerCase();
      const lifecycleYear = String(asset.lifecycleYear || "").trim();
      const canonicalTag = canonicalAssetTag(assetTag);
      if (canonicalTag && !assetIndexByTag.has(canonicalTag)) assetIndexByTag.set(canonicalTag, index);
      return {
        index: index,
        assetTagLower: assetTagLower,
        assetNameLower: assetNameLower,
        serialLower: serialLower,
        assignedLower: assignedLower,
        deviceTypeLower: deviceTypeLower,
        departmentLower: departmentLower,
        lifecycleYear: lifecycleYear
      };
    });
  }

  function getAssetIndexByTag(tag) {
    if (!tag) return -1;
    const index = assetIndexByTag.get(canonicalAssetTag(tag));
    return Number.isInteger(index) ? index : -1;
  }

  function loadDepartmentList() {
    return DEFAULT_DEPARTMENTS.slice();
  }

  function saveDepartmentList() {
    return;
  }

  function normalizeDepartmentName(value) {
    return String(value || "").trim();
  }

  function addDepartmentToList(value) {
    const name = normalizeDepartmentName(value);
    if (!name) return false;
    const exists = departmentList.some(function (item) { return item.toLowerCase() === name.toLowerCase(); });
    if (exists) return false;
    departmentList.push(name);
    departmentList.sort(function (a, b) { return a.localeCompare(b); });
    saveDepartmentList();
    renderDepartmentOptions();
    return true;
  }

  function removeDepartmentFromList(value) {
    const name = normalizeDepartmentName(value);
    if (!name) return false;
    const next = departmentList.filter(function (item) { return item.toLowerCase() !== name.toLowerCase(); });
    if (next.length === departmentList.length) return false;
    departmentList = next;
    saveDepartmentList();
    renderDepartmentOptions();
    return true;
  }

  async function syncDepartmentsFromSupabase() {
    if (!supabaseClient) return false;
    const result = await supabaseClient
      .from("departments")
      .select("name")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (result.error) {
      showAppNotice("Department Sync Error", result.error.message || "Unable to load departments from Supabase.");
      return false;
    }
    const fromDb = (result.data || []).map(function (item) { return String(item.name || "").trim(); }).filter(Boolean);
    departmentList = fromDb.length ? fromDb : DEFAULT_DEPARTMENTS.slice();
    renderDepartmentOptions();
    return true;
  }

  function syncBodyScrollLock() {
    const panelVisible = panelOverlay && !panelOverlay.hidden;
    const detailsVisible = detailsOverlay && !detailsOverlay.hidden;
    const dashboardVisible = dashboardOverlay && !dashboardOverlay.hidden;
    const departmentVisible = departmentAdminOverlay && !departmentAdminOverlay.hidden;
    const usersVisible = userAdminOverlay && !userAdminOverlay.hidden;
    const deleteRequestsVisible = deleteRequestsOverlay && !deleteRequestsOverlay.hidden;
    const trashVisible = trashBinOverlay && !trashBinOverlay.hidden;
    const dialogVisible = appDialogOverlay && !appDialogOverlay.hidden;
    const fileOpsVisible = fileOpsOverlay && !fileOpsOverlay.hidden;
    document.body.classList.toggle("no-scroll", panelVisible || detailsVisible || dashboardVisible || departmentVisible || usersVisible || deleteRequestsVisible || trashVisible || dialogVisible || fileOpsVisible);
  }

  function closeAppDialog() {
    if (!appDialog || !appDialogOverlay) return;
    appDialog.hidden = true;
    appDialog.setAttribute("aria-hidden", "true");
    appDialogOverlay.hidden = true;
    appDialogConfirmBtn.onclick = null;
    appDialogCancelBtn.onclick = null;
    appDialogCancelBtn.hidden = false;
    syncBodyScrollLock();
  }

  function showAppConfirm(title, message, onConfirm, confirmLabel, cancelLabel) {
    if (!appDialog || !appDialogOverlay || !appDialogTitle || !appDialogMessage || !appDialogConfirmBtn || !appDialogCancelBtn) {
      if (confirm(message)) onConfirm();
      return;
    }
    appDialogTitle.textContent = title || "Confirm Action";
    appDialogMessage.textContent = message || "";
    appDialogConfirmBtn.textContent = confirmLabel || "Confirm";
    appDialogCancelBtn.textContent = cancelLabel || "Cancel";
    appDialog.hidden = false;
    appDialog.setAttribute("aria-hidden", "false");
    appDialogOverlay.hidden = false;
    appDialogConfirmBtn.onclick = function () {
      closeAppDialog();
      onConfirm();
    };
    appDialogCancelBtn.onclick = function () {
      closeAppDialog();
    };
    syncBodyScrollLock();
  }

  function showAppNotice(title, message) {
    showAppConfirm(title, message, function () {}, "OK", "Close");
    if (appDialogCancelBtn) appDialogCancelBtn.hidden = true;
    if (appDialogConfirmBtn) {
      appDialogConfirmBtn.onclick = function () {
        if (appDialogCancelBtn) appDialogCancelBtn.hidden = false;
        closeAppDialog();
      };
    }
  }

  function openFileOpsDialog() {
    if (!fileOpsDialog || !fileOpsOverlay) return;
    fileOpsDialog.hidden = false;
    fileOpsDialog.setAttribute("aria-hidden", "false");
    fileOpsOverlay.hidden = false;
    syncBodyScrollLock();
  }

  function closeFileOpsDialog() {
    if (!fileOpsDialog || !fileOpsOverlay) return;
    fileOpsDialog.hidden = true;
    fileOpsDialog.setAttribute("aria-hidden", "true");
    fileOpsOverlay.hidden = true;
    syncBodyScrollLock();
  }

  function escapeCsvValue(value) {
    const text = String(value === null || value === undefined ? "" : value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
    return text;
  }

  function exportVisibleAssetsToCsv() {
    const rows = getVisibleAssets();
    const headers = [
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
      "Status",
      "Reason/Notes"
    ];
    const lines = [headers.join(",")];
    rows.forEach(function (asset) {
      lines.push([
        asset.assetName || "",
        asset.assetTag || "",
        asset.serialNumber || "",
        asset.deviceType || "",
        asset.model || "",
        asset.assignedTo || "",
        asset.location || "",
        asset.roomNumber || "",
        asset.department || "",
        asset.purchaseDate || "",
        asset.lifecycleYear || "",
        asset.assetValue || "",
        asset.primaryStatus || "",
        asset.notes || ""
      ].map(escapeCsvValue).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = "assets-export-" + stamp + ".csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function isManagerOrSupervisor() {
    return currentUser.role === "MANAGER" || currentUser.role === "SUPERVISOR";
  }

  function isAgentRole() {
    return currentUser.role === "AGENT";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderCurrentUserState() {
    if (currentUserBadge) {
      currentUserBadge.textContent = currentUser.username + " (" + currentUser.role + ")";
    }
    const canManage = isManagerOrSupervisor();
    if (manageUsersBtn) manageUsersBtn.hidden = !canManage;
    if (massDeleteLink) massDeleteLink.hidden = !canManage;
    if (manageDepartmentsBtn) manageDepartmentsBtn.hidden = !canManage;
    if (importExportBtn) importExportBtn.hidden = !canManage;
    if (openDeleteRequestsBtn) openDeleteRequestsBtn.hidden = !canManage;
    if (openTrashBinBtn) openTrashBinBtn.hidden = !canManage;
  }

  async function renderUserAdminTable() {
    if (!userAdminRows || !auth || typeof auth.listAccounts !== "function") return;
    const accounts = await auth.listAccounts();
    if (!Array.isArray(accounts) || !accounts.length) {
      userAdminRows.innerHTML = `<tr><td colspan="5">No users found.</td></tr>`;
      return;
    }
    userAdminRows.innerHTML = accounts.map(function (item) {
      const createdAt = item.createdAt ? new Date(item.createdAt).toLocaleString() : "-";
      const userId = escapeHtml(item.userId || "");
      const username = escapeHtml(item.username || "-");
      const role = escapeHtml(item.role || "-");
      const createdBy = escapeHtml(item.createdBy || "-");
      return `<tr>
        <td>${username}</td>
        <td>${role}</td>
        <td>${createdBy}</td>
        <td>${createdAt}</td>
        <td><button type="button" class="ghost" data-reset-user-id="${userId}" data-reset-username="${username}">Reset Password</button></td>
      </tr>`;
    }).join("");
  }

  function openUserAdminModal() {
    if (!isManagerOrSupervisor()) return;
    if (!userAdminModal || !userAdminOverlay) return;
    renderUserAdminTable();
    if (newAgentUsername) newAgentUsername.value = "";
    if (newAgentPassword) newAgentPassword.value = "";
    if (newUserRole) newUserRole.value = "AGENT";
    if (resetTargetLabel) resetTargetLabel.value = "";
    if (resetTargetUserId) resetTargetUserId.value = "";
    if (resetAccountPassword) resetAccountPassword.value = "";
    if (resetAccountPasswordBtn) resetAccountPasswordBtn.disabled = true;
    userAdminModal.hidden = false;
    userAdminModal.setAttribute("aria-hidden", "false");
    userAdminOverlay.hidden = false;
    syncBodyScrollLock();
  }

  function closeUserAdminModal() {
    if (!userAdminModal || !userAdminOverlay) return;
    userAdminModal.hidden = true;
    userAdminModal.setAttribute("aria-hidden", "true");
    userAdminOverlay.hidden = true;
    syncBodyScrollLock();
  }

  function resetDepartmentImpactPanel() {
    pendingDepartmentRemoval = null;
    if (departmentImpactPanel) departmentImpactPanel.hidden = true;
    if (departmentImpactText) departmentImpactText.textContent = "";
    if (departmentMoveTargetSelect) departmentMoveTargetSelect.value = "";
  }

  function openDepartmentAdminModal() {
    if (!departmentAdminModal || !departmentAdminOverlay) return;
    resetDepartmentImpactPanel();
    if (departmentAdminInput) departmentAdminInput.value = "";
    renderDepartmentOptions();
    departmentAdminModal.hidden = false;
    departmentAdminModal.setAttribute("aria-hidden", "false");
    departmentAdminOverlay.hidden = false;
    syncBodyScrollLock();
  }

  function closeDepartmentAdminModal() {
    if (!departmentAdminModal || !departmentAdminOverlay) return;
    departmentAdminModal.hidden = true;
    departmentAdminModal.setAttribute("aria-hidden", "true");
    departmentAdminOverlay.hidden = true;
    resetDepartmentImpactPanel();
    syncBodyScrollLock();
  }

  async function applyDepartmentRemoval(action) {
    if (!pendingDepartmentRemoval) return;
    if (!supabaseClient) {
      showAppNotice("Cloud Required", "Department updates require Supabase connection.");
      return;
    }
    const department = pendingDepartmentRemoval.department;
    const affectedIndexes = pendingDepartmentRemoval.assetIndexes.slice();
    const affectedAssetIds = affectedIndexes
      .map(function (index) { return assets[index] && assets[index].id ? Number(assets[index].id) : null; })
      .filter(function (id) { return Number.isFinite(id); });

    if (action === "move") {
      const target = departmentMoveTargetSelect ? String(departmentMoveTargetSelect.value || "").trim() : "";
      if (!target) {
        showAppNotice("Department", "Select a target department first.");
        return;
      }
      if (affectedAssetIds.length) {
        const moveResult = await supabaseClient
          .from("assets")
          .update({ department: target, updated_by: currentUserId })
          .in("id", affectedAssetIds);
        if (moveResult.error) {
          showAppNotice("Department Update Error", moveResult.error.message || "Unable to move department assignments.");
          return;
        }
      }
    } else if (action === "unassign") {
      if (affectedAssetIds.length) {
        const clearResult = await supabaseClient
          .from("assets")
          .update({ department: null, updated_by: currentUserId })
          .in("id", affectedAssetIds);
        if (clearResult.error) {
          showAppNotice("Department Update Error", clearResult.error.message || "Unable to clear department assignments.");
          return;
        }
      }
    } else {
      return;
    }

    const removeResult = await supabaseClient
      .from("departments")
      .delete()
      .eq("name", department);
    if (removeResult.error) {
      showAppNotice("Department Remove Error", removeResult.error.message || "Unable to remove department.");
      return;
    }
    await addAuditLog("DEPARTMENT_REMOVE", { department: department, action: action }, null);
    removeDepartmentFromList(department);
    if (form.department && String(form.department.value || "").toLowerCase() === department.toLowerCase()) form.department.value = "";
    if (filterDepartment && String(filterDepartment.value || "").toLowerCase() === department.toLowerCase()) filterDepartment.value = "";
    if (dashDepartment && String(dashDepartment.value || "").toLowerCase() === department.toLowerCase()) dashDepartment.value = "";
    await syncDepartmentsFromSupabase();
    await refreshAssetsFromSupabase();
    resetDepartmentImpactPanel();
    renderDepartmentOptions();
    showAppNotice("Department Updated", "Department changes were applied successfully.");
  }

  function openDashboardModal() {
    if (!dashboardModal || !dashboardOverlay) return;
    if (dashboardCloseTimer) {
      window.clearTimeout(dashboardCloseTimer);
      dashboardCloseTimer = null;
    }
    dashboardModal.hidden = false;
    dashboardModal.setAttribute("aria-hidden", "false");
    dashboardOverlay.hidden = false;
    syncBodyScrollLock();
    window.requestAnimationFrame(function () {
      dashboardModal.classList.add("is-open");
      dashboardOverlay.classList.add("is-open");
    });
    renderReportingDashboard();
  }

  function closeDashboardModal() {
    if (!dashboardModal || !dashboardOverlay) return;
    dashboardModal.classList.remove("is-open");
    dashboardOverlay.classList.remove("is-open");
    dashboardModal.setAttribute("aria-hidden", "true");
    if (dashboardCloseTimer) window.clearTimeout(dashboardCloseTimer);
    dashboardCloseTimer = window.setTimeout(function () {
      dashboardModal.hidden = true;
      dashboardOverlay.hidden = true;
      syncBodyScrollLock();
      dashboardCloseTimer = null;
    }, 220);
  }

  function openAssetPanel() {
    if (!form || !panelOverlay) return;
    if (panelCloseTimer) {
      window.clearTimeout(panelCloseTimer);
      panelCloseTimer = null;
    }
    form.hidden = false;
    form.classList.add("is-open");
    form.style.transform = "translateX(0)";
    form.setAttribute("aria-hidden", "false");
    panelOverlay.hidden = false;
    syncBodyScrollLock();
  }

  function closeAssetPanel() {
    if (!form || !panelOverlay) return;
    form.classList.remove("is-open");
    form.style.transform = "";
    form.setAttribute("aria-hidden", "true");
    panelOverlay.hidden = true;
    syncBodyScrollLock();
    panelCloseTimer = window.setTimeout(function () {
      form.hidden = true;
      panelCloseTimer = null;
    }, 240);
  }

  function formatDateForDetails(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  function formatCurrency(value) {
    const numeric = Number(value);
    if (!value || Number.isNaN(numeric)) return "-";
    return numeric.toLocaleString(undefined, { style: "currency", currency: "USD" });
  }

  function formatCommentTimestamp(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  function mapDbAssetToUi(row, commentsByAssetId, usernameByUserId) {
    const comments = commentsByAssetId.get(Number(row.id)) || [];
    const commentHistory = comments
      .slice()
      .sort(function (a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); })
      .map(function (item) {
        const userId = item.created_by ? String(item.created_by) : "";
        return {
          id: String(item.id),
          text: String(item.comment_text || "").trim(),
          timestamp: String(item.created_at || ""),
          username: usernameByUserId.get(userId)
            || (userId && currentUserId && userId === String(currentUserId) ? String(currentUser.username || "").trim() : "")
            || ""
        };
      });

    return normalizeAssetRecord({
      id: Number(row.id),
      assetName: row.asset_name,
      assetTag: row.asset_tag,
      serialNumber: row.serial_number,
      deviceType: row.device_type,
      model: row.model,
      assignedTo: row.assigned_user,
      location: row.location,
      roomNumber: row.room_number,
      department: row.department,
      purchaseDate: row.purchase_date,
      lifecycleYear: row.lifecycle_year ? String(row.lifecycle_year) : "",
      assetValue: row.asset_value ? String(row.asset_value) : "",
      primaryStatus: row.status,
      notes: row.notes,
      commentHistory: commentHistory,
      pendingDelete: row.pending_delete_at
        ? {
          requestedBy: row.pending_delete_by ? (usernameByUserId.get(String(row.pending_delete_by)) || String(row.pending_delete_by)) : "unknown",
          requestedAt: String(row.pending_delete_at),
          requestedById: row.pending_delete_by ? String(row.pending_delete_by) : ""
        }
        : null
    });
  }

  function mapUiAssetToDb(asset) {
    return {
      asset_tag: asset.assetTag || "",
      asset_name: asset.assetName || "",
      serial_number: asset.serialNumber || null,
      device_type: asset.deviceType || "",
      model: asset.model || null,
      assigned_user: asset.assignedTo || null,
      location: asset.location || null,
      room_number: asset.roomNumber || null,
      department: asset.department || null,
      purchase_date: asset.purchaseDate || null,
      lifecycle_year: asset.lifecycleYear ? Number(asset.lifecycleYear) : null,
      asset_value: asset.assetValue === "" || asset.assetValue === null || asset.assetValue === undefined ? null : Number(asset.assetValue),
      status: asset.primaryStatus || PRIMARY_STATUS.INVENTORY,
      notes: asset.notes || null,
      updated_by: currentUserId
    };
  }

  async function addAuditLog(action, details, assetId) {
    if (!supabaseClient) return;
    try {
      await supabaseClient.from("asset_audit").insert({
        asset_id: assetId || null,
        action: action,
        actor_user_id: currentUserId,
        actor_username: currentUser.username,
        details: details || {}
      });
    } catch (_error) {}
  }

  async function addAssetActivityEntry(assetId, text) {
    if (!supabaseClient || !assetId || !text) return;
    try {
      await supabaseClient.from("asset_comments").insert({
        asset_id: Number(assetId),
        comment_text: String(text).trim().slice(0, 1000),
        created_by: currentUserId
      });
    } catch (_error) {}
  }

  async function archiveAssetBeforeDelete(asset, actionLabel) {
    if (!supabaseClient || !asset || !asset.id) return false;
    const requestedById = asset.pendingDelete && asset.pendingDelete.requestedById ? String(asset.pendingDelete.requestedById) : null;
    const requestedBy = asset.pendingDelete && asset.pendingDelete.requestedBy ? String(asset.pendingDelete.requestedBy) : null;
    const requestedAt = asset.pendingDelete && asset.pendingDelete.requestedAt ? String(asset.pendingDelete.requestedAt) : null;
    const archivePayload = {
      original_asset_id: Number(asset.id),
      asset_tag: asset.assetTag || "",
      asset_name: asset.assetName || null,
      serial_number: asset.serialNumber || null,
      device_type: asset.deviceType || null,
      model: asset.model || null,
      assigned_user: asset.assignedTo || null,
      location: asset.location || null,
      room_number: asset.roomNumber || null,
      department: asset.department || null,
      purchase_date: asset.purchaseDate || null,
      lifecycle_year: asset.lifecycleYear ? Number(asset.lifecycleYear) : null,
      asset_value: asset.assetValue === "" || asset.assetValue === null || asset.assetValue === undefined ? null : Number(asset.assetValue),
      status: asset.primaryStatus || null,
      notes: asset.notes || null,
      requested_by_user_id: requestedById,
      requested_by_username: requestedBy,
      requested_at: requestedAt,
      deleted_by_user_id: currentUserId,
      deleted_by_username: currentUser.username || "unknown",
      delete_action: actionLabel || "DELETE",
      snapshot: asset
    };
    const archiveResult = await supabaseClient
      .from("deleted_assets")
      .insert(archivePayload);
    if (archiveResult.error) {
      showAppNotice("Trash Bin Error", archiveResult.error.message || "Unable to archive asset before delete.");
      return false;
    }
    return true;
  }

  function valueForCompare(value) {
    return String(value === null || value === undefined ? "" : value).trim();
  }

  function collectAssetChangeSummary(before, after) {
    if (!before || !after) return [];
    const fields = [
      { key: "assetTag", label: "Asset Tag" },
      { key: "assetName", label: "Asset Name" },
      { key: "serialNumber", label: "Serial Number" },
      { key: "deviceType", label: "Device Type" },
      { key: "model", label: "Model" },
      { key: "assignedTo", label: "Assigned User" },
      { key: "location", label: "Location" },
      { key: "roomNumber", label: "Room #" },
      { key: "department", label: "Department" },
      { key: "purchaseDate", label: "Purchase Date" },
      { key: "lifecycleYear", label: "Lifecycle Year" },
      { key: "assetValue", label: "Asset Value" },
      { key: "primaryStatus", label: "Status" },
      { key: "notes", label: "Notes" }
    ];
    const changes = [];
    fields.forEach(function (field) {
      const prev = valueForCompare(before[field.key]);
      const next = valueForCompare(after[field.key]);
      if (prev === next) return;
      const prevLabel = prev || "-";
      const nextLabel = next || "-";
      changes.push(field.label + ": " + prevLabel + " -> " + nextLabel);
    });
    return changes;
  }

  async function approveDeleteRequestByAssetId(assetId) {
    if (!isManagerOrSupervisor()) return;
    const asset = assets.find(function (item) { return Number(item.id) === Number(assetId); });
    if (!asset || !asset.id) return;
    showAppConfirm(
      "Approve Delete Request",
      "Delete asset " + (asset.assetTag || "-") + " now?\nThis action cannot be undone.",
      async function () {
        const archived = await archiveAssetBeforeDelete(asset, "DELETE_APPROVE");
        if (!archived) return;
        addAuditLog("DELETE_APPROVE", { assetTag: asset.assetTag }, null);
        supabaseClient
          .from("assets")
          .delete()
          .eq("id", Number(asset.id))
          .then(async function (result) {
            if (result.error) {
              showAppNotice("Delete Error", result.error.message || "Unable to delete asset.");
              return;
            }
            await refreshAssetsFromSupabase();
            await renderDeleteRequestsTable();
            await renderTrashBinTable();
          });
      },
      "Approve Delete",
      "Cancel"
    );
  }

  async function denyDeleteRequestByAssetId(assetId) {
    if (!isManagerOrSupervisor()) return;
    const asset = assets.find(function (item) { return Number(item.id) === Number(assetId); });
    if (!asset || !asset.id || !asset.pendingDelete) return;
    showAppConfirm(
      "Deny Delete Request",
      "Deny delete request for asset " + (asset.assetTag || "-") + "?",
      function () {
        supabaseClient
          .from("assets")
          .update({
            pending_delete_by: null,
            pending_delete_at: null,
            updated_by: currentUserId
          })
          .eq("id", Number(asset.id))
          .then(async function (result) {
            if (result.error) {
              showAppNotice("Deny Request Error", result.error.message || "Unable to deny delete request.");
              return;
            }
            await addAssetActivityEntry(Number(asset.id), "Delete request denied.");
            await addAuditLog("DELETE_DENY", { assetTag: asset.assetTag }, Number(asset.id));
            await refreshAssetsFromSupabase();
            await renderDeleteRequestsTable();
          });
      },
      "Deny Request",
      "Cancel"
    );
  }

  async function renderDeleteRequestsTable() {
    if (!deleteRequestsRows) return;
    const pending = assets
      .filter(function (item) { return !!item.pendingDelete; })
      .sort(function (a, b) {
        return new Date((b.pendingDelete && b.pendingDelete.requestedAt) || "").getTime()
          - new Date((a.pendingDelete && a.pendingDelete.requestedAt) || "").getTime();
      });
    if (!pending.length) {
      deleteRequestsRows.innerHTML = '<tr><td colspan="5">No pending delete requests.</td></tr>';
      return;
    }
    deleteRequestsRows.innerHTML = pending.map(function (item) {
      const reqBy = item.pendingDelete ? item.pendingDelete.requestedBy : "-";
      const reqAt = item.pendingDelete ? formatCommentTimestamp(item.pendingDelete.requestedAt) : "-";
      return '<tr>'
        + '<td class="mono">' + escapeHtml(item.assetTag || "-") + '</td>'
        + '<td>' + escapeHtml(item.assetName || "-") + '</td>'
        + '<td>' + escapeHtml(reqBy || "-") + '</td>'
        + '<td>' + escapeHtml(reqAt || "-") + '</td>'
        + '<td>'
        + '<button type="button" class="primary" data-approve-delete-id="' + String(item.id) + '">Approve</button> '
        + '<button type="button" class="danger" data-deny-delete-id="' + String(item.id) + '">Deny</button>'
        + '</td>'
        + '</tr>';
    }).join("");
  }

  function openDeleteRequestsModal() {
    if (!isManagerOrSupervisor()) return;
    if (!deleteRequestsModal || !deleteRequestsOverlay) return;
    renderDeleteRequestsTable();
    deleteRequestsModal.hidden = false;
    deleteRequestsModal.setAttribute("aria-hidden", "false");
    deleteRequestsOverlay.hidden = false;
    syncBodyScrollLock();
  }

  function closeDeleteRequestsModal() {
    if (!deleteRequestsModal || !deleteRequestsOverlay) return;
    deleteRequestsModal.hidden = true;
    deleteRequestsModal.setAttribute("aria-hidden", "true");
    deleteRequestsOverlay.hidden = true;
    syncBodyScrollLock();
  }

  async function renderTrashBinTable() {
    if (!trashBinRows || !supabaseClient) return;
    trashBinRows.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
    const result = await supabaseClient
      .from("deleted_assets")
      .select("id, asset_tag, deleted_at, deleted_by_username, requested_by_username, requested_at, delete_action")
      .order("deleted_at", { ascending: false });
    if (result.error) {
      trashBinRows.innerHTML = '<tr><td colspan="6">Unable to load trash bin.</td></tr>';
      return;
    }
    const rows = Array.isArray(result.data) ? result.data : [];
    trashArchiveRows = rows.slice();
    if (!rows.length) {
      trashBinRows.innerHTML = '<tr><td colspan="6">No deleted assets found.</td></tr>';
      return;
    }
    trashBinRows.innerHTML = rows.map(function (row) {
      const actionLabel = String(row.delete_action || "").toUpperCase() === "DELETE_APPROVE" ? "Approved Delete" : "Direct Delete";
      return '<tr>'
        + '<td class="mono">' + escapeHtml(row.asset_tag || "-") + '</td>'
        + '<td>' + escapeHtml(formatCommentTimestamp(row.deleted_at)) + '</td>'
        + '<td>' + escapeHtml(row.deleted_by_username || "-") + '</td>'
        + '<td>' + escapeHtml(row.requested_by_username || "-") + '</td>'
        + '<td>' + escapeHtml(row.requested_at ? formatCommentTimestamp(row.requested_at) : "-") + '</td>'
        + '<td>'
        + escapeHtml(actionLabel)
        + '<div style="margin-top:6px;display:flex;gap:6px;">'
        + '<button type="button" class="primary" data-restore-trash-id="' + String(row.id) + '">Restore</button>'
        + '<button type="button" class="danger" data-purge-trash-id="' + String(row.id) + '">Delete Permanently</button>'
        + '</div>'
        + '</td>'
        + '</tr>';
    }).join("");
  }

  async function restoreDeletedAssetByArchiveId(archiveId) {
    if (!isManagerOrSupervisor() || !supabaseClient) return;
    const fetchResult = await supabaseClient
      .from("deleted_assets")
      .select("*")
      .eq("id", Number(archiveId))
      .single();
    if (fetchResult.error || !fetchResult.data) {
      showAppNotice("Restore Error", fetchResult.error ? (fetchResult.error.message || "Unable to load archive record.") : "Archive record not found.");
      return;
    }
    const row = fetchResult.data;
    const duplicate = await supabaseClient
      .from("assets")
      .select("id")
      .eq("asset_tag", row.asset_tag)
      .limit(1);
    if (!duplicate.error && Array.isArray(duplicate.data) && duplicate.data.length) {
      showAppNotice("Restore Blocked", "An active asset with the same Asset Tag already exists.");
      return;
    }
    const insertPayload = {
      asset_tag: row.asset_tag || "",
      asset_name: row.asset_name || "",
      serial_number: row.serial_number || null,
      device_type: row.device_type || "",
      model: row.model || null,
      assigned_user: row.assigned_user || null,
      location: row.location || null,
      room_number: row.room_number || null,
      department: row.department || null,
      purchase_date: row.purchase_date || null,
      lifecycle_year: row.lifecycle_year || null,
      asset_value: row.asset_value || null,
      status: row.status || PRIMARY_STATUS.INVENTORY,
      notes: row.notes || null,
      pending_delete_by: null,
      pending_delete_at: null,
      updated_by: currentUserId,
      created_by: currentUserId
    };
    const insertResult = await supabaseClient
      .from("assets")
      .insert(insertPayload)
      .select("id")
      .single();
    if (insertResult.error || !insertResult.data) {
      showAppNotice("Restore Error", insertResult.error ? (insertResult.error.message || "Unable to restore asset.") : "Unable to restore asset.");
      return;
    }
    const restoredId = Number(insertResult.data.id);
    await addAssetActivityEntry(restoredId, "Asset restored from Trash Bin.");
    await addAuditLog("RESTORE", { assetTag: row.asset_tag }, restoredId);
    await supabaseClient.from("deleted_assets").delete().eq("id", Number(archiveId));
    await refreshAssetsFromSupabase();
    await renderTrashBinTable();
  }

  async function purgeDeletedAssetByArchiveId(archiveId) {
    if (!isManagerOrSupervisor() || !supabaseClient) return;
    const archive = trashArchiveRows.find(function (row) { return Number(row.id) === Number(archiveId); });
    const tag = archive && archive.asset_tag ? archive.asset_tag : "";
    showAppConfirm(
      "Delete Permanently",
      "Permanently remove " + (tag || "this item") + " from Trash Bin?\nThis cannot be undone.",
      async function () {
        const result = await supabaseClient
          .from("deleted_assets")
          .delete()
          .eq("id", Number(archiveId));
        if (result.error) {
          showAppNotice("Purge Error", result.error.message || "Unable to permanently delete archive record.");
          return;
        }
        await addAuditLog("PURGE", { assetTag: tag }, null);
        await renderTrashBinTable();
      },
      "Delete Permanently",
      "Cancel"
    );
  }

  function openTrashBinModal() {
    if (!isManagerOrSupervisor()) return;
    if (!trashBinModal || !trashBinOverlay) return;
    renderTrashBinTable();
    trashBinModal.hidden = false;
    trashBinModal.setAttribute("aria-hidden", "false");
    trashBinOverlay.hidden = false;
    syncBodyScrollLock();
  }

  function closeTrashBinModal() {
    if (!trashBinModal || !trashBinOverlay) return;
    trashBinModal.hidden = true;
    trashBinModal.setAttribute("aria-hidden", "true");
    trashBinOverlay.hidden = true;
    syncBodyScrollLock();
  }

  async function refreshAssetsFromSupabase() {
    if (!supabaseClient) return false;
    const assetsResult = await supabaseClient
      .from("assets")
      .select("*")
      .order("id", { ascending: false });
    if (assetsResult.error) {
      showAppNotice("Supabase Sync Error", assetsResult.error.message || "Unable to load assets from Supabase.");
      return false;
    }

    const dbRows = Array.isArray(assetsResult.data) ? assetsResult.data : [];
    const assetIds = dbRows.map(function (row) { return Number(row.id); }).filter(function (id) { return Number.isFinite(id); });
    const commentsByAssetId = new Map();
    const userIdSet = new Set();

    if (assetIds.length) {
      const commentsResult = await supabaseClient
        .from("asset_comments")
        .select("id, asset_id, comment_text, created_by, created_at")
        .in("asset_id", assetIds);
      if (!commentsResult.error && Array.isArray(commentsResult.data)) {
        commentsResult.data.forEach(function (item) {
          const key = Number(item.asset_id);
          if (!commentsByAssetId.has(key)) commentsByAssetId.set(key, []);
          commentsByAssetId.get(key).push(item);
          if (item.created_by) userIdSet.add(String(item.created_by));
        });
      }
    }

    dbRows.forEach(function (row) {
      if (row.pending_delete_by) userIdSet.add(String(row.pending_delete_by));
    });

    const usernameByUserId = new Map();
    if (currentUserId) {
      usernameByUserId.set(String(currentUserId), String(currentUser.username || "").trim());
    }
    const userIds = Array.from(userIdSet);
    if (userIds.length) {
      const lookupResult = await supabaseClient.rpc("lookup_usernames", { user_ids: userIds });
      if (!lookupResult.error && Array.isArray(lookupResult.data)) {
        lookupResult.data.forEach(function (item) {
          usernameByUserId.set(String(item.id), String(item.username || ""));
        });
      } else {
        const profilesResult = await supabaseClient
          .from("profiles")
          .select("id, username")
          .in("id", userIds);
        if (!profilesResult.error && Array.isArray(profilesResult.data)) {
          profilesResult.data.forEach(function (item) {
            usernameByUserId.set(String(item.id), String(item.username || ""));
          });
        }
      }
    }

    assets = dbRows.map(function (row) {
      const ui = mapDbAssetToUi(row, commentsByAssetId, usernameByUserId);
      ui.id = Number(row.id);
      return ui;
    });
    rebuildAssetIndexes();
    renderTable();
    return true;
  }

  function buildCommentEntry(text, username) {
    const timestamp = new Date().toISOString();
    return {
      id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8),
      text: String(text || "").trim(),
      timestamp: timestamp,
      username: String(username || "Unknown User").trim() || "Unknown User"
    };
  }

  function renderCommentTimeline(asset) {
    if (!assetCommentTimeline || !assetCommentMeta) return;
    const comments = Array.isArray(asset && asset.commentHistory) ? asset.commentHistory.slice() : [];
    const sortedComments = comments
      .map(function (item, index) { return { item: item, index: index }; })
      .sort(function (a, b) {
        return new Date(b.item.timestamp).getTime() - new Date(a.item.timestamp).getTime();
      });

    if (!sortedComments.length) {
      assetCommentMeta.textContent = "No activity notes yet.";
      assetCommentTimeline.innerHTML = "";
      return;
    }

    assetCommentMeta.textContent = sortedComments.length + " activity note" + (sortedComments.length === 1 ? "" : "s") + ".";
    assetCommentTimeline.innerHTML = "";
    sortedComments.forEach(function (entry) {
      const item = entry.item;
      const wrapper = document.createElement("div");
      wrapper.className = "comment-item";
      const time = document.createElement("time");
      time.textContent = formatCommentTimestamp(item.timestamp);
      const text = document.createElement("p");
      text.textContent = item.text;
      const footer = document.createElement("div");
      footer.className = "comment-meta";
      const user = document.createElement("span");
      user.textContent = "By: " + (item.username || "Unknown User");
      footer.appendChild(user);
      if (isManagerOrSupervisor()) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "danger comment-delete-btn";
        removeBtn.textContent = "Delete";
        removeBtn.setAttribute("data-comment-index", String(entry.index));
        footer.appendChild(removeBtn);
      }
      wrapper.appendChild(time);
      wrapper.appendChild(text);
      wrapper.appendChild(footer);
      assetCommentTimeline.appendChild(wrapper);
    });
  }

  async function postCommentForCurrentAsset() {
    if (!assetDetailsModal || !assetCommentInput) return;
    const tag = assetDetailsModal.getAttribute("data-asset-tag") || "";
    if (!tag) return;

    const text = String(assetCommentInput.value || "").trim();
    if (!text) return;
    const authorLabel = String(currentUser && currentUser.username ? currentUser.username : "").trim();
    const storedCommentText = authorLabel
      ? (text + " (posted by " + authorLabel + ")")
      : text;

    const index = getAssetIndexByTag(tag);
    if (index < 0) return;

    const current = assets[index];
    if (supabaseClient && current.id) {
      const insertResult = await supabaseClient.from("asset_comments").insert({
        asset_id: Number(current.id),
        comment_text: storedCommentText,
        created_by: currentUserId
      });
      if (insertResult.error) {
        showAppNotice("Comment Error", insertResult.error.message || "Unable to save comment.");
        return;
      }
      await addAuditLog("COMMENT_ADD", { text: text.slice(0, 200) }, Number(current.id));
      await refreshAssetsFromSupabase();
      assetCommentInput.value = "";
      const refreshedIndex = getAssetIndexByTag(tag);
      if (refreshedIndex >= 0) renderCommentTimeline(assets[refreshedIndex]);
      return;
    }

    showAppNotice("Cloud Required", "Posting comments requires Supabase connection.");
  }

  async function deleteCommentForCurrentAsset(commentIndex) {
    if (!isManagerOrSupervisor()) return;
    if (!assetDetailsModal) return;
    const tag = assetDetailsModal.getAttribute("data-asset-tag") || "";
    if (!tag) return;

    const assetIndex = getAssetIndexByTag(tag);
    if (assetIndex < 0) return;
    const asset = assets[assetIndex];
    const history = Array.isArray(asset.commentHistory) ? asset.commentHistory.slice() : [];
    const index = Number(commentIndex);
    if (!Number.isInteger(index) || index < 0 || index >= history.length) return;

    const removed = history[index];
    showAppConfirm(
      "Delete Activity Comment",
      "Remove this comment from activity history?",
      function () {
        if (supabaseClient && removed && Number.isFinite(Number(removed.id))) {
          supabaseClient
            .from("asset_comments")
            .delete()
            .eq("id", Number(removed.id))
            .then(async function (result) {
              if (result.error) {
                showAppNotice("Comment Error", result.error.message || "Unable to delete comment.");
                return;
              }
              await addAuditLog("COMMENT_DELETE", { commentId: Number(removed.id) }, asset.id || null);
              await refreshAssetsFromSupabase();
              const refreshed = getAssetIndexByTag(tag);
              if (refreshed >= 0) renderCommentTimeline(assets[refreshed]);
              showAppNotice("Comment Deleted", "The selected activity comment was removed.");
            });
          return;
        }
        showAppNotice("Cloud Required", "Deleting comments requires Supabase connection.");
      },
      "Delete",
      "Cancel"
    );
  }

  function openAssetDetails(asset) {
    if (!assetDetailsModal || !detailsOverlay) return;
    assetDetailsModal.setAttribute("data-asset-tag", asset.assetTag || "");
    detailAssetName.textContent = asset.assetName || "-";
    detailAssetTag.textContent = asset.assetTag || "-";
    detailSerialNumber.textContent = asset.serialNumber || "-";
    detailDeviceType.textContent = asset.deviceType || "-";
    detailModel.textContent = asset.model || "-";
    detailAssignedTo.textContent = asset.assignedTo || "-";
    detailLocation.textContent = asset.location || "-";
    detailRoomNumber.textContent = asset.roomNumber || "-";
    detailDepartment.textContent = asset.department || "-";
    detailPurchaseDate.textContent = formatDateForDetails(asset.purchaseDate);
    detailLifecycleYear.textContent = asset.lifecycleYear || "-";
    detailAssetValue.textContent = formatCurrency(asset.assetValue);
    detailPrimary.textContent = primaryStatusLabel(asset.primaryStatus);
    if (detailDeleteRequest) {
      if (asset.pendingDelete && asset.pendingDelete.requestedBy) {
        const when = formatCommentTimestamp(asset.pendingDelete.requestedAt);
        detailDeleteRequest.textContent = "Requested by " + asset.pendingDelete.requestedBy + " on " + when;
      } else {
        detailDeleteRequest.textContent = "-";
      }
    }
    if (deleteFromDetailsBtn) {
      if (isAgentRole()) {
        const isOwnRequest = !!(asset.pendingDelete && asset.pendingDelete.requestedById && currentUserId && asset.pendingDelete.requestedById === String(currentUserId));
        deleteFromDetailsBtn.textContent = asset.pendingDelete ? (isOwnRequest ? "Cancel Request" : "Delete Requested") : "Request Delete";
        deleteFromDetailsBtn.disabled = !!asset.pendingDelete && !isOwnRequest;
      } else {
        deleteFromDetailsBtn.disabled = false;
        deleteFromDetailsBtn.textContent = asset.pendingDelete ? "Approve Delete" : "Delete";
      }
    }
    detailNotes.textContent = asset.notes || "-";
    renderCommentTimeline(asset);
    if (assetCommentInput) assetCommentInput.value = "";
    assetDetailsModal.hidden = false;
    assetDetailsModal.setAttribute("aria-hidden", "false");
    detailsOverlay.hidden = false;
    syncBodyScrollLock();
  }

  function closeAssetDetails() {
    if (!assetDetailsModal || !detailsOverlay) return;
    assetDetailsModal.hidden = true;
    assetDetailsModal.setAttribute("aria-hidden", "true");
    assetDetailsModal.removeAttribute("data-asset-tag");
    detailsOverlay.hidden = true;
    syncBodyScrollLock();
  }

  function startEditAsset(tag) {
    const index = getAssetIndexByTag(tag);
    const asset = index >= 0 ? assets[index] : null;
    if (!asset) return;

    editingTag = tag;
    fillForm(asset);
    submitBtn.textContent = "Update Asset";
    closeAssetDetails();
    openAssetPanel();
  }

  function deleteAssetByTag(tag) {
    if (!tag) return;
    const index = getAssetIndexByTag(tag);
    if (index < 0) return;
    const asset = assets[index];

    if (isAgentRole()) {
      if (asset.pendingDelete) {
        const canCancelOwnRequest = !!(asset.pendingDelete.requestedById && currentUserId && asset.pendingDelete.requestedById === String(currentUserId));
        if (!canCancelOwnRequest) {
          showAppNotice("Delete Request Pending", "A delete request already exists for this asset.");
          return;
        }
        showAppConfirm(
          "Cancel Delete Request",
          "Cancel your delete request for asset " + tag + "?",
          function () {
            if (supabaseClient && asset.id) {
              supabaseClient
                .from("assets")
                .update({
                  pending_delete_by: null,
                  pending_delete_at: null,
                  updated_by: currentUserId
                })
                .eq("id", Number(asset.id))
                .then(async function (result) {
                  if (result.error) {
                    showAppNotice("Cancel Request Error", result.error.message || "Unable to cancel delete request.");
                    return;
                  }
                  await addAssetActivityEntry(Number(asset.id), "Delete request canceled.");
                  await addAuditLog("DELETE_REQUEST_CANCEL", { assetTag: tag }, Number(asset.id));
                  await refreshAssetsFromSupabase();
                  const refreshedIndex = getAssetIndexByTag(tag);
                  if (refreshedIndex >= 0) openAssetDetails(assets[refreshedIndex]);
                });
            }
          },
          "Cancel Request",
          "Keep Request"
        );
        return;
      }
      showAppConfirm(
        "Request Asset Deletion",
        "Submit delete request for asset " + tag + "?\nSupervisor or Manager approval is required.",
        function () {
          if (supabaseClient && asset.id) {
            supabaseClient
              .from("assets")
              .update({
                pending_delete_by: currentUserId,
                pending_delete_at: new Date().toISOString(),
                updated_by: currentUserId
              })
              .eq("id", Number(asset.id))
              .then(async function (result) {
                if (result.error) {
                  showAppNotice("Delete Request Error", result.error.message || "Unable to submit delete request.");
                  return;
                }
                await addAssetActivityEntry(Number(asset.id), "Delete request submitted.");
                await addAuditLog("DELETE_REQUEST", { assetTag: tag }, Number(asset.id));
                await refreshAssetsFromSupabase();
                const refreshedIndex = getAssetIndexByTag(tag);
                if (refreshedIndex >= 0) openAssetDetails(assets[refreshedIndex]);
                showAppNotice("Request Submitted", "Delete request submitted. Managers/Supervisors will see it as 'Delete Requested' in inventory and can approve it from Asset Details.");
              });
            return;
          }
          showAppNotice("Cloud Required", "Delete requests require Supabase connection.");
        },
        "Submit Request",
        "Cancel"
      );
      return;
    }

    const requestNote = asset.pendingDelete
      ? "\nRequested by " + asset.pendingDelete.requestedBy + " on " + formatCommentTimestamp(asset.pendingDelete.requestedAt) + "."
      : "";
    showAppConfirm(
      asset.pendingDelete ? "Approve and Delete Asset" : "Delete Asset",
      "Delete asset " + tag + "?\nThis action cannot be undone." + requestNote,
      async function () {
        const actionLabel = asset.pendingDelete ? "DELETE_APPROVE" : "DELETE";
        const archived = await archiveAssetBeforeDelete(asset, actionLabel);
        if (!archived) return;
        addAuditLog(actionLabel, { assetTag: tag }, null);
        if (supabaseClient && asset.id) {
          supabaseClient
            .from("assets")
            .delete()
            .eq("id", Number(asset.id))
            .then(async function (result) {
              if (result.error) {
                showAppNotice("Delete Error", result.error.message || "Unable to delete asset.");
                return;
              }
              if (editingTag === tag) resetForm();
              closeAssetDetails();
              await refreshAssetsFromSupabase();
            });
          return;
        }
        showAppNotice("Cloud Required", "Deleting assets requires Supabase connection.");
      },
      asset.pendingDelete ? "Approve Delete" : "Delete",
      "Cancel"
    );
  }

  function badgeForPrimary(status) {
    if (status === PRIMARY_STATUS.INVENTORY) return '<span class="pill inv">Inventory</span>';
    if (status === PRIMARY_STATUS.IN_USE) return '<span class="pill use">In-Use</span>';
    if (status === PRIMARY_STATUS.DEFERRED) return '<span class="pill def">Deferred</span>';
    return '<span class="pill sur">Disposed</span>';
  }

  function badgeForDeleteRequest(asset) {
    if (!asset || !asset.pendingDelete) return "";
    return '<div style="margin-top:6px;"><span class="pill def">Delete Requested</span></div>';
  }

  function renderStats(sourceAssets) {
    const records = sourceAssets || assets;
    totalCount.textContent = String(records.length);
    inventoryCount.textContent = String(records.filter(function (item) { return item.primaryStatus === PRIMARY_STATUS.INVENTORY; }).length);
    inUseCount.textContent = String(records.filter(function (item) { return item.primaryStatus === PRIMARY_STATUS.IN_USE; }).length);
    deferredCount.textContent = String(records.filter(function (item) { return item.primaryStatus === PRIMARY_STATUS.DEFERRED; }).length);
  }

  function getLifecycleYearValue(asset) {
    const year = Number(String(asset.lifecycleYear || "").trim());
    return Number.isFinite(year) && year >= 1900 ? year : null;
  }

  function isComputerAsset(asset) {
    const text = `${asset.deviceType || ""} ${asset.model || ""} ${asset.assetName || ""}`.toLowerCase();
    return ["computer", "laptop", "desktop", "workstation"].some(function (keyword) { return text.includes(keyword); });
  }

  function getDashboardVisibleAssets() {
    const department = dashDepartment ? String(dashDepartment.value || "").trim().toLowerCase() : "";
    const status = dashStatus ? String(dashStatus.value || "").trim() : "";
    const year = dashYear ? String(dashYear.value || "").trim() : "";

    return assets.filter(function (asset) {
      const matchDept = !department || String(asset.department || "").trim().toLowerCase() === department;
      const matchStatus = !status || String(asset.primaryStatus || "") === status;
      const matchYear = !year || String(asset.lifecycleYear || "") === year;
      return matchDept && matchStatus && matchYear;
    });
  }

  function renderReportingDashboard() {
    const records = getDashboardVisibleAssets();
    if (!repComputersPast || !repAssetsPast || !repDueThisYear || !repDueNextYear || !repDeptRows || !repBucketRows) return;

    const currentYear = new Date().getFullYear();
    const assetsWithYear = records.filter(function (asset) { return getLifecycleYearValue(asset) !== null; });

    const past = assetsWithYear.filter(function (asset) { return getLifecycleYearValue(asset) < currentYear; });
    const dueThis = assetsWithYear.filter(function (asset) { return getLifecycleYearValue(asset) === currentYear; });
    const dueNext = assetsWithYear.filter(function (asset) { return getLifecycleYearValue(asset) === currentYear + 1; });
    const computersPast = past.filter(function (asset) { return isComputerAsset(asset); });

    repComputersPast.textContent = String(computersPast.length);
    repAssetsPast.textContent = String(past.length);
    repDueThisYear.textContent = String(dueThis.length);
    repDueNextYear.textContent = String(dueNext.length);
    if (dashMeta) dashMeta.textContent = "Showing " + records.length + " of " + assets.length + " assets in dashboard.";

    const byDepartment = new Map();
    records.forEach(function (asset) {
      const dept = (asset.department || "Unassigned").trim() || "Unassigned";
      if (!byDepartment.has(dept)) byDepartment.set(dept, { past: 0, thisYear: 0, nextYear: 0 });
      const entry = byDepartment.get(dept);
      const year = getLifecycleYearValue(asset);
      if (year === null) return;
      if (year < currentYear) entry.past += 1;
      if (year === currentYear) entry.thisYear += 1;
      if (year === currentYear + 1) entry.nextYear += 1;
    });

    const deptRows = Array.from(byDepartment.entries())
      .sort(function (a, b) {
        const aTotal = a[1].past + a[1].thisYear + a[1].nextYear;
        const bTotal = b[1].past + b[1].thisYear + b[1].nextYear;
        return bTotal - aTotal;
      })
      .slice(0, 12)
      .map(function (pair) {
        const dept = pair[0];
        const stats = pair[1];
        return `\n      <tr>\n        <td>${dept}</td>\n        <td>${stats.past}</td>\n        <td>${stats.thisYear}</td>\n        <td>${stats.nextYear}</td>\n      </tr>\n    `;
      })
      .join("");
    repDeptRows.innerHTML = deptRows || `<tr><td colspan="4">No data for selected filters.</td></tr>`;

    const buckets = {
      "Past Due": past.length,
      "This Year": dueThis.length,
      "Next Year": dueNext.length,
      "Future (2+ Years)": assetsWithYear.filter(function (asset) { return getLifecycleYearValue(asset) > currentYear + 1; }).length,
      "No Lifecycle Year": records.filter(function (asset) { return getLifecycleYearValue(asset) === null; }).length
    };

    repBucketRows.innerHTML = Object.entries(buckets)
      .map(function (entry) { return `<tr><td>${entry[0]}</td><td>${entry[1]}</td></tr>`; })
      .join("");

    const statusData = {
      "Inventory": records.filter(function (asset) { return asset.primaryStatus === "INVENTORY"; }).length,
      "In-Use": records.filter(function (asset) { return asset.primaryStatus === "IN_USE"; }).length,
      "Deferred": records.filter(function (asset) { return asset.primaryStatus === "DEFERRED"; }).length,
      "Disposed": records.filter(function (asset) { return asset.primaryStatus === "SURPLUSED"; }).length
    };

    drawPieChart(statusPieChart, statusData, ["#0f766e", "#2563eb", "#991b1b"], statusPieLegend);
    drawPieChart(bucketPieChart, buckets, ["#b91c1c", "#0f766e", "#2563eb", "#92400e", "#6b7280"], bucketPieLegend);
  }

  function drawPieChart(canvas, dataMap, palette, legendEl) {
    if (!canvas || !legendEl) return;

    const parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : canvas.width;
    const nextSize = Math.max(180, Math.min(280, Math.floor(parentWidth - 28)));
    if (Number.isFinite(nextSize) && nextSize > 0 && (canvas.width !== nextSize || canvas.height !== nextSize)) {
      canvas.width = nextSize;
      canvas.height = nextSize;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nextData = {};
    Object.entries(dataMap).forEach(function (entry) {
      const label = entry[0];
      const value = Math.max(0, Number(entry[1]) || 0);
      if (value > 0) nextData[label] = value;
    });
    const previousData = canvas.__pieData || {};
    const labels = Array.from(new Set(Object.keys(previousData).concat(Object.keys(nextData))));
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.36;
    const fromValues = labels.map(function (label) { return Math.max(0, Number(previousData[label]) || 0); });
    const toValues = labels.map(function (label) { return Math.max(0, Number(nextData[label]) || 0); });

    function renderPie(values) {
      ctx.clearRect(0, 0, w, h);
      const entries = labels
        .map(function (label, index) { return [label, Math.max(0, values[index] || 0)]; })
        .filter(function (entry) { return entry[1] > 0.001; });
      const total = entries.reduce(function (sum, entry) { return sum + entry[1]; }, 0);

      if (!entries.length || total <= 0) {
        ctx.fillStyle = "#6f6f67";
        ctx.font = "14px Space Grotesk";
        ctx.textAlign = "center";
        ctx.fillText("No data", cx, cy);
        return;
      }

      let angle = -Math.PI / 2;
      entries.forEach(function (entry, index) {
        const value = entry[1];
        const slice = (value / total) * Math.PI * 2;
        const color = palette[index % palette.length];

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, angle, angle + slice);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        angle += slice;
      });

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.56, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();

      ctx.fillStyle = "#20201d";
      ctx.font = "600 18px 'IBM Plex Mono'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(Math.round(total)), cx, cy);
    }

    if (canvas.__pieFrame) {
      window.cancelAnimationFrame(canvas.__pieFrame);
      canvas.__pieFrame = null;
    }

    const duration = 420;
    const start = performance.now();
    function animate(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const values = fromValues.map(function (from, index) {
        return from + (toValues[index] - from) * eased;
      });
      renderPie(values);

      if (t < 1) {
        canvas.__pieFrame = window.requestAnimationFrame(animate);
      } else {
        canvas.__pieData = nextData;
        legendEl.innerHTML = Object.entries(nextData).map(function (entry, index) {
          const label = entry[0];
          const value = Number(entry[1]);
          const total = Object.values(nextData).reduce(function (sum, count) { return sum + Number(count); }, 0) || 1;
          const pct = Math.round((value / total) * 100);
          const color = palette[index % palette.length];
          return `<div class="chart-legend-item"><span class="chart-swatch" style="background:${color}"></span><span>${label}: ${value} (${pct}%)</span></div>`;
        }).join("");
      }
    }

    if (!Object.keys(nextData).length && !Object.keys(previousData).length) {
      renderPie([]);
      legendEl.innerHTML = "";
      return;
    }

    canvas.__pieFrame = window.requestAnimationFrame(animate);
  }

  function renderDepartmentOptions() {
    const departmentInput = document.getElementById("department");
    const filterDepartmentOptions = document.getElementById("filterDepartmentOptions");
    if (!departmentInput && !filterDepartmentOptions && !dashDepartment && !departmentAdminSelect && !departmentMoveTargetSelect) return;

    const sortedDepartments = Array.from(new Set(departmentList)).sort(function (a, b) { return a.localeCompare(b); });
    const optionsHtml = sortedDepartments.map(function (value) { return `<option value="${value}"></option>`; }).join("");
    if (filterDepartmentOptions) filterDepartmentOptions.innerHTML = optionsHtml;
    if (dashDepartment) {
      const currentValue = dashDepartment.value || "";
      dashDepartment.innerHTML = `<option value="">All departments</option>`
        + sortedDepartments.map(function (value) { return `<option value="${value}">${value}</option>`; }).join("");
      const hasValue = sortedDepartments.some(function (value) { return value === currentValue; });
      dashDepartment.value = hasValue ? currentValue : "";
    }
    if (departmentAdminSelect) {
      const currentAdminValue = departmentAdminSelect.value || "";
      departmentAdminSelect.innerHTML = `<option value="">Select department</option>`
        + sortedDepartments.map(function (value) { return `<option value="${value}">${value}</option>`; }).join("");
      const hasAdminValue = sortedDepartments.some(function (value) { return value === currentAdminValue; });
      departmentAdminSelect.value = hasAdminValue ? currentAdminValue : "";
    }
    if (departmentMoveTargetSelect) {
      const blocked = pendingDepartmentRemoval ? pendingDepartmentRemoval.department : "";
      const moveOptions = sortedDepartments.filter(function (value) { return value !== blocked; });
      departmentMoveTargetSelect.innerHTML = `<option value="">Select target department</option>`
        + moveOptions.map(function (value) { return `<option value="${value}">${value}</option>`; }).join("");
    }
    renderDepartmentComboList();
  }

  function renderDepartmentComboList(forceOpen) {
    const input = form && form.department ? form.department : null;
    if (!input || !departmentComboList) return;
    const query = String(input.value || "").trim().toLowerCase();
    const sortedDepartments = Array.from(new Set(departmentList)).sort(function (a, b) { return a.localeCompare(b); });
    const matches = query
      ? sortedDepartments.filter(function (value) { return value.toLowerCase().includes(query); })
      : sortedDepartments;

    departmentComboList.innerHTML = "";
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "helper";
      empty.style.padding = "10px";
      empty.textContent = "No matching departments.";
      departmentComboList.appendChild(empty);
    } else {
      matches.forEach(function (value) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "combo-item";
        item.textContent = value;
        item.addEventListener("click", function () {
          input.value = value;
          departmentComboOpen = false;
          departmentComboList.hidden = true;
        });
        departmentComboList.appendChild(item);
      });
    }

    if (forceOpen || departmentComboOpen) {
      departmentComboOpen = true;
      departmentComboList.hidden = false;
    } else {
      departmentComboList.hidden = true;
    }
  }

  function getVisibleAssets() {
    const query = searchInput.value.trim().toLowerCase();
    const statusFilter = filterPrimaryStatus.value;
    const deviceTypeFilter = filterDeviceType.value.trim().toLowerCase();
    const departmentFilter = filterDepartment.value.trim().toLowerCase();
    const lifecycleYearFilter = filterLifecycleYear.value.trim();
    const result = [];
    for (let i = 0; i < searchableAssets.length; i += 1) {
      const indexed = searchableAssets[i];
      const asset = assets[indexed.index];
      if (!asset) continue;

      const matchesQuery = !query
        || indexed.assetTagLower.includes(query)
        || indexed.assetNameLower.includes(query)
        || indexed.serialLower.includes(query)
        || indexed.assignedLower.includes(query);
      if (!matchesQuery) continue;

      if (statusFilter && asset.primaryStatus !== statusFilter) continue;
      if (deviceTypeFilter && !indexed.deviceTypeLower.includes(deviceTypeFilter)) continue;
      if (departmentFilter && indexed.departmentLower !== departmentFilter) continue;
      if (lifecycleYearFilter && indexed.lifecycleYear !== lifecycleYearFilter) continue;

      result.push(asset);
    }
    return result;
  }

  function renderPagination(totalItems) {
    if (!paginationControls) return;
    paginationControls.innerHTML = "";

    const safePageSize = Math.max(1, currentPageSize || 10);
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    if (totalItems <= 0 || totalPages <= 1) return;

    function addPageButton(label, page, isDisabled, isActive) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ghost" + (isActive ? " active" : "");
      button.textContent = label;
      button.disabled = !!isDisabled;
      button.addEventListener("click", function () {
        currentPage = page;
        renderTable();
      });
      paginationControls.appendChild(button);
    }

    addPageButton("Prev", Math.max(1, currentPage - 1), currentPage <= 1, false);

    const maxButtons = 7;
    const half = Math.floor(maxButtons / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);

    if (start > 1) {
      addPageButton("1", 1, false, currentPage === 1);
      if (start > 2) {
        const spacer = document.createElement("span");
        spacer.className = "helper";
        spacer.textContent = "...";
        paginationControls.appendChild(spacer);
      }
    }

    for (let page = start; page <= end; page += 1) {
      addPageButton(String(page), page, false, page === currentPage);
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        const spacer = document.createElement("span");
        spacer.className = "helper";
        spacer.textContent = "...";
        paginationControls.appendChild(spacer);
      }
      addPageButton(String(totalPages), totalPages, false, currentPage === totalPages);
    }

    addPageButton("Next", Math.min(totalPages, currentPage + 1), currentPage >= totalPages, false);
  }

  function renderTable() {
    assetRows.innerHTML = "";
    const visibleAssets = getVisibleAssets();
    const safePageSize = Math.max(1, currentPageSize || 10);
    const totalPages = Math.max(1, Math.ceil(visibleAssets.length / safePageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const startIndex = (currentPage - 1) * safePageSize;
    const pagedAssets = visibleAssets.slice(startIndex, startIndex + safePageSize);

    pagedAssets.forEach(function (asset) {
      const row = document.createElement("tr");
      row.className = "asset-row";
      row.innerHTML = `
        <td class="mono" data-col="assetTag"><button type="button" class="asset-link" data-view="${asset.assetTag}">${asset.assetTag}</button></td>
        <td data-col="assetName">${asset.assetName || "-"}</td>
        <td data-col="typeModel">${asset.deviceType || "-"} / ${asset.model || "-"}</td>
        <td data-col="assignedTo">${asset.assignedTo || "-"}</td>
        <td data-col="location">${asset.location || "-"}<br><span class="helper">${asset.roomNumber || "-"}</span></td>
        <td data-col="department">${asset.department || "-"}</td>
      <td data-col="primary">${badgeForPrimary(asset.primaryStatus)}${badgeForDeleteRequest(asset)}</td>
        <td data-col="notes">${asset.notes || "-"}</td>
        <td data-col="action">
          <button type="button" class="ghost" data-view="${asset.assetTag}">View</button>
        </td>
      `;
      assetRows.appendChild(row);
    });

    applyColumnVisibility();

    if (!assets.length) {
      emptyState.textContent = "No assets added yet.";
      emptyState.style.display = "block";
    } else if (!visibleAssets.length) {
      emptyState.textContent = "No matching assets found.";
      emptyState.style.display = "block";
    } else {
      emptyState.style.display = "none";
    }

    const hasActiveFilters = Boolean(
      searchInput.value.trim()
      || filterPrimaryStatus.value
      || filterDeviceType.value.trim()
      || filterDepartment.value
      || filterLifecycleYear.value.trim()
    );

  searchMeta.textContent = hasActiveFilters
    ? "Showing " + visibleAssets.length + " of " + assets.length + " assets. Page " + currentPage + " of " + totalPages + "."
    : "Showing all assets.";
  const pendingRequestsCount = assets.filter(function (item) { return !!item.pendingDelete; }).length;
  if (pendingRequestsCount > 0) {
    searchMeta.textContent += " Pending delete requests: " + pendingRequestsCount + ".";
  }

    renderStats(visibleAssets);
    renderPagination(visibleAssets.length);
    if (dashboardModal && !dashboardModal.hidden) renderReportingDashboard();
    if (deleteRequestsModal && !deleteRequestsModal.hidden) renderDeleteRequestsTable();
    renderDepartmentOptions();
  }

  function getVisibleColumnsForMode(mode) {
    if (mode === "minimal") {
      return new Set(["assetTag", "assignedTo", "typeModel"]);
    }

    if (mode === "full") {
      return new Set(["assetTag", "assetName", "typeModel", "assignedTo", "location", "department", "primary", "notes", "action"]);
    }

    return new Set(["assetTag", "assetName", "typeModel", "assignedTo", "location", "department", "primary", "action"]);
  }

  function applyColumnVisibility() {
    const allowed = getVisibleColumnsForMode(currentViewMode);
    const allCells = document.querySelectorAll("[data-col]");

    allCells.forEach(function (cell) {
      const col = cell.getAttribute("data-col");
      cell.hidden = !allowed.has(col);
    });
  }

  function resetForm() {
    form.reset();
    editingTag = null;
    submitBtn.textContent = "Save Asset";
    primaryStatus.value = PRIMARY_STATUS.INVENTORY;
  }

  function fillForm(asset) {
    form.assetName.value = asset.assetName || "";
    form.assetTag.value = asset.assetTag;
    form.serialNumber.value = asset.serialNumber || "";
    form.deviceType.value = asset.deviceType;
    form.model.value = asset.model;
    form.assignedTo.value = asset.assignedTo;
    form.location.value = asset.location;
    form.roomNumber.value = asset.roomNumber || "";
    form.department.value = asset.department || "";
    form.purchaseDate.value = asset.purchaseDate || "";
    form.lifecycleYear.value = asset.lifecycleYear || "";
    form.assetValue.value = asset.assetValue || "";
    form.primaryStatus.value = asset.primaryStatus;
    form.notes.value = asset.notes;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    const record = normalizeAssetRecord({
      assetName: form.assetName.value,
      assetTag: form.assetTag.value,
      serialNumber: form.serialNumber.value,
      deviceType: form.deviceType.value,
      model: form.model.value,
      assignedTo: form.assignedTo.value,
      location: form.location.value,
      roomNumber: form.roomNumber.value,
      department: form.department.value,
      purchaseDate: form.purchaseDate.value,
      lifecycleYear: form.lifecycleYear.value,
      assetValue: form.assetValue.value,
      primaryStatus: form.primaryStatus.value,
      notes: form.notes.value
    });

    const error = validateAsset(record);
    if (error) {
      showAppNotice("Validation Error", error);
      return;
    }
    const actionLabel = editingTag ? "Update Asset" : "Save Asset";
    showAppConfirm(
      actionLabel,
      "Confirm " + (editingTag ? "update" : "save") + " for asset " + (record.assetTag || "(no tag)") + "?",
      async function () {
        const existingIndex = getAssetIndexByTag(record.assetTag);
        const editingIndex = editingTag ? getAssetIndexByTag(editingTag) : -1;
        if (!editingTag && existingIndex >= 0) {
          showAppNotice("Duplicate Asset Tag", "Asset Tag already exists. Use Edit instead.");
          return;
        }
        if (editingTag && existingIndex >= 0 && existingIndex !== editingIndex) {
          showAppNotice("Duplicate Asset Tag", "Asset Tag already exists for another asset.");
          return;
        }

        if (supabaseClient) {
          const existingAsset = editingIndex >= 0 ? assets[editingIndex] : null;
          const duplicateCheck = await supabaseClient
            .from("assets")
            .select("id, asset_tag")
            .eq("asset_tag", record.assetTag)
            .limit(5);
          if (!duplicateCheck.error) {
            const duplicateRow = (duplicateCheck.data || []).find(function (row) {
              return !(existingAsset && Number(row.id) === Number(existingAsset.id));
            });
            if (duplicateRow) {
              showAppNotice("Duplicate Asset Tag", "Asset Tag already exists for another asset.");
              return;
            }
          }
          const payload = mapUiAssetToDb(record);
          let saveResult;
          if (existingAsset && existingAsset.id) {
            saveResult = await supabaseClient
              .from("assets")
              .update(payload)
              .eq("id", Number(existingAsset.id))
              .select("id,asset_tag");
          } else {
            if (!existingAsset) payload.created_by = currentUserId;
            saveResult = await supabaseClient
              .from("assets")
              .upsert(payload, { onConflict: "asset_tag" })
              .select("id,asset_tag");
          }
          if (saveResult.error) {
            showAppNotice("Save Error", saveResult.error.message || "Unable to save asset to Supabase.");
            return;
          }
          if (record.department) {
            await supabaseClient
              .from("departments")
              .upsert({ name: record.department, is_active: true }, { onConflict: "name" });
          }
          const savedRow = Array.isArray(saveResult.data) ? saveResult.data[0] : saveResult.data;
          const savedAssetId = savedRow && savedRow.id ? Number(savedRow.id) : (existingAsset && existingAsset.id ? Number(existingAsset.id) : null);
          if (existingAsset) {
            const changes = collectAssetChangeSummary(existingAsset, record);
            if (changes.length && savedAssetId) {
              await addAssetActivityEntry(savedAssetId, "Asset updated:\n" + changes.map(function (line) { return "- " + line; }).join("\n"));
            }
          } else if (savedAssetId) {
            await addAssetActivityEntry(savedAssetId, "Asset record created.");
          }
          await addAuditLog(existingAsset ? "UPDATE" : "CREATE", { assetTag: record.assetTag }, savedRow && savedRow.id ? Number(savedRow.id) : null);
          await syncDepartmentsFromSupabase();
          await refreshAssetsFromSupabase();
          resetForm();
          closeAssetPanel();
          return;
        }

        showAppNotice("Cloud Required", "Saving assets requires Supabase connection.");
      },
      editingTag ? "Update" : "Save",
      "Cancel"
    );
  });

  assetRows.addEventListener("click", function (event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const editTag = target.getAttribute("data-edit");
    const deleteTag = target.getAttribute("data-delete");
    const viewTag = target.getAttribute("data-view");

    if (viewTag) {
      const detailIndex = getAssetIndexByTag(viewTag);
      const detailAsset = detailIndex >= 0 ? assets[detailIndex] : null;
      if (detailAsset) openAssetDetails(detailAsset);
    }

    if (editTag) {
      startEditAsset(editTag);
    }

    if (deleteTag) {
      deleteAssetByTag(deleteTag);
    }
  });

  if (resetBtn) resetBtn.addEventListener("click", resetForm);
  if (openAssetPanelBtn) {
    openAssetPanelBtn.addEventListener("click", function () {
      resetForm();
      openAssetPanel();
    });
  }
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      if (auth && typeof auth.clearSession === "function") auth.clearSession();
      window.location.href = "./login.html";
    });
  }
  if (manageUsersBtn) manageUsersBtn.addEventListener("click", openUserAdminModal);
  if (openDeleteRequestsBtn) {
    openDeleteRequestsBtn.addEventListener("click", function () {
      const menu = openDeleteRequestsBtn.closest("details");
      if (menu) menu.open = false;
      openDeleteRequestsModal();
    });
  }
  if (closeDeleteRequestsBtn) closeDeleteRequestsBtn.addEventListener("click", closeDeleteRequestsModal);
  if (deleteRequestsOverlay) deleteRequestsOverlay.addEventListener("click", closeDeleteRequestsModal);
  if (deleteRequestsRows) {
    deleteRequestsRows.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const approveId = String(target.getAttribute("data-approve-delete-id") || "").trim();
      const denyId = String(target.getAttribute("data-deny-delete-id") || "").trim();
      if (approveId) {
        approveDeleteRequestByAssetId(Number(approveId));
        return;
      }
      if (denyId) {
        denyDeleteRequestByAssetId(Number(denyId));
      }
    });
  }
  if (openTrashBinBtn) {
    openTrashBinBtn.addEventListener("click", function () {
      const menu = openTrashBinBtn.closest("details");
      if (menu) menu.open = false;
      openTrashBinModal();
    });
  }
  if (closeTrashBinBtn) closeTrashBinBtn.addEventListener("click", closeTrashBinModal);
  if (trashBinRows) {
    trashBinRows.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const restoreId = String(target.getAttribute("data-restore-trash-id") || "").trim();
      const purgeId = String(target.getAttribute("data-purge-trash-id") || "").trim();
      if (restoreId) {
        restoreDeletedAssetByArchiveId(Number(restoreId));
        return;
      }
      if (purgeId) {
        purgeDeletedAssetByArchiveId(Number(purgeId));
      }
    });
  }
  if (trashBinOverlay) trashBinOverlay.addEventListener("click", closeTrashBinModal);
  if (closeUserAdminBtn) closeUserAdminBtn.addEventListener("click", closeUserAdminModal);
  if (userAdminOverlay) userAdminOverlay.addEventListener("click", closeUserAdminModal);
  if (createAgentBtn) {
    createAgentBtn.addEventListener("click", async function () {
      if (!auth || typeof auth.createAgentAccount !== "function") return;
      const username = newAgentUsername ? newAgentUsername.value : "";
      const password = newAgentPassword ? newAgentPassword.value : "";
      const role = newUserRole ? String(newUserRole.value || "AGENT").trim().toUpperCase() : "AGENT";
      let result;
      try {
        result = await auth.createAgentAccount(currentUser, username, password, role);
      } catch (_error) {
        showAppNotice("User Creation", "Secure account creation is unavailable in this browser.");
        return;
      }
      if (!result.ok) {
        showAppNotice("User Creation", result.message || "Unable to create account.");
        return;
      }
      await renderUserAdminTable();
      if (newAgentUsername) newAgentUsername.value = "";
      if (newAgentPassword) newAgentPassword.value = "";
      if (newUserRole) newUserRole.value = "AGENT";
      const loginEmail = result.loginEmail ? (" Login email: " + result.loginEmail) : "";
      showAppNotice("User Created", "User account created as " + role + "." + loginEmail);
    });
  }
  if (userAdminRows) {
    userAdminRows.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const userId = String(target.getAttribute("data-reset-user-id") || "").trim();
      const username = String(target.getAttribute("data-reset-username") || "").trim();
      if (!userId) return;
      if (resetTargetUserId) resetTargetUserId.value = userId;
      if (resetTargetLabel) resetTargetLabel.value = username || userId;
      if (resetAccountPasswordBtn) resetAccountPasswordBtn.disabled = false;
      if (resetAccountPassword) resetAccountPassword.focus();
    });
  }
  if (resetAccountPasswordBtn) {
    resetAccountPasswordBtn.addEventListener("click", function () {
      if (!auth || typeof auth.resetAccountPassword !== "function") return;
      const targetUserId = resetTargetUserId ? String(resetTargetUserId.value || "").trim() : "";
      const targetLabel = resetTargetLabel ? String(resetTargetLabel.value || "").trim() : "";
      const password = resetAccountPassword ? String(resetAccountPassword.value || "") : "";
      if (!targetUserId || !targetLabel) {
        showAppNotice("Password Reset", "Select an account first.");
        return;
      }
      if (!password) {
        showAppNotice("Password Reset", "Enter a new password.");
        return;
      }
      showAppConfirm(
        "Reset Password",
        "Reset password for " + targetLabel + "?",
        async function () {
          const result = await auth.resetAccountPassword(currentUser, targetUserId, password);
          if (!result.ok) {
            showAppNotice("Password Reset", result.message || "Unable to reset password.");
            return;
          }
          if (resetAccountPassword) resetAccountPassword.value = "";
          showAppNotice("Password Reset", "Password updated successfully.");
        },
        "Reset Password",
        "Cancel"
      );
    });
  }
  if (refreshDataBtn) {
    refreshDataBtn.addEventListener("click", async function () {
      if (supabaseClient) {
        await refreshAssetsFromSupabase();
        currentPage = 1;
        renderTable();
        if (dashboardModal && !dashboardModal.hidden) renderReportingDashboard();
        if (deleteRequestsModal && !deleteRequestsModal.hidden) renderDeleteRequestsTable();
        if (trashBinModal && !trashBinModal.hidden) renderTrashBinTable();
        showAppNotice("Data Refreshed", "Asset data was refreshed from Supabase.");
        return;
      }
      showAppNotice("Cloud Required", "Refresh requires Supabase connection.");
    });
  }
  if (closeAssetPanelBtn) closeAssetPanelBtn.addEventListener("click", closeAssetPanel);
  if (panelOverlay) panelOverlay.addEventListener("click", closeAssetPanel);
  if (openDashboardBtn) openDashboardBtn.addEventListener("click", openDashboardModal);
  if (closeDashboardBtn) closeDashboardBtn.addEventListener("click", closeDashboardModal);
  if (dashboardOverlay) dashboardOverlay.addEventListener("click", closeDashboardModal);
  if (closeAssetDetailsBtn) closeAssetDetailsBtn.addEventListener("click", closeAssetDetails);
  if (detailsOverlay) detailsOverlay.addEventListener("click", closeAssetDetails);
  if (appDialogOverlay) appDialogOverlay.addEventListener("click", closeAppDialog);
  if (appDialogCancelBtn) appDialogCancelBtn.addEventListener("click", closeAppDialog);
  if (editFromDetailsBtn) {
    editFromDetailsBtn.addEventListener("click", function () {
      const tag = assetDetailsModal ? assetDetailsModal.getAttribute("data-asset-tag") || "" : "";
      if (tag) startEditAsset(tag);
    });
  }
  if (deleteFromDetailsBtn) {
    deleteFromDetailsBtn.addEventListener("click", function () {
      const tag = assetDetailsModal ? assetDetailsModal.getAttribute("data-asset-tag") || "" : "";
      if (tag) deleteAssetByTag(tag);
    });
  }
  if (addAssetCommentBtn) addAssetCommentBtn.addEventListener("click", postCommentForCurrentAsset);
  if (assetCommentTimeline) {
    assetCommentTimeline.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const index = target.getAttribute("data-comment-index");
      if (index !== null && target.classList.contains("comment-delete-btn")) {
        deleteCommentForCurrentAsset(index);
      }
    });
  }
  if (assetCommentInput) {
    assetCommentInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        postCommentForCurrentAsset();
      }
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      if (actionsMenu && actionsMenu.open) actionsMenu.open = false;
      closeAppDialog();
      closeUserAdminModal();
      closeDepartmentAdminModal();
      closeAssetDetails();
      closeAssetPanel();
      closeDashboardModal();
      closeDeleteRequestsModal();
      closeTrashBinModal();
      closeFileOpsDialog();
    }
  });

  window.addEventListener("resize", function () {
    if (dashboardModal && !dashboardModal.hidden) renderReportingDashboard();
  });

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      searchInputTouchedByUser = true;
      if (searchInputDebounceTimer) window.clearTimeout(searchInputDebounceTimer);
      searchInputDebounceTimer = window.setTimeout(function () {
        currentPage = 1;
        renderTable();
        searchInputDebounceTimer = null;
      }, 120);
    });
    searchInput.addEventListener("focus", function () {
      searchInputTouchedByUser = true;
    });
  }
  if (filterPrimaryStatus) filterPrimaryStatus.addEventListener("change", function () { currentPage = 1; renderTable(); });
  if (filterDeviceType) filterDeviceType.addEventListener("input", function () { currentPage = 1; renderTable(); });
  if (filterDepartment) filterDepartment.addEventListener("input", function () { currentPage = 1; renderTable(); });
  if (filterLifecycleYear) filterLifecycleYear.addEventListener("input", function () { currentPage = 1; renderTable(); });
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", function () {
      const nextSize = Number(pageSizeSelect.value || 10);
      currentPageSize = Number.isFinite(nextSize) && nextSize > 0 ? nextSize : 10;
      currentPage = 1;
      renderTable();
    });
  }
  if (viewModeSelect) {
    viewModeSelect.addEventListener("change", function () {
      currentViewMode = viewModeSelect.value || "standard";
      applyColumnVisibility();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", function () {
      searchInput.value = "";
      currentPage = 1;
      renderTable();
      searchInput.focus();
    });
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", function () {
      filterPrimaryStatus.value = "";
      filterDeviceType.value = "";
      filterDepartment.value = "";
      filterLifecycleYear.value = "";
      currentPage = 1;
      renderTable();
    });
  }

  if (dashDepartment) dashDepartment.addEventListener("change", renderReportingDashboard);
  if (dashStatus) dashStatus.addEventListener("change", renderReportingDashboard);
  if (dashYear) dashYear.addEventListener("input", renderReportingDashboard);
  if (clearDashFiltersBtn) {
    clearDashFiltersBtn.addEventListener("click", function () {
      dashDepartment.value = "";
      dashStatus.value = "";
      dashYear.value = "";
      renderReportingDashboard();
    });
  }

  if (manageDepartmentsBtn) {
    manageDepartmentsBtn.addEventListener("click", function () {
      const menu = manageDepartmentsBtn.closest("details");
      if (menu) menu.open = false;
      openDepartmentAdminModal();
    });
  }
  if (importExportBtn) {
    importExportBtn.addEventListener("click", function () {
      const menu = importExportBtn.closest("details");
      if (menu) menu.open = false;
      openFileOpsDialog();
    });
  }
  if (fileOpsCloseBtn) fileOpsCloseBtn.addEventListener("click", closeFileOpsDialog);
  if (fileOpsOverlay) fileOpsOverlay.addEventListener("click", closeFileOpsDialog);
  if (fileOpsImportBtn) {
    fileOpsImportBtn.addEventListener("click", function () {
      if (!isManagerOrSupervisor()) {
        showAppNotice("Permission", "Only Manager and Supervisor can import CSV.");
        return;
      }
      closeFileOpsDialog();
      if (csvInput) csvInput.click();
    });
  }
  if (fileOpsExportBtn) {
    fileOpsExportBtn.addEventListener("click", function () {
      exportVisibleAssetsToCsv();
      closeFileOpsDialog();
      showAppNotice("Export Ready", "Filtered assets were exported to CSV.");
    });
  }
  if (closeDepartmentAdminBtn) closeDepartmentAdminBtn.addEventListener("click", closeDepartmentAdminModal);
  if (departmentAdminOverlay) departmentAdminOverlay.addEventListener("click", closeDepartmentAdminModal);

  if (departmentAdminAddBtn) {
    departmentAdminAddBtn.addEventListener("click", async function () {
      const value = departmentAdminInput ? departmentAdminInput.value : "";
      const name = normalizeDepartmentName(value);
      if (!name) {
        showAppNotice("Department", "Department already exists or is empty.");
        return;
      }
      if (!supabaseClient) {
        showAppNotice("Cloud Required", "Department changes require Supabase connection.");
        return;
      }
      const result = await supabaseClient
        .from("departments")
        .upsert({ name: name, is_active: true }, { onConflict: "name" });
      if (result.error) {
        showAppNotice("Department", result.error.message || "Unable to add department.");
        return;
      }
      if (departmentAdminInput) departmentAdminInput.value = "";
      await syncDepartmentsFromSupabase();
      showAppNotice("Department Added", "Department was added successfully.");
    });
  }

  if (departmentAdminRemoveBtn) {
    departmentAdminRemoveBtn.addEventListener("click", async function () {
      const department = departmentAdminSelect ? String(departmentAdminSelect.value || "").trim() : "";
      if (!department) {
        showAppNotice("Department", "Select a department to remove.");
        return;
      }

      const assetIndexes = [];
      assets.forEach(function (asset, index) {
        if (String(asset.department || "").trim().toLowerCase() === department.toLowerCase()) {
          assetIndexes.push(index);
        }
      });

      if (!assetIndexes.length) {
        showAppConfirm(
          "Remove Department",
          "No assets are assigned to " + department + ". Remove it from the department list?",
          async function () {
            if (!supabaseClient) {
              showAppNotice("Cloud Required", "Department changes require Supabase connection.");
              return;
            }
            const result = await supabaseClient.from("departments").delete().eq("name", department);
            if (result.error) {
              showAppNotice("Department", result.error.message || "Unable to remove department.");
              return;
            }
            await addAuditLog("DEPARTMENT_REMOVE", { department: department, action: "direct" }, null);
            removeDepartmentFromList(department);
            if (form.department && String(form.department.value || "").toLowerCase() === department.toLowerCase()) form.department.value = "";
            if (filterDepartment && String(filterDepartment.value || "").toLowerCase() === department.toLowerCase()) filterDepartment.value = "";
            if (dashDepartment && String(dashDepartment.value || "").toLowerCase() === department.toLowerCase()) dashDepartment.value = "";
            await syncDepartmentsFromSupabase();
            showAppNotice("Department Removed", "Department removed successfully.");
          },
          "Remove",
          "Cancel"
        );
        return;
      }

      pendingDepartmentRemoval = { department: department, assetIndexes: assetIndexes };
      if (departmentImpactText) {
        departmentImpactText.textContent = assetIndexes.length + " asset(s) are assigned to " + department + ". Move assets to another department or delete department anyway.";
      }
      if (departmentImpactPanel) departmentImpactPanel.hidden = false;
      renderDepartmentOptions();
    });
  }

  if (departmentMoveConfirmBtn) {
    departmentMoveConfirmBtn.addEventListener("click", function () {
      applyDepartmentRemoval("move");
    });
  }
  if (departmentDeleteAnywayBtn) {
    departmentDeleteAnywayBtn.addEventListener("click", function () {
      showAppConfirm(
        "Delete Department Anyway",
        "Assets assigned to this department will be set to Unassigned. Continue?",
        function () { applyDepartmentRemoval("unassign"); },
        "Delete Anyway",
        "Cancel"
      );
    });
  }
  if (departmentImpactCancelBtn) {
    departmentImpactCancelBtn.addEventListener("click", resetDepartmentImpactPanel);
  }
  if (departmentComboBtn) {
    departmentComboBtn.addEventListener("click", function () {
      departmentComboOpen = !departmentComboOpen;
      renderDepartmentComboList(departmentComboOpen);
    });
  }
  if (form && form.department) {
    form.department.addEventListener("focus", function () {
      departmentComboOpen = true;
      renderDepartmentComboList(true);
    });
    form.department.addEventListener("input", function () {
      departmentComboOpen = true;
      renderDepartmentComboList(true);
    });
  }
  document.addEventListener("click", function (event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (actionsMenu && actionsMenu.open && !actionsMenu.contains(target)) {
      actionsMenu.open = false;
    }
    if (!departmentCombo || !departmentComboList) return;
    if (!departmentCombo.contains(target)) {
      departmentComboOpen = false;
      departmentComboList.hidden = true;
    }
  });

  if (csvInput) {
    csvInput.addEventListener("change", function (event) {
      if (!isManagerOrSupervisor()) {
        showAppNotice("Permission", "Only Manager and Supervisor can import CSV.");
        csvInput.value = "";
        return;
      }
      const inputTarget = event.target;
      if (!(inputTarget instanceof HTMLInputElement)) return;

      const file = inputTarget.files && inputTarget.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function () {
        const result = parseAssetCsv(String(reader.result || ""));
        if (result.fatalError) {
          showAppNotice("CSV Validation", result.fatalError);
          csvInput.value = "";
          return;
        }

        const existingTags = new Set(assets.map(function (item) { return item.assetTag; }));
        let projectedImported = 0;
        let projectedUpdated = 0;
        result.records.forEach(function (record) {
          if (existingTags.has(record.assetTag)) {
            projectedUpdated += 1;
          } else {
            projectedImported += 1;
            existingTags.add(record.assetTag);
          }
        });

        showAppConfirm(
          "Import CSV",
          "Proceed with import?\n\nNew: " + projectedImported + "\nUpdates: " + projectedUpdated + "\nSkipped: " + result.errors.length,
          async function () {
            let imported = 0;
            let updated = 0;

            if (supabaseClient) {
              const payload = result.records.map(function (record) {
                const data = mapUiAssetToDb(record);
                data.created_by = currentUserId;
                return data;
              });
              const upsertResult = await supabaseClient
                .from("assets")
                .upsert(payload, { onConflict: "asset_tag" })
                .select("id,asset_tag");
              if (upsertResult.error) {
                showAppNotice("CSV Import Error", upsertResult.error.message || "Unable to import CSV into Supabase.");
                csvInput.value = "";
                return;
              }
              const returned = Array.isArray(upsertResult.data) ? upsertResult.data : [];
              const existingTagsSet = new Set(assets.map(function (item) { return item.assetTag; }));
              returned.forEach(function (row) {
                if (existingTagsSet.has(String(row.asset_tag || ""))) updated += 1;
                else imported += 1;
              });
              const departmentsToUpsert = Array.from(new Set(result.records
                .map(function (item) { return String(item.department || "").trim(); })
                .filter(Boolean)));
              if (departmentsToUpsert.length) {
                await supabaseClient
                  .from("departments")
                  .upsert(departmentsToUpsert.map(function (name) { return { name: name, is_active: true }; }), { onConflict: "name" });
              }
              await addAuditLog("CSV_IMPORT", { imported: imported, updated: updated, skipped: result.errors.length }, null);
              await syncDepartmentsFromSupabase();
              await refreshAssetsFromSupabase();
              let supaMessage = "CSV import complete. Added: " + imported + ", Updated: " + updated + ".";
              if (result.errors.length) {
                supaMessage += " Skipped: " + result.errors.length + ".\n\n" + result.errors.slice(0, 10).join("\n");
                if (result.errors.length > 10) supaMessage += "\n...more rows skipped.";
              }
              showAppNotice("CSV Import Complete", supaMessage);
              csvInput.value = "";
              return;
            }

            showAppNotice("Cloud Required", "CSV import requires Supabase connection.");
            csvInput.value = "";
          },
          "Import",
          "Cancel"
        );
      };

      reader.onerror = function () {
        showAppNotice("CSV Error", "Unable to read CSV file.");
        csvInput.value = "";
      };

      reader.readAsText(file);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      showAppConfirm(
        "Clear All Records",
        "Clear all asset records?\nThis action cannot be undone.",
        async function () {
          if (supabaseClient) {
            const deleteResult = await supabaseClient
              .from("assets")
              .delete()
              .neq("id", 0);
            if (deleteResult.error) {
              showAppNotice("Clear Error", deleteResult.error.message || "Unable to clear Supabase assets.");
              return;
            }
            await addAuditLog("CLEAR_ALL", {}, null);
            await refreshAssetsFromSupabase();
            resetForm();
            return;
          }
          showAppNotice("Cloud Required", "Clear all requires Supabase connection.");
        },
        "Clear All",
        "Cancel"
      );
    });
  }

  if (pageSizeSelect) {
    const initialSize = Number(pageSizeSelect.value || 10);
    currentPageSize = Number.isFinite(initialSize) && initialSize > 0 ? initialSize : 10;
  }
  renderCurrentUserState();
  enforceSearchInputClearOnLoad();
  window.addEventListener("pageshow", function () {
    enforceSearchInputClearOnLoad();
  });
  rebuildAssetIndexes();
  renderTable();
  if (supabaseClient) {
    syncDepartmentsFromSupabase();
    refreshAssetsFromSupabase();
  }
})();
  function clearSearchInputHard() {
    if (!searchInput) return;
    if (searchInputTouchedByUser) return;
    if (String(searchInput.value || "") !== "") {
      searchInput.value = "";
      currentPage = 1;
      renderTable();
    }
  }

  function enforceSearchInputClearOnLoad() {
    if (!searchInput) return;
    searchInputTouchedByUser = false;
    clearSearchInputHard();
    // Browsers can autofill after initial paint; keep clearing briefly.
    const delays = [40, 120, 260, 500, 900, 1400, 2200];
    delays.forEach(function (delay) {
      window.setTimeout(clearSearchInputHard, delay);
    });
  }
