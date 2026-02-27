import { DISPOSITION, PRIMARY_STATUS } from "./constants.js";
import { parseAssetCsv } from "./csv.js";
import { AssetDatabase } from "./database.js";
import { normalizeAssetRecord } from "./normalizers.js";
import { validateAsset } from "./validation.js";

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
const importCsvBtn = document.getElementById("importCsvBtn");
const refreshDataBtn = document.getElementById("refreshDataBtn");
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
const disposition = document.getElementById("disposition");
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
const filterDisposition = document.getElementById("filterDisposition");
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
const manageDepartmentInput = document.getElementById("manageDepartmentInput");
const addDepartmentBtn = document.getElementById("addDepartmentBtn");
const removeDepartmentBtn = document.getElementById("removeDepartmentBtn");

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
const detailDisposition = document.getElementById("detailDisposition");
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

const db = new AssetDatabase();
let editingTag = null;
let assets = db.getAll();
let panelCloseTimer = null;
let dashboardCloseTimer = null;
let currentViewMode = "standard";
let currentPage = 1;
let currentPageSize = 10;
const DEFAULT_DEPARTMENTS = ["Finance", "IT", "Office Of President", "HR", "Culinary"];
const DEPARTMENT_STORAGE_KEY = "it_asset_departments_v1";
let departmentList = loadDepartmentList();
let departmentComboOpen = false;

function loadDepartmentList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEPARTMENT_STORAGE_KEY) || "[]");
    const list = Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
    return list.length ? list : [...DEFAULT_DEPARTMENTS];
  } catch {
    return [...DEFAULT_DEPARTMENTS];
  }
}

function saveDepartmentList() {
  localStorage.setItem(DEPARTMENT_STORAGE_KEY, JSON.stringify(departmentList));
}

function normalizeDepartmentName(value) {
  return String(value || "").trim();
}

function addDepartmentToList(value) {
  const name = normalizeDepartmentName(value);
  if (!name) return false;
  const exists = departmentList.some((item) => item.toLowerCase() === name.toLowerCase());
  if (exists) return false;
  departmentList.push(name);
  departmentList.sort((a, b) => a.localeCompare(b));
  saveDepartmentList();
  renderDepartmentOptions();
  return true;
}

function removeDepartmentFromList(value) {
  const name = normalizeDepartmentName(value);
  if (!name) return false;
  const next = departmentList.filter((item) => item.toLowerCase() !== name.toLowerCase());
  if (next.length === departmentList.length) return false;
  departmentList = next;
  saveDepartmentList();
  renderDepartmentOptions();
  return true;
}

function syncBodyScrollLock() {
  const panelVisible = panelOverlay && !panelOverlay.hidden;
  const detailsVisible = detailsOverlay && !detailsOverlay.hidden;
  const dashboardVisible = dashboardOverlay && !dashboardOverlay.hidden;
  const dialogVisible = appDialogOverlay && !appDialogOverlay.hidden;
  document.body.classList.toggle("no-scroll", panelVisible || detailsVisible || dashboardVisible || dialogVisible);
}

function closeAppDialog() {
  if (!appDialog || !appDialogOverlay) return;
  appDialog.hidden = true;
  appDialog.setAttribute("aria-hidden", "true");
  appDialogOverlay.hidden = true;
  if (appDialogConfirmBtn) appDialogConfirmBtn.onclick = null;
  if (appDialogCancelBtn) {
    appDialogCancelBtn.onclick = null;
    appDialogCancelBtn.hidden = false;
  }
  syncBodyScrollLock();
}

