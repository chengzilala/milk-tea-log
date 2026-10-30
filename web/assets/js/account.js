/**
 * 统一账户中心接入（附加项，不影响记录主流程）。
 *
 * 只做一件事：在「我的」页显示账户入口——未登录去登录，已登录进账户中心。
 * 账户中心只提供身份（uid）；拍一杯的记录 / 照片 / 语音全部只在本机，不上传任何业务数据。
 *
 * 刻意不在页面加载时初始化 SDK：SDK 初始化会触发一次「静默登录」跳转，
 * 没账号的人每次打开都会被弹去账户中心再弹回来，打断拍照。这里改成：
 * - 本机已登录过（有 ps_token）或地址栏带回票据（ps_ticket）时才加载 SDK 读身份；
 * - 其余情况只显示一枚「登录统一账户」，点了才去登录页。
 */
(function () {
  "use strict";

  const PRODUCT_ID = "milk-tea-log";
  const ACCOUNT_WEB = "https://account.chesterlee.cn";
  const SDK_SRC = "assets/js/ps-auth.js";
  const TOKEN_KEY = "ps_token"; // 与 ps-auth.js 一致：登录态存在本域 localStorage

  function logInfo(event, data) {
    if (window.MtlLog) window.MtlLog.info(event, data);
  }
  function logWarn(event, data) {
    if (window.MtlLog) window.MtlLog.warn(event, data);
  }

  function isLocalHost() {
    return /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  }

  function loginPage() {
    const back = location.origin + location.pathname;
    return (
      ACCOUNT_WEB +
      "/login.html?productId=" +
      encodeURIComponent(PRODUCT_ID) +
      "&returnUrl=" +
      encodeURIComponent(back)
    );
  }

  function hasToken() {
    try {
      return Boolean(localStorage.getItem(TOKEN_KEY));
    } catch (err) {
      return false;
    }
  }

  // 按需加载 SDK（ps-auth.js 与本文件同目录，整文件来自账户中心，不手改）
  function loadSdk() {
    if (window.__mtlAuthSdk) return window.__mtlAuthSdk;
    window.__mtlAuthSdk = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = SDK_SRC;
      script.onload = () => {
        if (!window.PSAuth) {
          resolve(null);
          return;
        }
        window.PSAuth.init({
          apiBase: ACCOUNT_WEB,
          loginUrl: ACCOUNT_WEB + "/login.html",
          productId: PRODUCT_ID,
        });
        resolve(window.PSAuth);
      };
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
    return window.__mtlAuthSdk;
  }

  function renderEntry(sdk, user) {
    const entry = document.getElementById("mtl-account");
    if (!entry) return;
    const badge = document.getElementById("mtl-account-badge");
    const name = document.getElementById("mtl-account-name");
    const hint = document.getElementById("mtl-account-hint");

    if (user) {
      const nickname = user.nickname || "我的账户";
      name.textContent = nickname;
      hint.textContent = "已登录 · 账户中心";
      if (badge) badge.textContent = nickname.slice(0, 1);
      entry.href = ACCOUNT_WEB + "/account.html";
      entry.onclick = null;
      entry.setAttribute("aria-label", "查看我的统一账户");
    } else {
      name.textContent = "登录统一账户";
      hint.textContent = "一处登录，各作品通用";
      if (badge) badge.textContent = "我";
      entry.href = loginPage();
      entry.onclick = sdk
        ? (event) => {
            event.preventDefault();
            sdk.requireLogin({ returnUrl: location.origin + location.pathname });
          }
        : null;
      entry.setAttribute("aria-label", "登录统一账户");
    }
    entry.hidden = false;
  }

  function setup() {
    if (isLocalHost()) {
      // 本机预览：账户中心页面在另一个端口，静默登录会跳到本机未托管的中转页，
      // 所以本机不挂账户入口（线上域名自动生效），避免打断记录流程。
      logInfo("account.skip_local", { host: location.hostname });
      return;
    }

    const hasTicket = new URL(location.href).searchParams.has("ps_ticket");
    if (!hasTicket && !hasToken()) {
      // 没登录过：只给入口，不加载 SDK（避免静默登录跳转）
      renderEntry(null, null);
      logInfo("account.state", { signedIn: false });
      return;
    }

    loadSdk()
      .then((sdk) => {
        if (!sdk) {
          renderEntry(null, null);
          return null;
        }
        return sdk.getUser().then((user) => {
          renderEntry(sdk, user);
          logInfo("account.state", { signedIn: Boolean(user) });
        });
      })
      .catch(() => {
        // 账户服务不可用：入口退回「去登录」，不打扰记录
        renderEntry(null, null);
        logWarn("account.unavailable", {});
      });
  }

  document.addEventListener("DOMContentLoaded", setup);
})();
