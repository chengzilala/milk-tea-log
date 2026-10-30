/**
 * 统一诊断日志（前端）。
 *
 * 用途：手机真机测试时，不用连电脑也能判断「EXIF / 识别 / 定位 / 抠图 / 保存」哪一步不对。
 * 规则：
 * - 只记流程与结果，不记图片内容、不记任何 Key；
 * - 本机 localStorage 留最近 300 条，方便在手机上直接导出；
 * - 同时批量上报服务端 /api/log，落盘到 logs/client-YYYY-MM-DD.jsonl。
 */
(function () {
  "use strict";

  const ENDPOINT = "/api/log";
  const STORE_KEY = "mtl:log:v1";
  const MAX_LOCAL = 300;
  const MAX_BATCH = 20;
  const FLUSH_DELAY = 1500;

  const sessionId = "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let queue = [];
  let timer = 0;

  function deviceInfo() {
    const screenSize = window.screen ? window.screen.width + "x" + window.screen.height : "";
    return {
      ua: navigator.userAgent,
      screen: screenSize,
      dpr: window.devicePixelRatio || 1,
      viewport: window.innerWidth + "x" + window.innerHeight,
      secure: Boolean(window.isSecureContext),
      lang: navigator.language || "",
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      online: navigator.onLine !== false,
    };
  }

  function saveLocal(entry) {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      raw.push(entry);
      localStorage.setItem(STORE_KEY, JSON.stringify(raw.slice(-MAX_LOCAL)));
    } catch (err) {
      // localStorage 满了或被禁用：不影响主流程
    }
  }

  function schedule() {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      flush();
    }, FLUSH_DELAY);
  }

  function push(level, event, data) {
    const entry = {
      t: new Date().toISOString(),
      sid: sessionId,
      level,
      event,
      data: data || {},
    };
    queue.push(entry);
    saveLocal(entry);
    if (level === "error") console.error("[mtl]", event, entry.data);
    else if (level === "warn") console.warn("[mtl]", event, entry.data);
    else console.info("[mtl]", event, entry.data);
    schedule();
  }

  function payloadOf(batch) {
    return JSON.stringify({ sessionId, ua: navigator.userAgent, events: batch });
  }

  async function flush() {
    if (!queue.length || !window.fetch) return;
    const batch = queue.slice(0, MAX_BATCH);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payloadOf(batch),
        keepalive: true,
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      queue = queue.slice(batch.length);
      if (queue.length) schedule();
    } catch (err) {
      // 上报失败就先留在内存里，下次触发再试；超过上限丢最旧的，避免占内存
      if (queue.length > MAX_LOCAL) queue = queue.slice(-MAX_LOCAL);
    }
  }

  // 页面关闭 / 切后台时用 sendBeacon，避免最后几条日志丢失
  function flushBeacon() {
    if (!queue.length || !navigator.sendBeacon) return;
    const batch = queue.slice(0, MAX_BATCH);
    try {
      const sent = navigator.sendBeacon(
        ENDPOINT,
        new Blob([payloadOf(batch)], { type: "application/json" })
      );
      if (sent) queue = queue.slice(batch.length);
    } catch (err) {
      // 忽略
    }
  }

  function dump() {
    try {
      return localStorage.getItem(STORE_KEY) || "[]";
    } catch (err) {
      return "[]";
    }
  }

  window.MtlLog = {
    sessionId,
    info: (event, data) => push("info", event, data),
    warn: (event, data) => push("warn", event, data),
    error: (event, data) => push("error", event, data),
    flush,
    dump,
  };

  window.addEventListener("error", (event) => {
    push("error", "js.error", {
      message: String((event && event.message) || "").slice(0, 200),
      source: String((event && event.filename) || "").slice(0, 120),
      line: (event && event.lineno) || 0,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event && event.reason;
    push("error", "js.rejection", {
      message: String((reason && reason.message) || reason || "").slice(0, 200),
      code: (reason && reason.code) || "",
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushBeacon();
  });
  window.addEventListener("pagehide", flushBeacon);

  push("info", "app.start", deviceInfo());
})();
