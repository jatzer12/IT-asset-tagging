(async function () {
  const auth = window.PCCAuth;
  if (!auth) return;
  const session = typeof auth.requireAuthAsync === "function"
    ? await auth.requireAuthAsync({ allowRoles: ["MANAGER", "SUPERVISOR", "AGENT"] })
    : auth.requireAuth({ allowRoles: ["MANAGER", "SUPERVISOR", "AGENT"] });
  if (!session) return;

  const supabaseConfig = window.SUPABASE_CONFIG || null;
  const supabaseClient = (window.supabase && supabaseConfig && supabaseConfig.url && supabaseConfig.anonKey)
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
    : null;
  if (!supabaseClient) {
    document.body.innerHTML = "<div style='padding:24px;font-family:Space Grotesk,sans-serif;'><h2>Cloud Connection Required</h2><p>Dashboard requires Supabase connection.</p><p><a href='./index.html'>Return to inventory</a></p></div>";
    return;
  }

  const repComputersPast = document.getElementById("repComputersPast");
  const repAssetsPast = document.getElementById("repAssetsPast");
  const repDueThisYear = document.getElementById("repDueThisYear");
  const repDueNextYear = document.getElementById("repDueNextYear");
  const repDeptRows = document.getElementById("repDeptRows");
  const repBucketRows = document.getElementById("repBucketRows");
  const dashMeta = document.getElementById("dashMeta");

  const dashDepartment = document.getElementById("dashDepartment");
  const dashDepartmentOptions = document.getElementById("dashDepartmentOptions");
  const dashStatus = document.getElementById("dashStatus");
  const dashYear = document.getElementById("dashYear");
  const refreshDashboardBtn = document.getElementById("refreshDashboardBtn");
  const clearDashFiltersBtn = document.getElementById("clearDashFiltersBtn");

  let assets = [];

  function getLifecycleYearValue(asset) {
    const year = Number(String(asset.lifecycleYear || "").trim());
    return Number.isFinite(year) && year >= 1900 ? year : null;
  }

  function isComputerAsset(asset) {
    const text = String(asset.deviceType || "") + " " + String(asset.model || "") + " " + String(asset.assetName || "");
    const lower = text.toLowerCase();
    return ["computer", "laptop", "desktop", "workstation"].some(function (keyword) {
      return lower.includes(keyword);
    });
  }

  function applyFilters(rows) {
    const department = String((dashDepartment && dashDepartment.value) || "").trim().toLowerCase();
    const status = String((dashStatus && dashStatus.value) || "").trim();
    const year = String((dashYear && dashYear.value) || "").trim();

    return rows.filter(function (asset) {
      const matchDept = !department || String(asset.department || "").trim().toLowerCase() === department;
      const matchStatus = !status || String(asset.primaryStatus || "") === status;
      const matchYear = !year || String(asset.lifecycleYear || "") === year;
      return matchDept && matchStatus && matchYear;
    });
  }

  function renderDepartmentOptions(rows) {
    if (!dashDepartmentOptions) return;
    const departments = Array.from(new Set(
      rows.map(function (asset) { return String(asset.department || "").trim(); }).filter(Boolean)
    )).sort(function (a, b) { return a.localeCompare(b); });
    dashDepartmentOptions.innerHTML = departments
      .map(function (value) { return "<option value=\"" + value.replace(/"/g, "&quot;") + "\"></option>"; })
      .join("");
  }

  function renderDashboard() {
    const visibleAssets = applyFilters(assets);
    const currentYear = new Date().getFullYear();
    const assetsWithYear = visibleAssets.filter(function (asset) {
      return getLifecycleYearValue(asset) !== null;
    });

    const past = assetsWithYear.filter(function (asset) { return getLifecycleYearValue(asset) < currentYear; });
    const dueThis = assetsWithYear.filter(function (asset) { return getLifecycleYearValue(asset) === currentYear; });
    const dueNext = assetsWithYear.filter(function (asset) { return getLifecycleYearValue(asset) === currentYear + 1; });
    const computersPast = past.filter(isComputerAsset);

    if (repComputersPast) repComputersPast.textContent = String(computersPast.length);
    if (repAssetsPast) repAssetsPast.textContent = String(past.length);
    if (repDueThisYear) repDueThisYear.textContent = String(dueThis.length);
    if (repDueNextYear) repDueNextYear.textContent = String(dueNext.length);

    if (dashMeta) dashMeta.textContent = "Showing " + visibleAssets.length + " of " + assets.length + " assets in dashboard.";

    const byDepartment = new Map();
    visibleAssets.forEach(function (asset) {
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
        return (b[1].past + b[1].thisYear + b[1].nextYear) - (a[1].past + a[1].thisYear + a[1].nextYear);
      })
      .slice(0, 20)
      .map(function (entry) {
        const dept = entry[0];
        const stats = entry[1];
        return "<tr><td>" + dept + "</td><td>" + stats.past + "</td><td>" + stats.thisYear + "</td><td>" + stats.nextYear + "</td></tr>";
      })
      .join("");
    if (repDeptRows) repDeptRows.innerHTML = deptRows || "<tr><td colspan=\"4\">No data for selected filters.</td></tr>";

    const buckets = {
      "Past Due": past.length,
      "This Year": dueThis.length,
      "Next Year": dueNext.length,
      "Future (2+ Years)": assetsWithYear.filter(function (asset) { return getLifecycleYearValue(asset) > currentYear + 1; }).length,
      "No Lifecycle Year": visibleAssets.filter(function (asset) { return getLifecycleYearValue(asset) === null; }).length
    };
    if (repBucketRows) {
      repBucketRows.innerHTML = Object.entries(buckets)
        .map(function (entry) { return "<tr><td>" + entry[0] + "</td><td>" + entry[1] + "</td></tr>"; })
        .join("");
    }

    renderDepartmentOptions(assets);
  }

  async function loadAssetsFromSupabase() {
    const result = await supabaseClient
      .from("assets")
      .select("asset_name, device_type, model, department, lifecycle_year, status")
      .order("id", { ascending: false });
    if (result.error) {
      if (dashMeta) dashMeta.textContent = "Unable to load dashboard data.";
      return;
    }
    assets = (result.data || []).map(function (row) {
      return {
        assetName: row.asset_name || "",
        deviceType: row.device_type || "",
        model: row.model || "",
        department: row.department || "",
        lifecycleYear: row.lifecycle_year === null || row.lifecycle_year === undefined ? "" : String(row.lifecycle_year),
        primaryStatus: row.status || ""
      };
    });
    renderDashboard();
  }

  if (dashDepartment) dashDepartment.addEventListener("input", renderDashboard);
  if (dashStatus) dashStatus.addEventListener("change", renderDashboard);
  if (dashYear) dashYear.addEventListener("input", renderDashboard);
  if (refreshDashboardBtn) refreshDashboardBtn.addEventListener("click", loadAssetsFromSupabase);
  if (clearDashFiltersBtn) {
    clearDashFiltersBtn.addEventListener("click", function () {
      if (dashDepartment) dashDepartment.value = "";
      if (dashStatus) dashStatus.value = "";
      if (dashYear) dashYear.value = "";
      renderDashboard();
    });
  }

  await loadAssetsFromSupabase();
})();
