(async function () {
  const auth = window.PCCAuth;
  if (!auth) return;
  const session = typeof auth.requireAuthAsync === "function"
    ? await auth.requireAuthAsync({ allowRoles: ["MANAGER", "SUPERVISOR", "AGENT"] })
    : auth.requireAuth({ allowRoles: ["MANAGER", "SUPERVISOR", "AGENT"] });
  if (!session) return;
  if (!auth.canMassDelete(session.role)) {
    document.body.innerHTML = "<div style='padding:24px;font-family:Space Grotesk,sans-serif;'><h2>Access Denied</h2><p>Mass delete is only available to Manager and Supervisor roles.</p><p><a href='./index.html'>Return to inventory</a></p></div>";
    return;
  }

  const supabaseConfig = window.SUPABASE_CONFIG || null;
  const supabaseClient = (window.supabase && supabaseConfig && supabaseConfig.url && supabaseConfig.anonKey)
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
    : null;
  if (!supabaseClient) {
    document.body.innerHTML = "<div style='padding:24px;font-family:Space Grotesk,sans-serif;'><h2>Cloud Connection Required</h2><p>Mass delete requires Supabase connection.</p><p><a href='./index.html'>Return to inventory</a></p></div>";
    return;
  }

  const bulkRows = document.getElementById("bulkRows");
  const bulkEmptyState = document.getElementById("bulkEmptyState");
  const bulkMeta = document.getElementById("bulkMeta");
  const bulkSearchInput = document.getElementById("bulkSearchInput");
  const clearBulkSearchBtn = document.getElementById("clearBulkSearchBtn");
  const toggleAllBtn = document.getElementById("toggleAllBtn");
  const bulkAgreement = document.getElementById("bulkAgreement");
  const bulkDeleteBtn = document.getElementById("bulkDeleteBtn");
  const bulkDialog = document.getElementById("bulkDialog");
  const bulkDialogOverlay = document.getElementById("bulkDialogOverlay");
  const bulkDialogTitle = document.getElementById("bulkDialogTitle");
  const bulkDialogMessage = document.getElementById("bulkDialogMessage");
  const bulkDialogCancelBtn = document.getElementById("bulkDialogCancelBtn");
  const bulkDialogConfirmBtn = document.getElementById("bulkDialogConfirmBtn");

  let assets = [];
  const selectedTags = new Set();

  async function loadAssets() {
    const result = await supabaseClient
      .from("assets")
      .select("asset_tag, asset_name, serial_number, device_type, model, assigned_user, department")
      .order("id", { ascending: false });
    if (result.error) {
      showBulkNotice("Load Error", result.error.message || "Unable to load assets from Supabase.");
      return [];
    }
    return (result.data || []).map(function (row) {
      return {
        assetTag: row.asset_tag || "",
        assetName: row.asset_name || "",
        serialNumber: row.serial_number || "",
        deviceType: row.device_type || "",
        model: row.model || "",
        assignedTo: row.assigned_user || "",
        department: row.department || ""
      };
    });
  }

  function closeBulkDialog() {
    if (!bulkDialog || !bulkDialogOverlay) return;
    bulkDialog.hidden = true;
    bulkDialog.setAttribute("aria-hidden", "true");
    bulkDialogOverlay.hidden = true;
    if (bulkDialogConfirmBtn) bulkDialogConfirmBtn.onclick = null;
    if (bulkDialogCancelBtn) {
      bulkDialogCancelBtn.onclick = null;
      bulkDialogCancelBtn.hidden = false;
    }
  }

  function showBulkConfirm(title, message, onConfirm, confirmLabel, cancelLabel) {
    if (!bulkDialog || !bulkDialogOverlay || !bulkDialogTitle || !bulkDialogMessage || !bulkDialogCancelBtn || !bulkDialogConfirmBtn) {
      if (confirm(message)) onConfirm();
      return;
    }
    bulkDialogTitle.textContent = title || "Confirm Action";
    bulkDialogMessage.textContent = message || "";
    bulkDialogConfirmBtn.textContent = confirmLabel || "Confirm";
    bulkDialogCancelBtn.textContent = cancelLabel || "Cancel";
    bulkDialog.hidden = false;
    bulkDialog.setAttribute("aria-hidden", "false");
    bulkDialogOverlay.hidden = false;
    bulkDialogConfirmBtn.onclick = function () {
      closeBulkDialog();
      onConfirm();
    };
    bulkDialogCancelBtn.onclick = closeBulkDialog;
  }

  function showBulkNotice(title, message) {
    showBulkConfirm(title, message, function () {}, "OK", "Close");
    if (bulkDialogCancelBtn) bulkDialogCancelBtn.hidden = true;
    if (bulkDialogConfirmBtn) {
      bulkDialogConfirmBtn.onclick = function () {
        if (bulkDialogCancelBtn) bulkDialogCancelBtn.hidden = false;
        closeBulkDialog();
      };
    }
  }

  function getVisibleAssets() {
    const query = String((bulkSearchInput && bulkSearchInput.value) || "").trim().toLowerCase();
    if (!query) return assets.slice();

    return assets.filter(function (asset) {
      return String(asset.assetTag || "").toLowerCase().includes(query)
        || String(asset.assetName || "").toLowerCase().includes(query)
        || String(asset.serialNumber || "").toLowerCase().includes(query)
        || String(asset.assignedTo || "").toLowerCase().includes(query);
    });
  }

  function updateDeleteButtonState() {
    const hasSelection = selectedTags.size > 0;
    const agreed = !!(bulkAgreement && bulkAgreement.checked);
    if (bulkDeleteBtn) bulkDeleteBtn.disabled = !(hasSelection && agreed);
  }

  function render() {
    if (!bulkRows || !bulkMeta || !bulkEmptyState) return;
    bulkRows.innerHTML = "";

    const visible = getVisibleAssets();
    const hasAssets = assets.length > 0;

    visible.forEach(function (asset) {
      const tag = String(asset.assetTag || "");
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><input type="checkbox" data-tag="${tag}" ${selectedTags.has(tag) ? "checked" : ""} /></td>
        <td class="mono">${tag || "-"}</td>
        <td>${asset.assetName || "-"}</td>
        <td>${asset.deviceType || "-"} / ${asset.model || "-"}</td>
        <td>${asset.assignedTo || "-"}</td>
        <td>${asset.department || "-"}</td>
      `;
      bulkRows.appendChild(row);
    });

    if (!hasAssets) {
      bulkEmptyState.textContent = "No assets available.";
      bulkEmptyState.style.display = "block";
    } else if (!visible.length) {
      bulkEmptyState.textContent = "No matching assets found.";
      bulkEmptyState.style.display = "block";
    } else {
      bulkEmptyState.style.display = "none";
    }

    bulkMeta.textContent = "Showing " + visible.length + " of " + assets.length + " assets. Selected: " + selectedTags.size + ".";
    toggleAllBtn.textContent = visible.length && visible.every(function (asset) { return selectedTags.has(String(asset.assetTag || "")); })
      ? "Unselect Visible"
      : "Select Visible";

    updateDeleteButtonState();
  }

  if (bulkRows) {
    bulkRows.addEventListener("change", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const tag = String(target.getAttribute("data-tag") || "");
      if (!tag) return;
      if (target.checked) selectedTags.add(tag);
      else selectedTags.delete(tag);
      updateDeleteButtonState();
      if (bulkMeta) bulkMeta.textContent = "Showing " + getVisibleAssets().length + " of " + assets.length + " assets. Selected: " + selectedTags.size + ".";
    });
  }

  if (bulkSearchInput) bulkSearchInput.addEventListener("input", render);
  if (clearBulkSearchBtn) {
    clearBulkSearchBtn.addEventListener("click", function () {
      if (bulkSearchInput) bulkSearchInput.value = "";
      render();
      if (bulkSearchInput) bulkSearchInput.focus();
    });
  }

  if (toggleAllBtn) {
    toggleAllBtn.addEventListener("click", function () {
      const visible = getVisibleAssets();
      const visibleTags = visible.map(function (asset) { return String(asset.assetTag || ""); }).filter(Boolean);
      const allVisibleSelected = visibleTags.length > 0 && visibleTags.every(function (tag) { return selectedTags.has(tag); });

      visibleTags.forEach(function (tag) {
        if (allVisibleSelected) selectedTags.delete(tag);
        else selectedTags.add(tag);
      });
      render();
    });
  }

  if (bulkAgreement) bulkAgreement.addEventListener("change", updateDeleteButtonState);
  if (bulkDialogOverlay) bulkDialogOverlay.addEventListener("click", closeBulkDialog);
  if (bulkDialogCancelBtn) bulkDialogCancelBtn.addEventListener("click", closeBulkDialog);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeBulkDialog();
  });

  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener("click", function () {
      if (!bulkAgreement || !bulkAgreement.checked) {
        showBulkNotice("Agreement Required", "Please check the agreement before deleting.");
        return;
      }

      const toDelete = new Set(selectedTags);
      if (!toDelete.size) return;
      showBulkConfirm(
        "Mass Delete",
        "Permanently delete " + toDelete.size + " selected asset(s)?\nThis action cannot be undone.",
        async function () {
          const tags = Array.from(toDelete);
          const result = await supabaseClient
            .from("assets")
            .delete()
            .in("asset_tag", tags);
          if (result.error) {
            showBulkNotice("Mass Delete Error", result.error.message || "Unable to delete selected assets.");
            return;
          }
          assets = await loadAssets();
          selectedTags.clear();
          if (bulkAgreement) bulkAgreement.checked = false;
          render();
          showBulkNotice("Mass Delete Complete", "Selected assets were deleted from Supabase.");
        },
        "Delete Selected",
        "Cancel"
      );
    });
  }

  loadAssets().then(function (loaded) {
    assets = loaded;
    render();
  });
})();