function showAppConfirm(title, message, onConfirm, confirmLabel = "Confirm", cancelLabel = "Cancel") {
  if (!appDialog || !appDialogOverlay || !appDialogTitle || !appDialogMessage || !appDialogConfirmBtn || !appDialogCancelBtn) {
    if (confirm(message)) onConfirm();
    return;
  }
  appDialogTitle.textContent = title || "Confirm Action";
  appDialogMessage.textContent = message || "";
  appDialogConfirmBtn.textContent = confirmLabel;
  appDialogCancelBtn.textContent = cancelLabel;
  appDialog.hidden = false;
  appDialog.setAttribute("aria-hidden", "false");
  appDialogOverlay.hidden = false;
  appDialogConfirmBtn.onclick = () => {
    closeAppDialog();
    onConfirm();
  };
  appDialogCancelBtn.onclick = () => {
    closeAppDialog();
  };
  syncBodyScrollLock();
}

function showAppNotice(title, message) {
  showAppConfirm(title, message, () => {}, "OK", "Close");
  if (appDialogCancelBtn) appDialogCancelBtn.hidden = true;
  if (appDialogConfirmBtn) {
    appDialogConfirmBtn.onclick = () => {
      if (appDialogCancelBtn) appDialogCancelBtn.hidden = false;
      closeAppDialog();
    };
  }
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
  window.requestAnimationFrame(() => {
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
  dashboardCloseTimer = window.setTimeout(() => {
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
  panelOverlay.classList.add("is-visible");
  syncBodyScrollLock();
}

function closeAssetPanel() {
  if (!form || !panelOverlay) return;
  form.classList.remove("is-open");
  form.style.transform = "";
  form.setAttribute("aria-hidden", "true");
  panelOverlay.classList.remove("is-visible");
  panelOverlay.hidden = true;
  syncBodyScrollLock();
  panelCloseTimer = window.setTimeout(() => {
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

function renderCommentTimeline(asset) {
  if (!assetCommentTimeline || !assetCommentMeta) return;
  const comments = Array.isArray(asset?.commentHistory) ? [...asset.commentHistory] : [];
  comments.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (!comments.length) {
    assetCommentMeta.textContent = "No activity notes yet.";
    assetCommentTimeline.innerHTML = "";
    return;
  }

  assetCommentMeta.textContent = `${comments.length} activity note${comments.length === 1 ? "" : "s"}.`;
  assetCommentTimeline.innerHTML = "";
  comments.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "comment-item";
    const time = document.createElement("time");
    time.textContent = formatCommentTimestamp(item.timestamp);
    const text = document.createElement("p");
    text.textContent = item.text;
    wrapper.appendChild(time);
    wrapper.appendChild(text);
    assetCommentTimeline.appendChild(wrapper);
  });
}

function postCommentForCurrentAsset() {
  if (!assetDetailsModal || !assetCommentInput) return;
  const tag = assetDetailsModal.getAttribute("data-asset-tag") || "";
  if (!tag) return;

  const text = String(assetCommentInput.value || "").trim();
  if (!text) return;

  const index = assets.findIndex((item) => item.assetTag === tag);
  if (index < 0) return;

  const current = assets[index];
  const history = Array.isArray(current.commentHistory) ? [...current.commentHistory] : [];
  history.unshift({
    text,
    timestamp: new Date().toISOString()
  });

  assets[index] = normalizeAssetRecord({ ...current, commentHistory: history });
  db.saveAll(assets);
  assetCommentInput.value = "";
  renderCommentTimeline(assets[index]);
  renderTable();
}

function openAssetDetails(asset) {
  if (!assetDetailsModal || !detailsOverlay) return;
  assetDetailsModal.setAttribute("data-asset-tag", asset.assetTag || "");

  detailAssetTag.textContent = asset.assetTag || "-";
  detailAssetName.textContent = asset.assetName || "-";
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
  detailPrimary.textContent = asset.primaryStatus || "-";
  detailDisposition.textContent = asset.disposition || "-";
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
  const asset = assets.find((item) => item.assetTag === tag);
  if (!asset) return;

  editingTag = tag;
  fillForm(asset);
  submitBtn.textContent = "Update Asset";
  closeAssetDetails();
  openAssetPanel();
}

function deleteAssetByTag(tag) {
  if (!tag) return;
  showAppConfirm(
    "Delete Asset",
    `Delete asset ${tag}?\nThis action cannot be undone.`,
    () => {
      assets = db.deleteByTag(assets, tag);
      if (editingTag === tag) resetForm();
      closeAssetDetails();
      renderTable();
    },
    "Delete",
    "Cancel"
  );
}

function badgeForPrimary(status) {
  if (status === PRIMARY_STATUS.INVENTORY) return '<span class="pill inv">Inventory</span>';
  if (status === PRIMARY_STATUS.IN_USE) return '<span class="pill use">In-Use</span>';
  return '<span class="pill sur">Surplused</span>';
}

function badgeForDisposition(value) {
  if (value === DISPOSITION.RECYCLED) return '<span class="pill rec">Recycled</span>';
  if (value === DISPOSITION.DEFERRED) return '<span class="pill def">Deferred</span>';
  return '<span class="pill na">N/A</span>';
}

function updateDispositionRule() {
  const dispositionOptions = Array.from(disposition.options || []);
  const isSurplused = primaryStatus.value === PRIMARY_STATUS.SURPLUSED;

  dispositionOptions.forEach((option) => {
    if (option.value !== DISPOSITION.NA) {
      option.disabled = !isSurplused;
    }
  });

  if (primaryStatus.value === PRIMARY_STATUS.SURPLUSED) {
    if (disposition.value === DISPOSITION.NA) disposition.value = DISPOSITION.RECYCLED;
  } else {
    disposition.value = DISPOSITION.NA;
  }
}

function renderStats(sourceAssets = assets) {
  totalCount.textContent = sourceAssets.length;
  inventoryCount.textContent = sourceAssets.filter((item) => item.primaryStatus === PRIMARY_STATUS.INVENTORY).length;
  inUseCount.textContent = sourceAssets.filter((item) => item.primaryStatus === PRIMARY_STATUS.IN_USE).length;
  deferredCount.textContent = sourceAssets.filter((item) => item.disposition === DISPOSITION.DEFERRED).length;
}

function getLifecycleYearValue(asset) {
  const year = Number(String(asset.lifecycleYear || "").trim());
  return Number.isFinite(year) && year >= 1900 ? year : null;
}

function isComputerAsset(asset) {
  const text = `${asset.deviceType || ""} ${asset.model || ""} ${asset.assetName || ""}`.toLowerCase();
  return ["computer", "laptop", "desktop", "workstation"].some((keyword) => text.includes(keyword));
}

function getDashboardVisibleAssets() {
  const department = dashDepartment ? String(dashDepartment.value || "").trim().toLowerCase() : "";
  const status = dashStatus ? String(dashStatus.value || "").trim() : "";
  const year = dashYear ? String(dashYear.value || "").trim() : "";

  return assets.filter((asset) => {
    const matchDept = !department || String(asset.department || "").trim().toLowerCase() === department;
    const matchStatus = !status || String(asset.primaryStatus || "") === status;
    const matchYear = !year || String(asset.lifecycleYear || "") === year;
    return matchDept && matchStatus && matchYear;
  });
}

function renderReportingDashboard() {
  const sourceAssets = getDashboardVisibleAssets();
  if (!repComputersPast || !repAssetsPast || !repDueThisYear || !repDueNextYear || !repDeptRows || !repBucketRows) return;

  const currentYear = new Date().getFullYear();
  const assetsWithYear = sourceAssets.filter((asset) => getLifecycleYearValue(asset) !== null);

  const past = assetsWithYear.filter((asset) => getLifecycleYearValue(asset) < currentYear);
  const dueThis = assetsWithYear.filter((asset) => getLifecycleYearValue(asset) === currentYear);
  const dueNext = assetsWithYear.filter((asset) => getLifecycleYearValue(asset) === currentYear + 1);
  const computersPast = past.filter((asset) => isComputerAsset(asset));

  repComputersPast.textContent = String(computersPast.length);
  repAssetsPast.textContent = String(past.length);
  repDueThisYear.textContent = String(dueThis.length);
  repDueNextYear.textContent = String(dueNext.length);
  if (dashMeta) dashMeta.textContent = `Showing ${sourceAssets.length} of ${assets.length} assets in dashboard.`;

  const byDepartment = new Map();
  sourceAssets.forEach((asset) => {
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
    .sort((a, b) => (b[1].past + b[1].thisYear + b[1].nextYear) - (a[1].past + a[1].thisYear + a[1].nextYear))
    .slice(0, 12)
    .map(([dept, stats]) => `
      <tr>
        <td>${dept}</td>
        <td>${stats.past}</td>
        <td>${stats.thisYear}</td>
        <td>${stats.nextYear}</td>
      </tr>
    `)
    .join("");
  repDeptRows.innerHTML = deptRows || `<tr><td colspan="4">No data for selected filters.</td></tr>`;

  const buckets = {
    "Past Due": past.length,
    "This Year": dueThis.length,
    "Next Year": dueNext.length,
    "Future (2+ Years)": assetsWithYear.filter((asset) => getLifecycleYearValue(asset) > currentYear + 1).length,
    "No Lifecycle Year": sourceAssets.filter((asset) => getLifecycleYearValue(asset) === null).length
  };

  repBucketRows.innerHTML = Object.entries(buckets)
    .map(([label, count]) => `<tr><td>${label}</td><td>${count}</td></tr>`)
    .join("");

  const statusData = {
    "Inventory": sourceAssets.filter((asset) => asset.primaryStatus === PRIMARY_STATUS.INVENTORY).length,
    "In-Use": sourceAssets.filter((asset) => asset.primaryStatus === PRIMARY_STATUS.IN_USE).length,
    "Surplused": sourceAssets.filter((asset) => asset.primaryStatus === PRIMARY_STATUS.SURPLUSED).length
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
  Object.entries(dataMap).forEach(([label, value]) => {
    const numeric = Math.max(0, Number(value) || 0);
    if (numeric > 0) nextData[label] = numeric;
  });
  const previousData = canvas.__pieData || {};
  const labels = Array.from(new Set([...Object.keys(previousData), ...Object.keys(nextData)]));
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.36;
  const fromValues = labels.map((label) => Math.max(0, Number(previousData[label]) || 0));
  const toValues = labels.map((label) => Math.max(0, Number(nextData[label]) || 0));

  function renderPie(values) {
    ctx.clearRect(0, 0, w, h);
    const entries = labels
      .map((label, index) => [label, Math.max(0, values[index] || 0)])
      .filter(([, value]) => value > 0.001);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);

    if (!entries.length || total <= 0) {
      ctx.fillStyle = "#6f6f67";
      ctx.font = "14px Space Grotesk";
      ctx.textAlign = "center";
      ctx.fillText("No data", cx, cy);
      return;
    }

    let angle = -Math.PI / 2;
    entries.forEach(([, value], index) => {
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
    const eased = 1 - (1 - t) ** 3;
    const values = fromValues.map((from, index) => from + (toValues[index] - from) * eased);
    renderPie(values);

    if (t < 1) {
      canvas.__pieFrame = window.requestAnimationFrame(animate);
    } else {
      canvas.__pieData = nextData;
      const finalTotal = Object.values(nextData).reduce((sum, count) => sum + Number(count), 0) || 1;
      legendEl.innerHTML = Object.entries(nextData).map(([label, value], index) => {
        const pct = Math.round((Number(value) / finalTotal) * 100);
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
  if (!departmentInput && !filterDepartmentOptions && !dashDepartment) return;

  const sortedDepartments = Array.from(new Set(departmentList)).sort((a, b) => a.localeCompare(b));
  const optionsHtml = sortedDepartments.map((value) => `<option value="${value}"></option>`).join("");
  if (filterDepartmentOptions) filterDepartmentOptions.innerHTML = optionsHtml;
  if (dashDepartment) {
    const currentValue = dashDepartment.value || "";
    dashDepartment.innerHTML = `<option value="">All departments</option>${
      sortedDepartments.map((value) => `<option value="${value}">${value}</option>`).join("")
    }`;
    const hasValue = sortedDepartments.some((value) => value === currentValue);
    dashDepartment.value = hasValue ? currentValue : "";
  }
  renderDepartmentComboList();
}

function renderDepartmentComboList(forceOpen = false) {
  const input = form?.department;
  if (!input || !departmentComboList) return;
  const query = String(input.value || "").trim().toLowerCase();
  const sortedDepartments = Array.from(new Set(departmentList)).sort((a, b) => a.localeCompare(b));
  const matches = query
    ? sortedDepartments.filter((value) => value.toLowerCase().includes(query))
    : sortedDepartments;

  departmentComboList.innerHTML = "";
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "helper";
    empty.style.padding = "10px";
    empty.textContent = "No matching departments.";
    departmentComboList.appendChild(empty);
  } else {
    matches.forEach((value) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "combo-item";
      item.textContent = value;
      item.addEventListener("click", () => {
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
  const dispositionFilter = filterDisposition.value;
  const deviceTypeFilter = filterDeviceType.value.trim().toLowerCase();
  const departmentFilter = filterDepartment.value.trim().toLowerCase();
  const lifecycleYearFilter = filterLifecycleYear.value.trim();

  return assets.filter((asset) => {
    const matchesQuery = !query
      || asset.assetTag.toLowerCase().includes(query)
      || (asset.assetName || "").toLowerCase().includes(query)
      || (asset.serialNumber || "").toLowerCase().includes(query)
      || (asset.assignedTo || "").toLowerCase().includes(query);
    const matchesStatus = !statusFilter || asset.primaryStatus === statusFilter;
    const matchesDisposition = !dispositionFilter || asset.disposition === dispositionFilter;
    const matchesDeviceType = !deviceTypeFilter || (asset.deviceType || "").toLowerCase().includes(deviceTypeFilter);
    const matchesDepartment = !departmentFilter || (asset.department || "").toLowerCase() === departmentFilter;
    const matchesLifecycleYear = !lifecycleYearFilter || String(asset.lifecycleYear || "") === lifecycleYearFilter;

    return matchesQuery && matchesStatus && matchesDisposition && matchesDeviceType && matchesDepartment && matchesLifecycleYear;
  });
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
    button.className = `ghost${isActive ? " active" : ""}`;
    button.textContent = label;
    button.disabled = !!isDisabled;
    button.addEventListener("click", () => {
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

  pagedAssets.forEach((asset) => {
    const row = document.createElement("tr");
    row.className = "asset-row";
    row.innerHTML = `
      <td class="mono" data-col="assetTag"><button type="button" class="asset-link" data-view="${asset.assetTag}">${asset.assetTag}</button></td>
      <td data-col="assetName">${asset.assetName || "-"}</td>
      <td data-col="typeModel">${asset.deviceType || "-"} / ${asset.model || "-"}</td>
      <td data-col="assignedTo">${asset.assignedTo || "-"}</td>
      <td data-col="location">${asset.location || "-"}<br><span class="helper">${asset.roomNumber || "-"}</span></td>
      <td data-col="department">${asset.department || "-"}</td>
      <td data-col="primary">${badgeForPrimary(asset.primaryStatus)}</td>
      <td data-col="disposition">${badgeForDisposition(asset.disposition)}</td>
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
    || filterDisposition.value
    || filterDeviceType.value.trim()
    || filterDepartment.value
    || filterLifecycleYear.value.trim()
  );

  searchMeta.textContent = hasActiveFilters
    ? `Showing ${visibleAssets.length} of ${assets.length} assets. Page ${currentPage} of ${totalPages}.`
    : "Showing all assets.";

  renderStats(visibleAssets);
  renderPagination(visibleAssets.length);
  if (dashboardModal && !dashboardModal.hidden) renderReportingDashboard();
  renderDepartmentOptions();
}

function getVisibleColumnsForMode(mode) {
  if (mode === "minimal") {
    return new Set(["assetTag", "assignedTo", "typeModel"]);
  }

  if (mode === "full") {
    return new Set(["assetTag", "assetName", "typeModel", "assignedTo", "location", "department", "primary", "disposition", "notes", "action"]);
  }

  return new Set(["assetTag", "assetName", "typeModel", "assignedTo", "location", "department", "primary", "action"]);
}

function applyColumnVisibility() {
  const allowed = getVisibleColumnsForMode(currentViewMode);
  const allCells = document.querySelectorAll("[data-col]");

  allCells.forEach((cell) => {
    const col = cell.getAttribute("data-col");
    cell.hidden = !allowed.has(col);
  });
}

function resetForm() {
  form.reset();
  editingTag = null;
  submitBtn.textContent = "Save Asset";
  primaryStatus.value = PRIMARY_STATUS.INVENTORY;
  disposition.value = DISPOSITION.NA;
}

function fillForm(asset) {
  form.assetTag.value = asset.assetTag;
  form.assetName.value = asset.assetName || "";
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
  form.disposition.value = asset.disposition;
  form.notes.value = asset.notes;
  updateDispositionRule();
}

form.addEventListener("submit", (event) => {
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
    disposition: form.disposition.value,
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
    `Confirm ${editingTag ? "update" : "save"} for asset ${record.assetTag || "(no tag)"}?`,
    () => {
      const existingIndex = assets.findIndex((item) => item.assetTag === record.assetTag);
      if (!editingTag && existingIndex >= 0) {
        showAppNotice("Duplicate Asset Tag", "Asset Tag already exists. Use Edit instead.");
        return;
      }

      if (editingTag) {
        const editingIndex = assets.findIndex((item) => item.assetTag === editingTag);
        if (editingIndex >= 0) {
          record.commentHistory = Array.isArray(assets[editingIndex].commentHistory) ? [...assets[editingIndex].commentHistory] : [];
          assets[editingIndex] = record;
          db.saveAll(assets);
        }
      } else {
        record.commentHistory = [];
        assets = db.upsert(assets, record);
      }

      addDepartmentToList(record.department);
      renderTable();
      resetForm();
      closeAssetPanel();
    },
    editingTag ? "Update" : "Save",
    "Cancel"
  );
});

primaryStatus.addEventListener("change", updateDispositionRule);

assetRows.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const editTag = target.getAttribute("data-edit");
  const deleteTag = target.getAttribute("data-delete");
  const viewTag = target.getAttribute("data-view");

  if (viewTag) {
    const asset = assets.find((item) => item.assetTag === viewTag);
    if (asset) openAssetDetails(asset);
  }

  if (editTag) {
    startEditAsset(editTag);
  }

  if (deleteTag) {
    deleteAssetByTag(deleteTag);
  }
});

resetBtn?.addEventListener("click", resetForm);
openAssetPanelBtn?.addEventListener("click", () => {
  resetForm();
  openAssetPanel();
});
refreshDataBtn?.addEventListener("click", () => {
  assets = db.getAll();
  currentPage = 1;
  renderTable();
  if (dashboardModal && !dashboardModal.hidden) renderReportingDashboard();
  showAppNotice("Data Refreshed", "Asset data was refreshed from local storage.");
});
closeAssetPanelBtn?.addEventListener("click", closeAssetPanel);
panelOverlay?.addEventListener("click", closeAssetPanel);
openDashboardBtn?.addEventListener("click", openDashboardModal);
closeDashboardBtn?.addEventListener("click", closeDashboardModal);
dashboardOverlay?.addEventListener("click", closeDashboardModal);
closeAssetDetailsBtn?.addEventListener("click", closeAssetDetails);
detailsOverlay?.addEventListener("click", closeAssetDetails);
appDialogOverlay?.addEventListener("click", closeAppDialog);
appDialogCancelBtn?.addEventListener("click", closeAppDialog);
editFromDetailsBtn?.addEventListener("click", () => {
  const tag = assetDetailsModal?.getAttribute("data-asset-tag") || "";
  if (tag) startEditAsset(tag);
});
deleteFromDetailsBtn?.addEventListener("click", () => {
  const tag = assetDetailsModal?.getAttribute("data-asset-tag") || "";
  if (tag) deleteAssetByTag(tag);
});
addAssetCommentBtn?.addEventListener("click", postCommentForCurrentAsset);
assetCommentInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    postCommentForCurrentAsset();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (actionsMenu && actionsMenu.open) actionsMenu.open = false;
    closeAppDialog();
    closeAssetDetails();
    closeAssetPanel();
    closeDashboardModal();
  }
});

window.addEventListener("resize", () => {
  if (dashboardModal && !dashboardModal.hidden) renderReportingDashboard();
});
searchInput?.addEventListener("input", () => {
  currentPage = 1;
  renderTable();
});
filterPrimaryStatus?.addEventListener("change", () => {
  currentPage = 1;
  renderTable();
});
filterDisposition?.addEventListener("change", () => {
  currentPage = 1;
  renderTable();
});
filterDeviceType?.addEventListener("input", () => {
  currentPage = 1;
  renderTable();
});
filterDepartment?.addEventListener("input", () => {
  currentPage = 1;
  renderTable();
});
filterLifecycleYear?.addEventListener("input", () => {
  currentPage = 1;
  renderTable();
});
departmentComboBtn?.addEventListener("click", () => {
  departmentComboOpen = !departmentComboOpen;
  renderDepartmentComboList(departmentComboOpen);
});
form?.department?.addEventListener("focus", () => {
  departmentComboOpen = true;
  renderDepartmentComboList(true);
});
form?.department?.addEventListener("input", () => {
  departmentComboOpen = true;
  renderDepartmentComboList(true);
});
document.addEventListener("click", (event) => {
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
pageSizeSelect?.addEventListener("change", () => {
  const nextSize = Number(pageSizeSelect.value || 10);
  currentPageSize = Number.isFinite(nextSize) && nextSize > 0 ? nextSize : 10;
  currentPage = 1;
  renderTable();
});
viewModeSelect?.addEventListener("change", () => {
  currentViewMode = viewModeSelect.value || "standard";
  applyColumnVisibility();
});

clearSearchBtn?.addEventListener("click", () => {
  searchInput.value = "";
  currentPage = 1;
  renderTable();
  searchInput.focus();
});

clearFiltersBtn?.addEventListener("click", () => {
  filterPrimaryStatus.value = "";
  filterDisposition.value = "";
  filterDeviceType.value = "";
  filterDepartment.value = "";
  filterLifecycleYear.value = "";
  currentPage = 1;
  renderTable();
});

dashDepartment?.addEventListener("change", renderReportingDashboard);
dashStatus?.addEventListener("change", renderReportingDashboard);
dashYear?.addEventListener("input", renderReportingDashboard);
clearDashFiltersBtn?.addEventListener("click", () => {
  dashDepartment.value = "";
  dashStatus.value = "";
  dashYear.value = "";
  renderReportingDashboard();
});

addDepartmentBtn?.addEventListener("click", () => {
  const value = manageDepartmentInput?.value || form.department.value;
  if (!addDepartmentToList(value)) {
    showAppNotice("Department", "Department already exists or is empty.");
    return;
  }
  if (manageDepartmentInput) manageDepartmentInput.value = "";
});

removeDepartmentBtn?.addEventListener("click", () => {
  const value = manageDepartmentInput?.value || form.department.value;
  if (!value) {
    showAppNotice("Department", "Enter a department name to remove.");
    return;
  }
  showAppConfirm(
    "Remove Department",
    `Remove department \"${value}\" from suggestions?`,
    () => {
      if (!removeDepartmentFromList(value)) {
        showAppNotice("Department", "Department not found.");
        return;
      }
      if (manageDepartmentInput) manageDepartmentInput.value = "";
      if (form.department.value.toLowerCase() === String(value).toLowerCase()) form.department.value = "";
      if (filterDepartment.value.toLowerCase() === String(value).toLowerCase()) filterDepartment.value = "";
      renderTable();
    },
    "Remove",
    "Cancel"
  );
});

csvInput?.addEventListener("change", (event) => {
  if (typeof isManagerOrSupervisor === "function" && !isManagerOrSupervisor()) {
    showAppNotice("Permission", "Only Manager and Supervisor can import CSV.");
    csvInput.value = "";
    return;
  }
  const inputTarget = event.target;
  if (!(inputTarget instanceof HTMLInputElement)) return;

  const file = inputTarget.files && inputTarget.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const result = parseAssetCsv(String(reader.result || ""), validateAsset);
    if (result.fatalError) {
      showAppNotice("CSV Validation", result.fatalError);
      csvInput.value = "";
      return;
    }

    const existingTags = new Set(assets.map((item) => item.assetTag));
    let projectedImported = 0;
    let projectedUpdated = 0;
    result.records.forEach((record) => {
      if (existingTags.has(record.assetTag)) {
        projectedUpdated += 1;
      } else {
        projectedImported += 1;
        existingTags.add(record.assetTag);
      }
    });
    showAppConfirm(
      "Import CSV",
      `Proceed with import?\n\nNew: ${projectedImported}\nUpdates: ${projectedUpdated}\nSkipped: ${result.errors.length}`,
      () => {
        let imported = 0;
        let updated = 0;

        result.records.forEach((record) => {
          const existingIndex = assets.findIndex((item) => item.assetTag === record.assetTag);
          if (existingIndex >= 0) {
            record.commentHistory = Array.isArray(assets[existingIndex].commentHistory) ? [...assets[existingIndex].commentHistory] : [];
            assets[existingIndex] = record;
            updated += 1;
          } else {
            record.commentHistory = [];
            assets.unshift(record);
            imported += 1;
          }
        });

        db.saveAll(assets);
        renderTable();

        let message = `CSV import complete. Added: ${imported}, Updated: ${updated}.`;
        if (result.errors.length) {
          message += ` Skipped: ${result.errors.length}.\n\n${result.errors.slice(0, 10).join("\n")}`;
          if (result.errors.length > 10) message += "\n...more rows skipped.";
        }

        showAppNotice("CSV Import Complete", message);
        csvInput.value = "";
      },
      "Import",
      "Cancel"
    );
  };

  reader.onerror = () => {
    showAppNotice("CSV Error", "Unable to read CSV file.");
    csvInput.value = "";
  };

  reader.readAsText(file);
});

clearBtn?.addEventListener("click", () => {
  showAppConfirm(
    "Clear All Records",
    "Clear all asset records from this browser?\nThis action cannot be undone.",
    () => {
      assets = db.clear();
      renderTable();
      resetForm();
    },
    "Clear All",
    "Cancel"
  );
});

if (pageSizeSelect) {
  const initialSize = Number(pageSizeSelect.value || 10);
  currentPageSize = Number.isFinite(initialSize) && initialSize > 0 ? initialSize : 10;
}
renderTable();
assets.forEach((asset) => addDepartmentToList(asset.department));
updateDispositionRule();
