(function () {
  const auth = window.PCCAuth;
  if (!auth) return;
  const REMEMBER_KEY = "it_asset_login_remember_v1";

  auth.ensureDefaultAccounts();

  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("loginError");
  const usernameInput = document.getElementById("loginUsername");
  const passwordInput = document.getElementById("loginPassword");
  const rememberMeInput = document.getElementById("rememberMe");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");
  const loadingOverlay = document.getElementById("loginLoadingOverlay");
  const loadingContinueLink = document.getElementById("loadingContinueLink");
  const submitBtn = form ? form.querySelector("button[type='submit']") : null;

  if (loadingOverlay) {
    loadingOverlay.hidden = true;
    loadingOverlay.setAttribute("aria-hidden", "true");
  }

  function readRememberState() {
    try {
      const raw = localStorage.getItem(REMEMBER_KEY) || "";
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function writeRememberState(state) {
    try {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify(state));
    } catch (_error) {}
  }

  function clearRememberState() {
    try {
      localStorage.removeItem(REMEMBER_KEY);
    } catch (_error) {}
  }

  function getReturnTarget() {
    const params = new URLSearchParams(window.location.search);
    const rawTarget = String(params.get("returnTo") || "index.html").trim();
    const normalized = rawTarget.replace(/^\.?\//, "").toLowerCase();
    if (!rawTarget || rawTarget.includes("://") || rawTarget.startsWith("/") || normalized === "login.html") {
      return "./index.html";
    }
    return "./" + rawTarget.replace(/^\.?\//, "");
  }

  function getAbsoluteReturnTarget() {
    const requested = getReturnTarget();
    const basePath = window.location.href.split("?")[0].replace(/[^/]*$/, "");
    const requestName = requested.replace(/^\.?\//, "");
    if (!requestName || requestName.toLowerCase() === "login.html") {
      return basePath + "index.html";
    }
    return basePath + requestName;
  }

  function isStillOnLoginPage() {
    return /\/login\.html(?:\?|#|$)/i.test(window.location.href.replace(/\\/g, "/"));
  }

  if (auth.getSession()) {
    window.location.href = getReturnTarget();
    return;
  }

  if (!form) return;
  const remembered = readRememberState();
  if (remembered) {
    if (usernameInput && remembered.username) usernameInput.value = String(remembered.username);
    if (passwordInput && remembered.password) passwordInput.value = String(remembered.password);
    if (rememberMeInput) rememberMeInput.checked = true;
  }
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener("click", function () {
      const showing = passwordInput.type === "text";
      passwordInput.type = showing ? "password" : "text";
      togglePasswordBtn.classList.toggle("is-visible", !showing);
      togglePasswordBtn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      togglePasswordBtn.setAttribute("title", showing ? "Show password" : "Hide password");
    });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (errorBox) errorBox.textContent = "";
    if (submitBtn) submitBtn.disabled = true;

    const username = form.username ? form.username.value : "";
    const password = form.password ? form.password.value : "";
    let result;
    try {
      result = await auth.authenticate(username, password);
    } catch (_error) {
      if (errorBox) errorBox.textContent = "Secure login is unavailable in this browser.";
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    if (!result.ok) {
      if (errorBox) errorBox.textContent = result.message || "Login failed.";
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    if (rememberMeInput && rememberMeInput.checked) {
      writeRememberState({
        username: username,
        password: password
      });
    } else {
      clearRememberState();
    }

    if (loadingOverlay) {
      loadingOverlay.hidden = false;
      loadingOverlay.setAttribute("aria-hidden", "false");
    }

    const redirectTarget = getAbsoluteReturnTarget();
    if (loadingContinueLink) loadingContinueLink.setAttribute("href", redirectTarget);

    // File:// mode can be strict; perform immediate hard navigation and keep
    // a visible manual fallback link on the loading card.
    window.setTimeout(function () {
      window.location = redirectTarget;
    }, 1400);
  });
})();

