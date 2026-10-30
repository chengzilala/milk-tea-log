(function () {
  "use strict";

  const DB_NAME = "mtl";
  const DB_VERSION = 1;
  const STORE = "records";
  const SETTINGS_KEY = "mtl:settings:v1";
  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const PHOTO_EDGE = 1280;
  const THUMB_EDGE = 640;

  // 四套风格主题：切换 body[data-theme]，样式见 style.css。
  const DEFAULT_THEME = "paper";
  const THEMES = {
    paper: { name: "纸感贴纸", color: "#f6f4ee" },
    stage: { name: "暖棕展台", color: "#976b54" },
    pop: { name: "彩色卡片", color: "#f8f6f0" },
    quiet: { name: "极简留白", color: "#fbfaf7" },
  };

  // 价格一键点选：先看自己记过的价，再按品牌价带，最后用通用价点兜底。
  const PRICE_BANDS = [
    { match: ["蜜雪", "幸运咖"], prices: [6, 8, 9.9] },
    { match: ["古茗", "茶百道", "沪上阿姨", "益禾堂", "甜啦啦", "一点点", "CoCo"], prices: [10, 13, 16] },
    { match: ["霸王茶姬", "茉莉奶白", "茶颜悦色"], prices: [15, 18, 20] },
    { match: ["喜茶", "奈雪", "乐乐茶"], prices: [19, 22, 25] },
    { match: ["瑞幸", "库迪", "星巴克", "Manner", "manner"], prices: [9.9, 12.9, 15.9] },
  ];
  const DEFAULT_PRICE_POINTS = [9.9, 12.9, 15.9, 19.9];

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  // 统一诊断日志：手机测试时靠它判断每一步对不对（见 assets/js/log.js）。
  function logInfo(event, data) {
    if (window.MtlLog) window.MtlLog.info(event, data);
  }
  function logWarn(event, data) {
    if (window.MtlLog) window.MtlLog.warn(event, data);
  }

  let records = [];
  let currentMonth = monthKey(new Date());
  let pending = null;
  let jobSeq = 0;
  let dbPromise = null;
  let archiveUrls = [];
  let mapUrls = [];
  let map = null;
  let mapMarkers = [];
  let mapLoadPromise = null;
  // 地图两级视角：城市级（数字徽章）↔ 地点级（小图钉），由缩放级别切换。
  let mapMode = "";
  let mapCityGroups = [];
  let mapPointGroups = [];
  let mapActiveCityKey = "";
  let detailId = null;
  let detailUrl = "";
  let detailVoiceUrl = "";
  let voiceSession = null;
  let voiceBaseNote = "";
  let voiceLiveText = "";
  let voiceSttReady = false;
  let shareBlob = null;
  let shareUrl = "";
  let toastTimer = 0;
  let statPeriod = "month";
  let archiveView = "stamp";

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function dateKey(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function monthKey(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1);
  }

  function formatMonth(month) {
    return month.replace("-", " 年 ") + " 月";
  }

  function formatDay(d) {
    const now = new Date();
    const year = d.getFullYear() === now.getFullYear() ? "" : d.getFullYear() + " 年 ";
    return year + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日";
  }

  function uid() {
    return "mtl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 心情只做点选：每个表情一张手绘卡通脸，点一下选中、再点一下取消。
  const MOODS = [
    { key: "happy", label: "开心", bg: "#FFE1A6" },
    { key: "cozy", label: "治愈", bg: "#FFD6DE" },
    { key: "hype", label: "上头", bg: "#FFC9A3" },
    { key: "sleepy", label: "困困", bg: "#D9E3FF" },
    { key: "blue", label: "emo", bg: "#CFE7F8" },
    { key: "calm", label: "平静", bg: "#E9E3F7" },
  ];

  const MOOD_INK = "#6B4632";
  const MOOD_BLUSH = '<ellipse cx="9.4" cy="20" rx="2.2" ry="1.4" fill="#FF9EA8" opacity=".6"/>' +
    '<ellipse cx="26.6" cy="20" rx="2.2" ry="1.4" fill="#FF9EA8" opacity=".6"/>';
  const MOOD_FACES = {
    happy:
      '<path d="M10.6 15.8c1.3-2.1 3.4-2.1 4.7 0" fill="none" stroke="' + MOOD_INK + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M20.7 15.8c1.3-2.1 3.4-2.1 4.7 0" fill="none" stroke="' + MOOD_INK + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M13.6 20c1.9 3.1 6.9 3.1 8.8 0" fill="none" stroke="' + MOOD_INK + '" stroke-width="2" stroke-linecap="round"/>' +
      MOOD_BLUSH,
    cozy:
      '<path d="M10.8 16.4c1.3 1.7 3.3 1.7 4.6 0" fill="none" stroke="' + MOOD_INK + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M20.6 16.4c1.3 1.7 3.3 1.7 4.6 0" fill="none" stroke="' + MOOD_INK + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M14.6 20.6c1.3 1.7 5.5 1.7 6.8 0" fill="none" stroke="' + MOOD_INK + '" stroke-width="2" stroke-linecap="round"/>' +
      MOOD_BLUSH,
    hype:
      '<ellipse cx="13.2" cy="15.8" rx="2.1" ry="2.5" fill="' + MOOD_INK + '"/>' +
      '<ellipse cx="22.8" cy="15.8" rx="2.1" ry="2.5" fill="' + MOOD_INK + '"/>' +
      '<ellipse cx="18" cy="22.4" rx="3.6" ry="3" fill="' + MOOD_INK + '"/>' +
      '<path d="M16.2 24.6c1.2-1.2 2.4-1.2 3.6 0" fill="none" stroke="#FF9EA8" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M27.6 8.6l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="#fff" opacity=".95"/>',
    sleepy:
      '<path d="M10.6 16.4h4.2" fill="none" stroke="' + MOOD_INK + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M21.2 16.4h4.2" fill="none" stroke="' + MOOD_INK + '" stroke-width="2" stroke-linecap="round"/>' +
      '<ellipse cx="18.2" cy="22" rx="1.8" ry="2.2" fill="' + MOOD_INK + '"/>' +
      '<path d="M26.6 10.4h2.6l-2.6 3h2.6" fill="none" stroke="' + MOOD_INK + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<ellipse cx="9.4" cy="20" rx="2" ry="1.3" fill="#FF9EA8" opacity=".45"/>',
    blue:
      '<circle cx="13.2" cy="16.6" r="1.6" fill="' + MOOD_INK + '"/>' +
      '<circle cx="22.8" cy="16.6" r="1.6" fill="' + MOOD_INK + '"/>' +
      '<path d="M14 23.2c1.6-2.1 6.4-2.1 8 0" fill="none" stroke="' + MOOD_INK + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M11.2 18.8c0 .9.7 1.6 1.6 1.6s1.6-.7 1.6-1.6-1.6-2.9-1.6-2.9-1.6 2-1.6 2.9z" fill="#7FC3E8"/>' +
      '<ellipse cx="26.6" cy="20" rx="2" ry="1.3" fill="#FF9EA8" opacity=".45"/>',
    calm:
      '<circle cx="13" cy="16.6" r="1.6" fill="' + MOOD_INK + '"/>' +
      '<circle cx="23" cy="16.6" r="1.6" fill="' + MOOD_INK + '"/>' +
      '<path d="M16.2 21.4h3.6" fill="none" stroke="' + MOOD_INK + '" stroke-width="2" stroke-linecap="round"/>' +
      MOOD_BLUSH,
  };

  function moodByKey(key) {
    return MOODS.find((mood) => mood.key === key) || null;
  }

  function moodLabel(key) {
    const mood = moodByKey(key);
    return mood ? mood.label : "";
  }

  function moodSvg(key) {
    const mood = moodByKey(key);
    if (!mood) return "";
    return (
      '<svg class="mtl-mood-face" viewBox="0 0 36 36" aria-hidden="true">' +
      '<circle cx="18" cy="18" r="16" fill="' + mood.bg + '"/>' +
      '<circle cx="18" cy="18" r="16" fill="none" stroke="' + MOOD_INK + '" stroke-width="1" opacity=".18"/>' +
      '<ellipse cx="12.6" cy="10.6" rx="4.2" ry="3" fill="#fff" opacity=".35"/>' +
      MOOD_FACES[key] +
      "</svg>"
    );
  }

  function setMood(container, value) {
    if (!container) return;
    const key = moodByKey(value) ? value : "";
    container.dataset.value = key;
    $$("[data-mood]", container).forEach((btn) => {
      const on = btn.dataset.mood === key;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function getMood(container) {
    return container && moodByKey(container.dataset.value) ? container.dataset.value : "";
  }

  function renderMoodPicker(container) {
    if (!container) return;
    container.innerHTML = "";
    MOODS.forEach((mood) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mtl-mood-chip";
      btn.dataset.mood = mood.key;
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", "false");
      btn.setAttribute("aria-label", mood.label);
      btn.innerHTML = moodSvg(mood.key) + '<span class="mtl-mood-label">' + mood.label + "</span>";
      btn.addEventListener("click", () => {
        setMood(container, container.dataset.value === mood.key ? "" : mood.key);
      });
      container.appendChild(btn);
    });
    setMood(container, container.dataset.value);
  }

  const TIMES = ["上午", "下午", "晚上"];

  function timeLabel(value) {
    return TIMES.indexOf(value) >= 0 ? value : "";
  }

  // 按小时粗分时段：4-11 上午，11-18 下午，其余晚上
  function timeByHour(date) {
    const hour = date instanceof Date ? date.getHours() : NaN;
    if (!Number.isFinite(hour)) return "";
    if (hour >= 4 && hour < 11) return "上午";
    if (hour >= 11 && hour < 18) return "下午";
    return "晚上";
  }

  function setTime(container, value) {
    if (!container) return;
    const label = timeLabel(value);
    container.dataset.value = label;
    $$("[data-time]", container).forEach((btn) => {
      const on = btn.dataset.time === label;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function getTime(container) {
    return container ? timeLabel(container.dataset.value) : "";
  }

  function renderTimeChips(container) {
    if (!container) return;
    container.innerHTML = "";
    TIMES.forEach((label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mtl-chip mtl-time-chip";
      btn.dataset.time = label;
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", "false");
      btn.setAttribute("aria-label", label);
      btn.textContent = label;
      btn.addEventListener("click", () => {
        setTime(container, container.dataset.value === label ? "" : label);
      });
      container.appendChild(btn);
    });
    setTime(container, container.dataset.value);
  }

  function toast(text) {
    const el = $("#mtl-toast");
    el.textContent = text;
    el.classList.add("is-show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove("is-show"), 2400);
  }

  function readSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {};
    } catch (err) {
      return {};
    }
  }

  function writeSettings(patch) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.assign({}, readSettings(), patch)));
    } catch (err) {
      // 设置写不进去不影响主流程。
    }
  }

  function formatBytes(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024 * 1024) return Math.max(1, Math.round(size / 1024)) + " KB";
    return (size / 1024 / 1024).toFixed(size < 10 * 1024 * 1024 ? 1 : 0) + " MB";
  }

  // 备份时间：导出成功后写入，用于「我的 → 数据与备份」显示与到期提醒。
  function backupState() {
    const settings = readSettings();
    const lastAt = Date.parse(settings.lastBackupAt || "");
    return {
      lastAt: Number.isFinite(lastAt) ? lastAt : 0,
      nagAt: Number(settings.backupNagAt) || 0,
    };
  }

  function formatBackupAge(lastAt) {
    if (!lastAt) return "还没备份过";
    const days = Math.floor((Date.now() - lastAt) / 86400000);
    if (days <= 0) return "今天备份过";
    return "上次备份 " + days + " 天前";
  }

  // 申请持久化存储：降低浏览器空间紧张时清掉记录的概率；iOS 不支持该接口，失败也不影响使用。
  async function ensurePersistentStorage() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return;
      if (navigator.storage.persisted && (await navigator.storage.persisted())) return;
      await navigator.storage.persist();
    } catch (err) {
      // 没拿到持久化授权时按普通存储继续用。
    }
  }

  async function refreshBackupPanel() {
    const el = $("#mtl-backup-state");
    if (!el) return;
    const parts = [formatBackupAge(backupState().lastAt)];
    if (records.length) parts.push(records.length + " 条记录");
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        if (estimate && estimate.usage) parts.push("本机已用 " + formatBytes(estimate.usage));
      } catch (err) {
        // 拿不到用量就不显示。
      }
    }
    el.textContent = parts.join(" · ");
  }

  // 攒了记录又很久没备份，进「我的」提醒一次；7 天内不重复提醒。
  function maybeNagBackup() {
    if (records.length < 5) return;
    const state = backupState();
    if (state.lastAt && Date.now() - state.lastAt < 30 * 86400000) return;
    if (state.nagAt && Date.now() - state.nagAt < 7 * 86400000) return;
    writeSettings({ backupNagAt: Date.now() });
    toast("很久没备份了，去「我的 → 数据与备份」导出一份");
  }

  // 首次打开提示「添加到手机桌面」：只弹一次；已从桌面图标打开（standalone）就不再提示。
  function maybeShowInstallTip() {
    if (readSettings().installTipSeen) return;
    const standalone =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
    if (standalone) {
      writeSettings({ installTipSeen: true });
      return;
    }
    window.setTimeout(openInstallTip, 600);
  }

  function openInstallTip() {
    $("#mtl-install-tip").hidden = false;
    document.body.classList.add("mtl-modal-open");
  }

  function closeInstallTip() {
    $("#mtl-install-tip").hidden = true;
    document.body.classList.remove("mtl-modal-open");
    writeSettings({ installTipSeen: true });
  }

  function applyTheme(theme) {
    const key = THEMES[theme] ? theme : DEFAULT_THEME;
    document.body.dataset.theme = key;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEMES[key].color);
    $$("#mtl-themes [data-theme]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.theme === key);
    });
  }

  function readRecentNames() {
    const list = readSettings().recent;
    if (!Array.isArray(list)) return [];
    const seen = [];
    list.forEach((name) => {
      if (typeof name === "string" && name.trim() && seen.indexOf(name.trim()) === -1) {
        seen.push(name.trim());
      }
    });
    return seen.slice(0, 3);
  }

  function rememberName(name) {
    if (!name) return;
    const list = readSettings().recent;
    const history = Array.isArray(list) ? list.filter((item) => typeof item === "string") : [];
    const next = [name].concat(history.filter((item) => item !== name)).slice(0, 12);
    writeSettings({ recent: next });
  }

  function readCorrections() {
    const map = readSettings().corrections;
    if (!map || typeof map !== "object" || Array.isArray(map)) return {};
    return map;
  }

  function rememberCorrection(from, to) {
    if (!from || !to || from === to) return;
    const map = readCorrections();
    map[from] = to;
    const keys = Object.keys(map);
    if (keys.length > 20) delete map[keys[0]];
    writeSettings({ corrections: map });
  }

  /* ---------- 菜单库：本地补充 / 候选 / 搜索 ---------- */

  function brandNameById(id) {
    if (!window.MtlBrands) return "";
    const brand = window.MtlBrands.list.find((item) => item.id === id);
    return brand ? brand.name : "";
  }

  function readMenuAdd() {
    const map = readSettings().menuAdd;
    return map && typeof map === "object" && !Array.isArray(map) ? map : {};
  }

  // 手填过、但不在内置菜单里的名字，按品牌记在本机，下次搜索 / 候选能直接出现。
  function learnMenuItem(brandId, name) {
    const brand = String(brandId || "").trim();
    const label = String(name || "").trim();
    if (!brand || label.length < 2 || label.length > 30) return;
    if (window.MtlMenu && window.MtlMenu.matchName(label, brand)) return;
    const map = readMenuAdd();
    const list = Array.isArray(map[brand]) ? map[brand] : [];
    if (list.indexOf(label) >= 0) return;
    map[brand] = [label].concat(list).slice(0, 40);
    writeSettings({ menuAdd: map });
  }

  // 合并两类「你的名字」：记录里点过的 + 手填补充的。
  function menuExtras() {
    const map = new Map();
    records.forEach((record) => {
      const name = String(record.drinkName || "").trim();
      if (!name) return;
      const brand = brandOf(record.brand);
      const brandId = brand ? brand.id : "";
      const key = brandId + "|" + name;
      const entry = map.get(key) || {
        brandId,
        brandName: brand ? brand.name : "",
        name,
        count: 0,
      };
      entry.count += 1;
      map.set(key, entry);
    });
    const adds = readMenuAdd();
    Object.keys(adds).forEach((brandId) => {
      (adds[brandId] || []).forEach((name) => {
        const key = brandId + "|" + name;
        if (map.has(key)) return;
        map.set(key, {
          brandId,
          brandName: brandNameById(brandId),
          name,
          count: 0.5,
        });
      });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }

  function repeatCombo() {
    const map = new Map();
    records.forEach((record) => {
      const name = String(record.drinkName || "").trim();
      if (!name) return;
      const brand = brandOf(record.brand);
      const brandId = brand ? brand.id : "";
      const key = [brandId, name, record.sugar || "", record.ice || "", record.cupSize || ""].join("|");
      const entry = map.get(key) || {
        brandId,
        brandName: brand ? brand.name : "",
        name,
        sugar: record.sugar || "",
        ice: record.ice || "",
        cupSize: record.cupSize || "",
        price: Number.isFinite(record.price) ? record.price : null,
        count: 0,
      };
      entry.count += 1;
      map.set(key, entry);
    });
    const best = Array.from(map.values()).sort((a, b) => b.count - a.count)[0];
    return best && best.count >= 2 ? best : null;
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("这个浏览器不支持本地数据库"));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("date", "date", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("本地数据库打开失败"));
    });
    return dbPromise;
  }

  async function dbGetAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error("读取记录失败"));
    });
  }

  async function dbPut(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("保存记录失败"));
    });
  }

  async function dbDelete(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("删除记录失败"));
    });
  }

  async function dbClear() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("清空记录失败"));
    });
  }

  function sortRecords() {
    records.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function updateBadge() {
    $("#mtl-total-badge").textContent = records.length + " 杯";
  }

  const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  let heroThumb = { id: "", url: "" };

  function heroThumbOf(record) {
    if (!record) return "";
    if (heroThumb.id === record.id && heroThumb.url) return heroThumb.url;
    if (heroThumb.url) URL.revokeObjectURL(heroThumb.url);
    const blob = record.thumbBlob || record.photoBlob || null;
    heroThumb = { id: record.id, url: blob ? URL.createObjectURL(blob) : "" };
    return heroThumb.url;
  }

  function dayLabel(dateStr) {
    const raw = String(dateStr || "");
    if (!raw) return "";
    if (raw === dateKey(new Date())) return "今天";
    if (raw === dateKey(new Date(Date.now() - 86400000))) return "昨天";
    const date = new Date(raw + "T00:00:00");
    return Number.isFinite(date.getTime()) ? formatDay(date) : "";
  }

  function weekStartKey() {
    const now = new Date();
    const offset = (now.getDay() + 6) % 7; // 周一当一周开始
    return dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset));
  }

  // 首页只补一点「最近一杯」和「本周小结」，不抢快门。
  function renderHeroLast() {
    const btn = $("#mtl-hero-last");
    if (!btn) return;
    const record = records[0];
    if (!record) {
      btn.hidden = true;
      btn.dataset.id = "";
      if (heroThumb.url) {
        URL.revokeObjectURL(heroThumb.url);
        heroThumb = { id: "", url: "" };
      }
      return;
    }
    btn.hidden = false;
    btn.dataset.id = record.id;
    const img = $("#mtl-hero-last-photo");
    const url = heroThumbOf(record);
    if (url) {
      img.src = url;
      img.hidden = false;
    } else {
      img.removeAttribute("src");
      img.hidden = true;
    }
    $("#mtl-hero-last-name").textContent = record.drinkName || "未命名";
    $("#mtl-hero-last-meta").textContent = [record.brand, dayLabel(record.date)]
      .filter(Boolean)
      .join(" · ");
  }

  function renderHeroWeek() {
    const el = $("#mtl-hero-week");
    if (!el) return;
    if (!records.length) {
      el.hidden = true;
      return;
    }
    const start = weekStartKey();
    const week = records.filter((record) => String(record.date || "") >= start);
    el.hidden = false;
    if (!week.length) {
      el.textContent = "本周还没记录";
      return;
    }
    const top = Array.from(brandCounts(week).values()).sort((a, b) => b.count - a.count)[0];
    el.textContent = "本周 " + week.length + " 杯" + (top ? " · 最常 " + top.brand.name : "");
  }

  function renderHero() {
    const now = new Date();
    const hour = now.getHours();
    const hello = hour < 5 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
    const today = dateKey(now);
    const cups = records.filter((record) => record.date === today).length;
    $("#mtl-hero-date").textContent =
      now.getMonth() + 1 + " 月 " + now.getDate() + " 日 · " + WEEKDAYS[now.getDay()];
    $("#mtl-hero-hello").textContent = hello;
    $("#mtl-hero-state").textContent = cups ? "今天已记 " + cups + " 杯" : "今天还没有记录";
    renderHeroLast();
    renderHeroWeek();
  }

  function updateAll() {
    updateBadge();
    renderHero();
    renderArchive();
    if ($("#view-map").classList.contains("is-active")) renderMap();
    if ($("#view-me").classList.contains("is-active")) renderMe();
  }

  function switchView(name) {
    $$(".mtl-view").forEach((view) => {
      view.classList.toggle("is-active", view.id === "view-" + name);
    });
    $$(".mtl-tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.view === name);
    });
    document.body.classList.toggle("is-map-view", name === "map");
    if (name === "archive") renderArchive();
    if (name === "map") window.setTimeout(renderMap, 80);
    if (name === "me") renderMe();
  }

  function setStep(id, state) {
    const el = $("#mtl-step-" + id);
    if (!el) return;
    el.className = "mtl-step" + (state ? " is-" + state : "");
  }

  function resetSteps() {
    ["ai", "geo", "save"].forEach((id) => setStep(id, ""));
  }

  function setFormStatus(text, isError) {
    const el = $("#mtl-form-status");
    el.textContent = text || "";
    el.style.color = isError ? "var(--mtl-danger)" : "";
  }

  function noteWorking(text) {
    if (!pending || !text) return;
    if (!pending.messages.includes(text)) pending.messages.push(text);
    $("#mtl-working-hint").textContent = pending.messages.join("；");
  }

  function resetOptionalFields() {
    $("#mtl-brand").value = "";
    $("#mtl-price").value = "";
    $("#mtl-sugar").value = "";
    $("#mtl-ice").value = "";
    $("#mtl-cup").value = "";
    $("#mtl-toppings").value = "";
    setStars($("#mtl-rating"), 0);
    setMood($("#mtl-mood"), "");
    setTime($("#mtl-time"), "");
  }

  function clearPending() {
    resetVoice();
    if (pending && pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    if (pending && pending.stickerUrl) URL.revokeObjectURL(pending.stickerUrl);
    pending = null;
    $("#mtl-preview").removeAttribute("src");
    $("#mtl-confirm-photo").removeAttribute("src");
    $("#mtl-confirm-preview").classList.remove("is-sticker");
    $("#mtl-confirm-cutout").hidden = true;
    $("#mtl-capture-working").hidden = true;
    $("#mtl-confirm-card").hidden = true;
    $("#mtl-capture-empty").hidden = false;
    setFormStatus("");
    resetSteps();
  }

  function retake() {
    jobSeq += 1;
    clearPending();
  }

  // ---------- v0.18.0：语音备注（录音 / 播放 / 转文字） ----------

  function voiceUi() {
    return {
      toggle: $("#mtl-voice-toggle"),
      panel: $("#mtl-voice-panel"),
      record: $("#mtl-voice-record"),
      timer: $("#mtl-voice-timer"),
      stop: $("#mtl-voice-stop"),
      preview: $("#mtl-voice-preview"),
      audio: $("#mtl-voice-audio"),
      transcribe: $("#mtl-voice-transcribe"),
      redo: $("#mtl-voice-redo"),
      drop: $("#mtl-voice-drop"),
      status: $("#mtl-voice-status"),
    };
  }

  function setVoiceStatus(text) {
    voiceUi().status.textContent = text || "";
  }

  function clockText(seconds) {
    const total = Math.max(0, Math.round(seconds));
    return pad(Math.floor(total / 60)) + ":" + pad(total % 60);
  }

  // 转写结果只填进备注，不覆盖用户在录音前后自己敲的字。
  function applyVoiceText(text) {
    const cleaned = String(text || "").trim();
    if (!cleaned) return;
    const input = $("#mtl-note");
    const base = voiceBaseNote.trim();
    const current = input.value.trim();
    const next =
      current && current !== base
        ? current + " " + cleaned
        : base
          ? base + " " + cleaned
          : cleaned;
    input.value = next.slice(0, 200);
  }

  function resetVoice(options) {
    const keepPanel = Boolean(options && options.keepPanel);
    if (voiceSession) {
      voiceSession.cancel();
      voiceSession = null;
    }
    if (pending) {
      delete pending.voiceBlob;
      delete pending.voiceMime;
      delete pending.voiceSeconds;
    }
    voiceBaseNote = "";
    voiceLiveText = "";
    const ui = voiceUi();
    if (!ui.toggle) return;
    ui.panel.hidden = !keepPanel;
    ui.toggle.textContent = keepPanel ? "收起语音" : "语音说一句";
    ui.record.hidden = false;
    ui.record.disabled = false;
    ui.record.textContent = "点一下开始说";
    ui.timer.hidden = true;
    ui.timer.textContent = "00:00";
    ui.stop.hidden = true;
    ui.preview.hidden = true;
    ui.audio.removeAttribute("src");
    try {
      ui.audio.load();
    } catch (err) {
      /* 某些浏览器不支持 load，忽略 */
    }
    ui.transcribe.disabled = false;
    ui.transcribe.hidden = !voiceSttReady;
    setVoiceStatus("");
  }

  async function startVoice() {
    if (!window.MtlVoice || !window.MtlVoice.supported()) return;
    const ui = voiceUi();
    if (voiceSession) voiceSession.cancel();
    const liveOk = window.MtlVoice.dictationSupported();
    voiceBaseNote = $("#mtl-note").value.trim();
    voiceLiveText = "";
    ui.record.hidden = true;
    ui.preview.hidden = true;
    ui.stop.hidden = false;
    ui.timer.hidden = false;
    ui.timer.textContent = "00:00";
    setVoiceStatus("正在准备麦克风…");

    const session = window.MtlVoice.createSession({
      onTick(payload) {
        ui.timer.textContent = clockText(payload.elapsed);
      },
      onText(text) {
        voiceLiveText = (voiceLiveText ? voiceLiveText + " " : "") + text;
        const base = voiceBaseNote ? voiceBaseNote + " " : "";
        $("#mtl-note").value = (base + voiceLiveText).slice(0, 200);
      },
      onDone(payload) {
        if (pending) {
          pending.voiceBlob = payload.blob;
          pending.voiceMime = payload.mime;
          pending.voiceSeconds = payload.seconds;
        }
        ui.timer.hidden = true;
        ui.stop.hidden = true;
        ui.record.hidden = true;
        ui.preview.hidden = false;
        ui.audio.src = payload.url;
        if (voiceSttReady) {
          setVoiceStatus("语音收好了（" + payload.seconds + " 秒），可以转成文字，也可以直接保存");
        } else if (liveOk) {
          setVoiceStatus("语音收好了（" + payload.seconds + " 秒），文字已边说边转");
        } else {
          setVoiceStatus("语音收好了（" + payload.seconds + " 秒），会跟着记录一起保存");
        }
        logInfo("voice.recorded", {
          seconds: payload.seconds,
          bytes: payload.blob.size,
          mime: payload.mime,
          dictation: !voiceSttReady && liveOk,
        });
      },
      onError(message) {
        ui.record.hidden = false;
        ui.record.textContent = "点一下开始说";
        ui.stop.hidden = true;
        ui.timer.hidden = true;
        setVoiceStatus(message || "没录上，再试一次");
      },
    });
    voiceSession = session;
    try {
      await session.start({ dictation: !voiceSttReady && liveOk });
    } catch (err) {
      voiceSession = null;
      ui.record.hidden = false;
      ui.stop.hidden = true;
      ui.timer.hidden = true;
      setVoiceStatus("打不开麦克风，检查一下浏览器权限");
      logWarn("voice.start_failed", { message: String((err && err.message) || err).slice(0, 120) });
      return;
    }
    if (voiceSttReady) setVoiceStatus("说完点「说完，停」，再点转成文字");
    else if (liveOk) setVoiceStatus("边说边转，说完点「说完，停」");
    else setVoiceStatus("这台手机不支持转文字，语音会完整保留");
  }

  async function transcribeVoice() {
    if (!voiceSession) return;
    const ui = voiceUi();
    const started = Date.now();
    ui.transcribe.disabled = true;
    setVoiceStatus("正在转成文字…");
    try {
      const text = await voiceSession.transcribe();
      applyVoiceText(text);
      setVoiceStatus("转好了，文字可以在这上面改");
      logInfo("voice.transcribed", { chars: text.length, ms: Date.now() - started });
    } catch (err) {
      setVoiceStatus((err && err.message) || "转文字没成功，语音已经留着");
      logWarn("voice.transcribe_failed", {
        message: String((err && err.message) || err).slice(0, 120),
        ms: Date.now() - started,
      });
    } finally {
      ui.transcribe.disabled = false;
    }
  }

  function initVoiceControls() {
    const ui = voiceUi();
    if (!ui.toggle) return;
    if (!window.MtlVoice || !window.MtlVoice.supported()) {
      ui.toggle.hidden = true;
      return;
    }
    window.MtlVoice.sttReady().then((ready) => {
      voiceSttReady = ready;
      ui.transcribe.hidden = !ready;
    });
    ui.toggle.addEventListener("click", () => {
      ui.panel.hidden = !ui.panel.hidden;
      ui.toggle.textContent = ui.panel.hidden ? "语音说一句" : "收起语音";
      if (!ui.panel.hidden) ui.panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    ui.record.addEventListener("click", startVoice);
    ui.stop.addEventListener("click", () => {
      if (voiceSession) voiceSession.stop();
    });
    ui.redo.addEventListener("click", () => {
      resetVoice({ keepPanel: true });
      startVoice();
    });
    ui.drop.addEventListener("click", () => {
      resetVoice({ keepPanel: true });
      setVoiceStatus("语音删掉了，这条只留文字");
    });
    ui.transcribe.addEventListener("click", transcribeVoice);
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("这张图浏览器读不了，换 JPG / PNG 试试"));
      };
      img.src = url;
    });
  }

  function resizeToBlob(img, maxEdge, quality) {
    return new Promise((resolve, reject) => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) {
        reject(new Error("图片尺寸读不到"));
        return;
      }
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fffaf4";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("图片压缩失败"))),
        "image/jpeg",
        quality
      );
    });
  }

  // 只读文件头，足够覆盖 JPEG 的 EXIF 段；读不到就当没有。
  const EXIF_HEAD_BYTES = 512 * 1024;

  function readExifTakenAt(text) {
    const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(text || "").trim());
    if (!match) return null;
    const value = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6])
    );
    return Number.isFinite(value.getTime()) ? value : null;
  }

  // 解析 JPEG 里的 EXIF：拍摄地经纬度 + 拍摄时间。
  // 只在浏览器本地读，照片和元数据都不外传；不支持的格式（如 HEIC）直接返回 null。
  function parseExifBuffer(buffer) {
    const data = new Uint8Array(buffer);
    if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
    const view = new DataView(buffer);

    let offset = 2;
    let tiff = -1;
    while (offset + 4 <= data.length) {
      if (data[offset] !== 0xff) break;
      const marker = data[offset + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) break;
      const size = view.getUint16(offset + 2, false);
      if (size < 2) break;
      const isExif =
        marker === 0xe1 &&
        offset + 10 <= data.length &&
        data[offset + 4] === 0x45 &&
        data[offset + 5] === 0x78 &&
        data[offset + 6] === 0x69 &&
        data[offset + 7] === 0x66;
      if (isExif) {
        tiff = offset + 10;
        break;
      }
      offset += 2 + size;
    }
    if (tiff < 0 || tiff + 8 > data.length) return null;

    const little = data[tiff] === 0x49 && data[tiff + 1] === 0x49;
    const big = data[tiff] === 0x4d && data[tiff + 1] === 0x4d;
    if (!little && !big) return null;
    if (view.getUint16(tiff + 2, little) !== 42) return null;

    const u16 = (at) => (at >= 0 && at + 2 <= data.length ? view.getUint16(at, little) : 0);
    const u32 = (at) => (at >= 0 && at + 4 <= data.length ? view.getUint32(at, little) : 0);

    function readIfd(ifdOffset) {
      const entries = {};
      const start = tiff + ifdOffset;
      const count = u16(start);
      for (let i = 0; i < count; i += 1) {
        const entry = start + 2 + i * 12;
        if (entry + 12 > data.length) break;
        entries[u16(entry)] = entry;
      }
      return entries;
    }

    function ascii(entry) {
      const count = u32(entry + 4);
      const inline = count * 1 <= 4;
      const at = inline ? entry + 8 : tiff + u32(entry + 8);
      if (at < 0 || at >= data.length) return "";
      let text = "";
      const limit = Math.min(count, 32, data.length - at);
      for (let i = 0; i < limit; i += 1) {
        const code = data[at + i];
        if (code === 0) break;
        text += String.fromCharCode(code);
      }
      return text;
    }

    function rationals(entry) {
      const count = u32(entry + 4);
      const at = tiff + u32(entry + 8);
      const values = [];
      for (let i = 0; i < Math.min(count, 3); i += 1) {
        const base = at + i * 8;
        const num = u32(base);
        const den = u32(base + 4);
        values.push(den ? num / den : 0);
      }
      return values;
    }

    function coordinate(parts, ref) {
      if (parts.length < 3) return null;
      const value = parts[0] + parts[1] / 60 + parts[2] / 3600;
      const mark = String(ref || "").toUpperCase();
      if (mark === "S" || mark === "W") return -value;
      return value === 0 ? null : value;
    }

    const result = { lat: null, lng: null, takenAt: null };
    try {
      const ifd0 = readIfd(u32(tiff + 4));
      if (ifd0[0x8825]) {
        const gps = readIfd(u32(ifd0[0x8825] + 8));
        if (gps[2] && gps[1]) result.lat = coordinate(rationals(gps[2]), ascii(gps[1]));
        if (gps[4] && gps[3]) result.lng = coordinate(rationals(gps[4]), ascii(gps[3]));
      }
      if (ifd0[0x8769]) {
        const exifIfd = readIfd(u32(ifd0[0x8769] + 8));
        if (exifIfd[0x9003]) result.takenAt = readExifTakenAt(ascii(exifIfd[0x9003]));
      }
      if (!result.takenAt && ifd0[0x0132]) {
        result.takenAt = readExifTakenAt(ascii(ifd0[0x0132]));
      }
    } catch (err) {
      return null;
    }

    if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng)) {
      result.lat = null;
      result.lng = null;
    }
    return result;
  }

  async function readExif(file) {
    try {
      const head = file.slice(0, EXIF_HEAD_BYTES);
      const buffer = await head.arrayBuffer();
      return parseExifBuffer(buffer);
    } catch (err) {
      return null;
    }
  }

  async function prepareImages(file) {
    const img = await loadImage(file);
    const photo = await resizeToBlob(img, PHOTO_EDGE, 0.82);
    const thumb = await resizeToBlob(img, THUMB_EDGE, 0.78);
    return { photo, thumb };
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        (error) => {
          if (error && error.code === 1) reject(new Error("定位权限被拒绝"));
          else reject(new Error("没拿到定位"));
        },
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  async function runGeo(job) {
    setStep("geo", "active");
    const started = Date.now();
    const fromExif = pending && pending.geoSource === "exif";

    if (!fromExif) {
      if (!window.isSecureContext) {
        if (!pending || job !== jobSeq) return;
        pending.geoState = "insecure";
        setStep("geo", "warn");
        noteWorking("当前不是 HTTPS，定位不可用，可手填城市 / 区");
        logWarn("geo.skipped", { reason: "not-secure", ms: Date.now() - started });
        return;
      }
      if (!navigator.geolocation) {
        pending.geoState = "error";
        pending.geoError = "这个浏览器不支持定位";
        setStep("geo", "warn");
        noteWorking(pending.geoError);
        logWarn("geo.failed", { reason: "unsupported", ms: Date.now() - started });
        return;
      }

      try {
        const position = await getPosition();
        if (!pending || job !== jobSeq) return;
        pending.lat = position.coords.latitude;
        pending.lng = position.coords.longitude;
        noteWorking("位置已拿到，正在查城市 / 区…");
      } catch (err) {
        if (!pending || job !== jobSeq) return;
        pending.geoState = "error";
        pending.geoError = err.message || "没拿到定位，可手填城市 / 区";
        setStep("geo", "warn");
        noteWorking(pending.geoError);
        logWarn("geo.failed", {
          source: "device",
          message: pending.geoError,
          ms: Date.now() - started,
        });
        return;
      }
    } else {
      noteWorking("按照片拍摄地查城市 / 区…");
    }

    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: pending.lat, lng: pending.lng }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "地址服务暂时不可用");
      }
      if (!pending || job !== jobSeq) return;
      pending.city = data.city || "";
      pending.district = data.district || "";
      pending.geoState = fromExif ? "exif" : "done";
      setStep("geo", "done");
      logInfo("geo.ok", {
        source: fromExif ? "exif" : "device",
        city: pending.city,
        district: pending.district,
        ms: Date.now() - started,
      });
    } catch (err) {
      if (!pending || job !== jobSeq) return;
      pending.geoState = "error";
      pending.geoError = fromExif
        ? "拍摄地查不到城市 / 区，可手填"
        : err.message || "没拿到定位，可手填城市 / 区";
      setStep("geo", "warn");
      noteWorking(pending.geoError);
      logWarn("geo.failed", {
        source: fromExif ? "exif" : "device",
        message: pending.geoError,
        ms: Date.now() - started,
      });
    }
  }

  async function runAi(job) {
    setStep("ai", "active");
    if (!pending || !pending.photoBlob) return;
    const started = Date.now();
    try {
      const result = await window.MtlRecognize.recognize(pending.photoBlob);
      if (!pending || job !== jobSeq) return;
      pending.aiState = "ok";
      const rawName = String(result.drinkName || "").trim();
      const rawBrand = String(result.brand || "").trim();
      const brandHit = brandOf(rawBrand);
      const fixed = rawName ? readCorrections()[rawName] : "";
      // 菜单对齐：去掉杯型 / 冰量 / 括号等噪声，命中就填标准写法。
      const menuHit =
        rawName && window.MtlMenu
          ? window.MtlMenu.matchName(rawName, brandHit ? brandHit.id : "", menuExtras())
          : null;
      const aligned = menuHit ? menuHit.name : rawName;
      pending.aiRawName = rawName;
      pending.drinkName = fixed || aligned;
      pending.autoFixed = Boolean(fixed && fixed !== rawName);
      pending.menuAligned = Boolean(!fixed && aligned && aligned !== rawName);
      pending.brand = rawBrand;
      pending.brandConfidence = Number(result.brandConfidence);
      if (!Number.isFinite(pending.brandConfidence)) {
        pending.brandConfidence = pending.brand ? 0.5 : 0;
      }
      // AI 只认出名字、没认出品牌时，用菜单里的品牌补上（确定性低，仍可改）。
      if (!rawBrand && menuHit && menuHit.brandId) {
        pending.brand = menuHit.brandName || brandNameById(menuHit.brandId);
        pending.brandConfidence = 0.4;
      }
      pending.category = result.category || "";
      const priceHintRaw = Number(result.priceHint);
      pending.priceHint =
        Number.isFinite(priceHintRaw) && priceHintRaw > 0 && priceHintRaw <= 100
          ? Math.round(priceHintRaw * 10) / 10
          : 0;
      pending.confidence = Number(result.confidence);
      if (!Number.isFinite(pending.confidence)) pending.confidence = 0.5;
      setStep("ai", pending.drinkName ? "done" : "warn");
      logInfo("ai.ok", {
        name: pending.drinkName,
        rawName,
        brand: pending.brand,
        brandConfidence: pending.brandConfidence,
        category: pending.category,
        priceHint: pending.priceHint,
        confidence: pending.confidence,
        autoFixed: pending.autoFixed,
        mock: Boolean(result.mock),
        ms: Date.now() - started,
      });
    } catch (err) {
      if (!pending || job !== jobSeq) return;
      pending.aiState = "error";
      pending.aiError = err.message || "识别暂时不可用";
      setStep("ai", "warn");
      noteWorking(pending.aiError);
      logWarn("ai.failed", {
        code: err.code || "",
        message: pending.aiError,
        ms: Date.now() - started,
      });
    }
  }

  async function runCutout(job) {
    if (!pending || !pending.photoBlob || !window.MtlRecognize) return;
    if (typeof window.MtlRecognize.cutout !== "function") return;
    const started = Date.now();
    try {
      const raw = await window.MtlRecognize.cutout(pending.photoBlob);
      if (!pending || job !== jobSeq) return;
      pending.stickerBlob = await addWhiteOutline(raw);
      pending.cutoutState = "done";
      renderConfirmPhoto();
      noteWorking("贴纸已生成");
      logInfo("cutout.ok", { bytesIn: raw.size, bytesOut: pending.stickerBlob.size, ms: Date.now() - started });
    } catch (err) {
      // 抠图是可选项：没配 Key / 超时 / 失败都不阻塞记录。
      if (pending && job === jobSeq) {
        pending.cutoutState = "skipped";
        renderConfirmPhoto();
      }
      console.info("[mtl] cutout skipped", err && err.code ? err.code : String(err));
      logWarn("cutout.skipped", {
        code: (err && err.code) || "",
        message: String((err && err.message) || err || "").slice(0, 160),
        ms: Date.now() - started,
      });
    }
  }

  // 确认卡预览：抠图完成后当场换成透明贴纸，未完成时先显示原图并标注「抠图中」。
  function renderConfirmPhoto() {
    if (!pending) return;
    const wrap = $("#mtl-confirm-preview");
    const img = $("#mtl-confirm-photo");
    const badge = $("#mtl-confirm-cutout");
    const hasSticker = Boolean(pending.stickerBlob);
    if (hasSticker && !pending.stickerUrl) {
      pending.stickerUrl = URL.createObjectURL(pending.stickerBlob);
    }
    img.src = hasSticker ? pending.stickerUrl : pending.previewUrl;
    wrap.classList.toggle("is-sticker", hasSticker);
    badge.hidden = hasSticker || pending.cutoutState !== "pending";
  }

  async function handleFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast("请选择图片文件");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast("图片超过 20MB，换一张");
      return;
    }

    logInfo("photo.picked", {
      bytes: file.size,
      type: file.type || "",
      ext: String(file.name || "").split(".").pop().slice(0, 8),
    });

    clearPending();
    const job = ++jobSeq;
    pending = {
      job,
      t0: Date.now(),
      previewUrl: URL.createObjectURL(file),
      messages: [],
      aiState: "pending",
      geoState: "pending",
      drinkName: "",
      aiRawName: "",
      autoFixed: false,
      menuAligned: false,
      brand: "",
      category: "",
      priceHint: 0,
      priceApprox: false,
      confidence: 0,
      city: "",
      district: "",
      lat: null,
      lng: null,
      geoSource: "device",
      takenAt: null,
      stickerBlob: null,
      stickerUrl: null,
      cutoutState: "pending",
    };

    // 先看照片自带的拍摄地 / 拍摄时间，有就用它，没有才退回当前定位。
    const exif = await readExif(file);
    if (!pending || job !== jobSeq) return;
    if (exif) {
      if (Number.isFinite(exif.lat) && Number.isFinite(exif.lng)) {
        pending.lat = exif.lat;
        pending.lng = exif.lng;
        pending.geoSource = "exif";
      }
      if (exif.takenAt && exif.takenAt.getTime() <= Date.now()) {
        pending.takenAt = exif.takenAt;
      }
    }
    logInfo("exif.parsed", {
      found: Boolean(exif),
      geo: pending.geoSource === "exif",
      takenDate: pending.takenAt ? dateKey(pending.takenAt) : "",
      ms: Date.now() - pending.t0,
    });

    $("#mtl-capture-empty").hidden = true;
    $("#mtl-capture-working").hidden = false;
    $("#mtl-confirm-card").hidden = true;
    $("#mtl-preview").src = pending.previewUrl;
    $("#mtl-working-hint").textContent = "正在压缩照片…";
    setStep("ai", "active");
    setStep("geo", "active");

    const geoPromise = runGeo(job);

    let images;
    try {
      images = await prepareImages(file);
    } catch (err) {
      if (job !== jobSeq) return;
      logWarn("photo.compress_failed", {
        message: String((err && err.message) || err || "").slice(0, 160),
        ms: Date.now() - pending.t0,
      });
      toast(err.message || "图片处理失败");
      clearPending();
      return;
    }
    if (!pending || job !== jobSeq) return;

    pending.photoBlob = images.photo;
    pending.thumbBlob = images.thumb;
    logInfo("photo.compressed", {
      bytes: images.photo.size,
      thumbBytes: images.thumb.size,
      ms: Date.now() - pending.t0,
    });
    const photoUrl = URL.createObjectURL(images.photo);
    URL.revokeObjectURL(pending.previewUrl);
    pending.previewUrl = photoUrl;
    $("#mtl-preview").src = photoUrl;

    noteWorking("照片已压缩，开始识别…");
    const aiPromise = runAi(job);
    runCutout(job);
    await Promise.allSettled([aiPromise, geoPromise]);
    if (!pending || job !== jobSeq) return;
    finishPending();
  }

  // 捕获页候选：老样子 / 这家的常见款 / 你的常点，点一下就能填好。
  function renderSuggestions() {
    const wrap = $("#mtl-recent-wrap");
    const box = $("#mtl-recent-chips");
    const label = $("#mtl-recent-label");
    if (!wrap || !box || !pending) return;

    const brandInput = $("#mtl-brand");
    const brandText = (brandInput && brandInput.value.trim()) || pending.brand || "";
    const brand = brandOf(brandText);
    const brandId = brand ? brand.id : "";
    const extras = menuExtras();
    const items = [];

    const repeat = repeatCombo();
    // 品牌已经填了、但和老样子的品牌不一致时，不推「老样子」。
    if (repeat && (!brandId || !repeat.brandId || repeat.brandId === brandId)) {
      items.push(Object.assign({ kind: "repeat" }, repeat));
    }

    if (window.MtlMenu) {
      window.MtlMenu.suggest({ brand: brandId, extras, limit: 5 }).forEach((item) => {
        if (repeat && item.brandId === repeat.brandId && item.name === repeat.name) return;
        items.push(
          Object.assign({ kind: item.count >= 1 ? "history" : "menu" }, item, {
            brandName: item.brandName || brandNameById(item.brandId),
          })
        );
      });
    }

    const list = items.slice(0, 6);
    box.textContent = "";
    wrap.hidden = list.length === 0;
    if (label) {
      label.textContent =
        brandId && window.MtlMenu && window.MtlMenu.hasBrand(brandId)
          ? brand.name + " 的常见款"
          : "猜你想喝";
    }

    list.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mtl-chip mtl-suggest-chip" + (item.kind === "repeat" ? " is-best" : "");
      btn.dataset.name = item.name || "";
      btn.dataset.brand = item.brandName || "";
      btn.dataset.kind = item.kind;
      btn.dataset.sugar = item.sugar || "";
      btn.dataset.ice = item.ice || "";
      btn.dataset.cup = item.cupSize || "";
      btn.dataset.price = Number.isFinite(item.price) ? String(item.price) : "";
      if (item.kind === "repeat") btn.textContent = "老样子 · " + item.name;
      else if (item.kind === "history") btn.textContent = "常点 · " + item.name;
      else btn.textContent = item.name + (item.price ? " · 约 ¥" + Math.round(item.price) : "");
      btn.title = [item.brandName, item.name].filter(Boolean).join(" · ");
      box.appendChild(btn);
    });
  }

  function applySuggestion(item) {
    const nameInput = $("#mtl-drink-name");
    const brandInput = $("#mtl-brand");
    if (!nameInput || !item || !item.name) return;
    nameInput.value = item.name;

    if (item.brandName && brandInput && !brandInput.value.trim()) {
      brandInput.value = item.brandName;
      renderBrandPicker($("#mtl-brand-chips"), brandInput, pending ? pending.brand : "");
      syncBrandChipState($("#mtl-brand-chips"), brandInput);
    }
    if (item.kind === "repeat") {
      $("#mtl-sugar").value = item.sugar || "";
      $("#mtl-ice").value = item.ice || "";
      $("#mtl-cup").value = item.cupSize || "";
      if (Number.isFinite(item.price) && item.price > 0) {
        $("#mtl-price").value = String(item.price);
        $("#mtl-price").hidden = false;
        $("#mtl-price-manual-toggle").textContent = "收起";
        if (pending) pending.priceApprox = false;
      }
    }
    renderPriceChips();
    renderSuggestions();
    setFormStatus("");
    logInfo("menu.pick", {
      kind: item.kind || "",
      name: item.name,
      brand: item.brandName || "",
    });
  }

  function renderMenuRow(box, entry, isHistory) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mtl-menu-row";
    const badge = entry.brandName ? brandBadge(entry.brandName, "sm") : null;
    if (badge) btn.appendChild(badge);
    const name = document.createElement("span");
    name.className = "mtl-menu-row-name";
    name.textContent = entry.name;
    btn.appendChild(name);
    const meta = document.createElement("span");
    meta.className = "mtl-menu-row-meta";
    const bits = [];
    if (entry.brandName) bits.push(entry.brandName);
    if (isHistory && entry.count >= 1) bits.push("你点过 " + Math.round(entry.count) + " 次");
    else if (entry.price) bits.push("约 ¥" + Math.round(entry.price));
    meta.textContent = bits.join(" · ");
    btn.appendChild(meta);
    btn.addEventListener("click", () => {
      applySuggestion({ kind: "menu", name: entry.name, brandName: entry.brandName || "" });
      closeMenuSearch();
      logInfo("menu.search_pick", { name: entry.name, brand: entry.brandName || "" });
    });
    box.appendChild(btn);
  }

  function renderMenuGroup(box, text) {
    const title = document.createElement("p");
    title.className = "mtl-menu-group";
    title.textContent = text;
    box.appendChild(title);
  }

  function renderMenuSearch(query) {
    const box = $("#mtl-menu-search-list");
    if (!box || !window.MtlMenu) return;
    const q = String(query || "").trim();
    const extras = menuExtras();
    box.textContent = "";

    if (!q) {
      const recent = extras.slice(0, 8);
      if (recent.length) {
        renderMenuGroup(box, "你常点的");
        recent.forEach((entry) => renderMenuRow(box, entry, true));
      }
      const popular = window.MtlMenu.popular(10);
      if (popular.length) {
        renderMenuGroup(box, "各家常点的");
        popular.forEach((entry) => renderMenuRow(box, entry, false));
      }
      return;
    }

    const results = window.MtlMenu.search(q, { extras, limit: 24 });
    if (!results.length) {
      const empty = document.createElement("p");
      empty.className = "mtl-empty";
      empty.textContent = "菜单里没找到，直接手写「" + q + "」也行。";
      box.appendChild(empty);
      return;
    }
    results.forEach((entry) => renderMenuRow(box, entry, entry.source === "history"));
  }

  function openMenuSearch() {
    if (!window.MtlMenu) {
      toast("菜单库没加载，直接手写也行");
      return;
    }
    $("#mtl-menu-search").hidden = false;
    document.body.classList.add("mtl-modal-open");
    $("#mtl-menu-search-input").value = "";
    renderMenuSearch("");
    window.setTimeout(() => $("#mtl-menu-search-input").focus(), 30);
  }

  function closeMenuSearch() {
    $("#mtl-menu-search").hidden = true;
    if ($("#mtl-share").hidden && $("#mtl-detail").hidden && $("#mtl-brand-more").hidden) {
      document.body.classList.remove("mtl-modal-open");
    }
  }

  function recentPlaces() {
    const list = [];
    records.forEach((record) => {
      const city = String(record.city || "").trim();
      if (!city) return;
      const district = String(record.district || "").trim();
      const key = city + "|" + district;
      if (list.some((item) => item.key === key)) return;
      list.push({ key, city, district });
    });
    return list.slice(0, 3);
  }

  function renderPlaceChips() {
    const places = recentPlaces();
    const wrap = $("#mtl-place-wrap");
    const box = $("#mtl-place-chips");
    box.textContent = "";
    wrap.hidden = places.length === 0;
    places.forEach((place) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mtl-chip";
      btn.textContent = [place.city, place.district].filter(Boolean).join(" · ");
      btn.dataset.city = place.city;
      btn.dataset.district = place.district;
      box.appendChild(btn);
    });
  }

  // ---------- 城市选择器：点城市输入框 → 弹层里滑动挑 / 搜索 / 一键定位 ----------
  const CITY_CACHE_KEY = "mtl:cities:v1";
  const CITY_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
  const HOT_CITIES = ["北京市", "上海市", "广州市", "深圳市", "杭州市", "成都市", "南京市", "武汉市", "西安市", "重庆市", "长沙市", "苏州市"];

  const cityPicker = { cityInput: null, districtInput: null, provinces: null, loading: null };

  function readCityCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CITY_CACHE_KEY) || "null");
      if (!raw || !Array.isArray(raw.provinces) || !raw.provinces.length) return null;
      if (Date.now() - Number(raw.at || 0) > CITY_CACHE_TTL) return null;
      return raw.provinces;
    } catch (err) {
      return null;
    }
  }

  function writeCityCache(provinces) {
    try {
      localStorage.setItem(CITY_CACHE_KEY, JSON.stringify({ at: Date.now(), provinces }));
    } catch (err) {
      logWarn("city.cache-failed", { message: String(err && err.message) });
    }
  }

  function loadCities() {
    if (cityPicker.provinces) return Promise.resolve(cityPicker.provinces);
    const cached = readCityCache();
    if (cached) {
      cityPicker.provinces = cached;
      return Promise.resolve(cached);
    }
    if (!cityPicker.loading) {
      cityPicker.loading = fetch("/api/cities", { headers: { Accept: "application/json" } })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || "城市列表暂时拿不到");
          return Array.isArray(data.provinces) ? data.provinces : [];
        })
        .then((provinces) => {
          if (!provinces.length) throw new Error("城市列表暂时拿不到");
          cityPicker.provinces = provinces;
          writeCityCache(provinces);
          return provinces;
        })
        .finally(() => {
          cityPicker.loading = null;
        });
    }
    return cityPicker.loading;
  }

  function setCityStatus(text) {
    const el = $("#mtl-city-status");
    if (el) el.textContent = text;
  }

  function renderHotCities() {
    const box = $("#mtl-city-hot");
    box.textContent = "";
    HOT_CITIES.forEach((name) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mtl-chip";
      btn.textContent = name;
      btn.dataset.city = name;
      box.appendChild(btn);
    });
  }

  function renderCityList(keyword) {
    const box = $("#mtl-city-list");
    const provinces = cityPicker.provinces || [];
    const raw = String(keyword || "").trim();
    const key = raw.replace(/市$/, "");
    const current = cityPicker.cityInput ? cityPicker.cityInput.value : "";
    box.textContent = "";

    let count = 0;
    provinces.forEach((province) => {
      const matched = province.cities.filter(
        (name) => !key || name.indexOf(key) >= 0 || province.name.indexOf(key) >= 0
      );
      matched.forEach((name) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mtl-city-item" + (name === current ? " is-active" : "");
        btn.dataset.city = name;
        btn.setAttribute("role", "option");
        const label = document.createElement("span");
        label.textContent = name;
        const sub = document.createElement("em");
        sub.textContent = province.name;
        btn.appendChild(label);
        btn.appendChild(sub);
        box.appendChild(btn);
        count += 1;
      });
    });

    if (!count) {
      const empty = document.createElement("p");
      empty.className = "mtl-city-empty";
      empty.textContent = key ? "没找到「" + raw + "」，可以换个写法或直接手填" : "城市列表还没加载出来";
      box.appendChild(empty);
    }
  }

  function openCityPicker(cityInput, districtInput) {
    cityPicker.cityInput = cityInput;
    cityPicker.districtInput = districtInput;
    $("#mtl-city-search").value = "";
    $("#mtl-city-manual").value = "";
    $("#mtl-city-manual").hidden = true;
    $("#mtl-city-manual-toggle").textContent = "找不到？手填城市";
    $("#mtl-city-sheet").hidden = false;
    document.body.classList.add("mtl-modal-open");
    renderHotCities();
    renderCityList("");
    if (cityPicker.provinces) {
      setCityStatus("");
    } else {
      setCityStatus("正在加载城市列表…");
      loadCities()
        .then(() => {
          // 别把「正在定位 / 已定位」的提示冲掉
          if ($("#mtl-city-status").textContent === "正在加载城市列表…") setCityStatus("");
          renderCityList($("#mtl-city-search").value);
        })
        .catch((err) => {
          setCityStatus(err.message || "城市列表暂时拿不到，可以直接手填");
          logWarn("city.list-failed", { message: String(err && err.message) });
        });
    }

    // 城市还空着就先自动定位一次，省得用户自己找。
    if (!cityInput.value.trim()) locateCity();
  }

  function closeCityPicker() {
    $("#mtl-city-sheet").hidden = true;
    cityPicker.cityInput = null;
    cityPicker.districtInput = null;
    if ($("#mtl-share").hidden && $("#mtl-detail").hidden) {
      document.body.classList.remove("mtl-modal-open");
    }
  }

  function chooseCity(name) {
    const input = cityPicker.cityInput;
    if (!input || !name) return;
    const previous = input.value.trim();
    input.value = name;
    const district = cityPicker.districtInput;
    if (previous && previous !== name && district && district.value.trim()) {
      // 换了城市，原来的区多半对不上，清掉让用户重填。
      district.value = "";
    }
    logInfo("city.picked", { city: name, changed: Boolean(previous && previous !== name) });
    closeCityPicker();
  }

  async function locateCity() {
    const btn = $("#mtl-city-locate");
    if (!window.isSecureContext) {
      setCityStatus("当前不是 HTTPS，定位不可用，可以搜索城市");
      return;
    }
    if (!navigator.geolocation) {
      setCityStatus("这个浏览器不支持定位，可以搜索城市");
      return;
    }

    btn.disabled = true;
    setCityStatus("正在定位…");
    try {
      const position = await getPosition();
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: position.coords.latitude, lng: position.coords.longitude }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "地址服务暂时不可用");
      if (data.city && cityPicker.cityInput) cityPicker.cityInput.value = data.city;
      if (data.district && cityPicker.districtInput) cityPicker.districtInput.value = data.district;
      const label = [data.city, data.district].filter(Boolean).join(" · ") || "已定位";
      setCityStatus("已按当前位置填好：" + label);
      renderCityList($("#mtl-city-search").value);
      logInfo("city.located", { city: data.city, district: data.district });
    } catch (err) {
      setCityStatus(err.message || "没拿到定位，可以搜索城市");
      logWarn("city.locate-failed", { message: String(err && err.message) });
    } finally {
      btn.disabled = false;
    }
  }

  function finishPending() {
    if (!pending) return;
    setStep("save", "done");
    $("#mtl-capture-working").hidden = true;
    $("#mtl-confirm-card").hidden = false;
    renderConfirmPhoto();
    $("#mtl-drink-name").value = pending.drinkName || "";
    $("#mtl-city").value = pending.city || "";
    $("#mtl-district").value = pending.district || "";
    $("#mtl-note").value = "";
    resetOptionalFields();
    $("#mtl-brand").value = pending.brand || "";
    $("#mtl-brand").hidden = true;
    $("#mtl-brand-manual-toggle").textContent = "手填";
    renderBrandPicker($("#mtl-brand-chips"), $("#mtl-brand"), pending.brand || "");
    pending.priceApprox = false;
    $("#mtl-price").hidden = true;
    $("#mtl-price-manual-toggle").textContent = "手填";
    renderPriceChips();
    renderSuggestions();
    renderPlaceChips();
    const dateInput = $("#mtl-date");
    dateInput.max = dateKey(new Date());
    dateInput.value = dateKey(pending.takenAt || new Date());
    setTime($("#mtl-time"), timeByHour(pending.takenAt || new Date()));

    const badge = $("#mtl-ai-badge");
    const hints = [];
    badge.hidden = false;

    if (pending.aiState === "ok") {
      if (!pending.drinkName) {
        badge.textContent = "AI 没认出来";
        hints.push(
          pending.brand
            ? "下面有 " + pending.brand + " 的常见款，点一个就好，也可以手写"
            : "可以手动写饮品名，不影响保存"
        );
      } else if (pending.autoFixed) {
        badge.textContent = "按你的习惯";
        hints.push("已按你上次的改法填好");
      } else if (pending.menuAligned) {
        badge.textContent = "AI 已填";
        hints.push("已对齐成菜单里的写法，看一眼");
      } else if (pending.confidence >= 0.8) {
        badge.textContent = "AI 已填";
        hints.push("看一眼，不对就改");
      } else {
        badge.textContent = "AI 猜的";
        hints.push("不太确定，点一下可以改");
      }
    } else {
      badge.textContent = "识别没成功";
      hints.push(pending.aiError || "手动写饮品名也能存");
    }

    if (pending.geoState === "exif") {
      hints.push("按照片拍摄地：" + ([pending.city, pending.district].filter(Boolean).join(" · ") || "已获取"));
    } else if (pending.geoState === "done") {
      hints.push("按当前位置：" + ([pending.city, pending.district].filter(Boolean).join(" · ") || "已获取"));
    } else if (pending.geoState === "insecure") {
      hints.push("当前不是 HTTPS，定位不可用");
    } else if (pending.geoState === "error") {
      hints.push(pending.geoError || "没拿到定位，可手填城市 / 区");
    }
    if (pending.takenAt) {
      hints.push("拍摄于 " + formatDay(pending.takenAt));
    }
    if (pending.priceHint > 0) {
      hints.push("价格按常见价估了一下，点一下就行");
    }

    $("#mtl-ai-hint").textContent = hints.join("；");
    setFormStatus("");
    $("#mtl-confirm-card").scrollIntoView({ behavior: "smooth", block: "start" });
    logInfo("confirm.shown", {
      name: pending.drinkName,
      city: pending.city,
      district: pending.district,
      aiState: pending.aiState,
      geoState: pending.geoState,
      cutout: pending.cutoutState,
      takenDate: pending.takenAt ? dateKey(pending.takenAt) : "",
      totalMs: pending.t0 ? Date.now() - pending.t0 : 0,
    });
  }

  function readPrice(input) {
    const raw = String(input.value || "").trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return NaN;
    return Math.round(value * 100) / 100;
  }

  function putOptional(target, key, value) {
    if (value === "" || value === null || value === undefined) delete target[key];
    else target[key] = value;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const started = Date.now();
    if (!pending || !pending.photoBlob) {
      setFormStatus("先拍一张照片。", true);
      return;
    }

    const drinkName = $("#mtl-drink-name").value.trim().slice(0, 60);
    const city = $("#mtl-city").value.trim().slice(0, 30);
    const district = $("#mtl-district").value.trim().slice(0, 30);
    const note = $("#mtl-note").value.trim().slice(0, 200);
    const brand = $("#mtl-brand").value.trim().slice(0, 30);
    const toppings = $("#mtl-toppings").value.trim().slice(0, 60);
    const sugar = $("#mtl-sugar").value;
    const ice = $("#mtl-ice").value;
    const cupSize = $("#mtl-cup").value;
    const price = readPrice($("#mtl-price"));
    const priceApprox = price !== null && Boolean(pending.priceApprox);
    const rating = Number($("#mtl-rating").dataset.value || 0);

    if (Number.isNaN(price)) {
      setFormStatus("价格填一个不小于 0 的数字，或留空。", true);
      return;
    }

    const now = new Date();
    const takenAt =
      pending.takenAt instanceof Date && Number.isFinite(pending.takenAt.getTime())
        ? pending.takenAt
        : now;
    const pickedDate = $("#mtl-date").value;
    const recordDate = /^\d{4}-\d{2}-\d{2}$/.test(pickedDate) ? pickedDate : dateKey(takenAt);
    const aiHadName = Boolean(pending.aiRawName);
    const record = {
      id: uid(),
      createdAt: now.toISOString(),
      date: recordDate,
      drinkName,
      city,
      district,
      note,
      lat: Number.isFinite(pending.lat) ? pending.lat : null,
      lng: Number.isFinite(pending.lng) ? pending.lng : null,
      confidence: pending.aiState === "ok" ? pending.confidence : null,
      source: aiHadName ? (drinkName === pending.aiRawName ? "ai" : "ai+edit") : "manual",
      photoBlob: pending.photoBlob,
      thumbBlob: pending.thumbBlob,
      mime: "image/jpeg",
    };
    putOptional(record, "brand", brand);
    putOptional(record, "brandId", brand && window.MtlBrands ? window.MtlBrands.matchId(brand) : "");
    if (drinkName && record.brandId) learnMenuItem(record.brandId, drinkName);
    putOptional(record, "price", price);
    if (priceApprox) record.priceApprox = true;
    putOptional(record, "sugar", sugar);
    putOptional(record, "ice", ice);
    putOptional(record, "cupSize", cupSize);
    putOptional(record, "toppings", toppings);
    putOptional(record, "rating", rating > 0 ? Math.min(5, Math.round(rating)) : null);
    putOptional(record, "mood", getMood($("#mtl-mood")));
    putOptional(record, "timeOfDay", getTime($("#mtl-time")));
    if (pending.stickerBlob) {
      record.stickerBlob = pending.stickerBlob;
      record.stickerStyle = "outline-white-v1";
    }
    if (pending.voiceBlob) {
      record.voiceBlob = pending.voiceBlob;
      record.voiceMime = pending.voiceMime || "audio/webm";
      record.voiceSeconds = Math.max(1, Number(pending.voiceSeconds) || 0);
    }

    try {
      await dbPut(record);
    } catch (err) {
      logWarn("record.save_failed", {
        message: String((err && err.message) || err || "").slice(0, 160),
        ms: Date.now() - started,
      });
      setFormStatus(err.message || "保存失败，本地空间可能不足。", true);
      return;
    }

    rememberName(drinkName);
    rememberCorrection(pending.aiRawName, drinkName);
    records.push(record);
    sortRecords();
    currentMonth = record.date.slice(0, 7);
    writeSettings({ currentMonth });
    updateAll();
    clearPending();
    toast("已收进 " + formatMonth(currentMonth));
    logInfo("record.saved", {
      name: record.drinkName,
      city: record.city,
      district: record.district,
      date: record.date,
      source: record.source,
      hasSticker: Boolean(record.stickerBlob),
      hasVoice: Boolean(record.voiceBlob),
      photoBytes: record.photoBlob ? record.photoBlob.size : 0,
      ms: Date.now() - started,
    });
  }

  function monthRecords(month) {
    return records.filter((record) => (record.date || "").slice(0, 7) === month);
  }

  function revokeArchiveUrls() {
    archiveUrls.forEach((url) => URL.revokeObjectURL(url));
    archiveUrls = [];
  }

  function revokeMapUrls() {
    mapUrls.forEach((url) => URL.revokeObjectURL(url));
    mapUrls = [];
  }

  function formatMoney(value) {
    const rounded = Math.round(Number(value) * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  // 估算价在记录里标「约」，方便和真实付款区分。
  function priceLabel(value, approx) {
    return (approx ? "约 ¥" : "¥") + formatMoney(value);
  }

  function lastPriceFor(drinkName, brand) {
    const name = String(drinkName || "").trim();
    const brandKey = String(brand || "").trim();
    if (name) {
      const hit = records.find((record) => Number.isFinite(record.price) && record.drinkName === name);
      if (hit) return hit.price;
    }
    if (brandKey) {
      const hit = records.find((record) => Number.isFinite(record.price) && record.brand === brandKey);
      if (hit) return hit.price;
    }
    return null;
  }

  function priceOptions() {
    const name = $("#mtl-drink-name") ? $("#mtl-drink-name").value : "";
    const brandInput = $("#mtl-brand") ? $("#mtl-brand").value.trim() : "";
    const brand = brandInput || (pending && pending.brand) || "";
    const list = [];
    const push = (value, kind) => {
      const num = Math.round(Number(value) * 10) / 10;
      if (!Number.isFinite(num) || num <= 0 || num > 100) return;
      if (list.some((item) => item.value === num)) return;
      list.push({ value: num, kind });
    };

    const last = lastPriceFor(name, brand);
    if (last !== null) push(last, "history");
    if (pending && pending.priceHint > 0) push(pending.priceHint, "ai");
    const band = PRICE_BANDS.find((item) => item.match.some((word) => brand.includes(word)));
    (band ? band.prices : DEFAULT_PRICE_POINTS).forEach((value) => push(value, "band"));
    DEFAULT_PRICE_POINTS.forEach((value) => push(value, "band"));
    return list.slice(0, 4);
  }

  function priceChipText(option) {
    if (option.kind === "history") return "上次 ¥" + formatMoney(option.value);
    if (option.kind === "ai") return "约 ¥" + formatMoney(option.value);
    return "¥" + formatMoney(option.value);
  }

  function syncPriceChips() {
    const box = $("#mtl-price-chips");
    const input = $("#mtl-price");
    if (!box || !input) return;
    const current = String(input.value || "").trim();
    $$("[data-price]", box).forEach((chip) => {
      const raw = chip.dataset.price || "";
      const on = current === ""
        ? raw === ""
        : raw !== "" && Math.abs(Number(raw) - Number(current)) < 0.001;
      chip.classList.toggle("is-active", on);
    });
  }

  function renderPriceChips() {
    const box = $("#mtl-price-chips");
    if (!box) return;
    box.textContent = "";
    priceOptions().forEach((option, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mtl-chip mtl-price-chip" + (index === 0 ? " is-best" : "");
      btn.dataset.price = String(option.value);
      btn.dataset.kind = option.kind;
      btn.textContent = priceChipText(option);
      box.appendChild(btn);
    });
    const none = document.createElement("button");
    none.type = "button";
    none.className = "mtl-chip mtl-price-chip";
    none.dataset.price = "";
    none.dataset.kind = "none";
    none.textContent = "不记";
    box.appendChild(none);
    syncPriceChips();
  }

  function choosePrice(chip) {
    const input = $("#mtl-price");
    if (!input) return;
    const raw = chip.dataset.price || "";
    input.value = raw;
    if (pending) pending.priceApprox = Boolean(raw) && chip.dataset.kind !== "history";
    syncPriceChips();
    setFormStatus("");
  }

  function togglePriceManual() {
    const input = $("#mtl-price");
    const btn = $("#mtl-price-manual-toggle");
    if (!input || !btn) return;
    const show = input.hidden;
    input.hidden = !show;
    btn.textContent = show ? "收起" : "手填";
    if (show) {
      if (pending) pending.priceApprox = false;
      input.focus();
    }
  }

  /* ---------- 品牌：徽章 / 一键点选 / 品牌墙 ---------- */

  const BRAND_POPULAR = ["蜜雪冰城", "霸王茶姬", "喜茶", "瑞幸咖啡"];

  function brandOf(text) {
    return window.MtlBrands ? window.MtlBrands.resolve(text) : null;
  }

  function brandBadge(text, size) {
    return window.MtlBrands ? window.MtlBrands.badge(text, size) : null;
  }

  // 按归一化后的品牌 ID 统计，避免「霸王茶姬(某店)」被拆成多个品牌。
  function brandCounts(items) {
    const map = new Map();
    items.forEach((item) => {
      const brand = brandOf(item.brand);
      if (!brand) return;
      const entry = map.get(brand.id) || { brand, count: 0 };
      entry.count += 1;
      map.set(brand.id, entry);
    });
    return map;
  }

  function recentBrandNames() {
    return Array.from(brandCounts(records).values())
      .sort((a, b) => b.count - a.count)
      .map((entry) => entry.brand.name);
  }

  function renderBrandPicker(box, input, aiBrand) {
    if (!box || !input || !window.MtlBrands) return;
    const current = input.value.trim();
    const currentBrand = brandOf(current);
    const picks = [];
    const seen = new Set();
    const push = (text) => {
      const brand = brandOf(text);
      if (!brand || seen.has(brand.id)) return;
      seen.add(brand.id);
      picks.push(brand);
    };

    if (aiBrand) push(aiBrand);
    if (current) push(current);
    recentBrandNames().forEach(push);
    if (picks.length < 4) BRAND_POPULAR.forEach(push);

    box.textContent = "";
    picks.slice(0, 8).forEach((brand) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "mtl-chip mtl-brand-chip" + (currentBrand && currentBrand.id === brand.id ? " is-active" : "");
      btn.dataset.brandId = brand.id;
      const badge = window.MtlBrands.badge(brand, "sm");
      if (badge) btn.appendChild(badge);
      const label = document.createElement("span");
      label.textContent = brand.name;
      btn.appendChild(label);
      const aiMatch = aiBrand && brandOf(aiBrand);
      if (aiMatch && aiMatch.id === brand.id) {
        const tag = document.createElement("em");
        tag.className = "mtl-brand-ai";
        tag.textContent = "AI";
        btn.appendChild(tag);
      }
      btn.addEventListener("click", () => {
        input.value = input.value.trim() === brand.name ? "" : brand.name;
        renderBrandPicker(box, input, aiBrand);
        if (box.id === "mtl-brand-chips") renderPriceChips();
      });
      box.appendChild(btn);
    });

    const more = document.createElement("button");
    more.type = "button";
    more.className = "mtl-chip mtl-brand-more-btn";
    more.textContent = "更多品牌";
    more.addEventListener("click", () => openBrandMore(box, input, aiBrand));
    box.appendChild(more);
  }

  /* ---------- 全部品牌弹层：一次看全 30 个 ---------- */

  let brandMoreTarget = null;

  function openBrandMore(box, input, aiBrand) {
    if (!window.MtlBrands) return;
    brandMoreTarget = { box, input, aiBrand };
    renderBrandMoreList();
    $("#mtl-brand-more").hidden = false;
    document.body.classList.add("mtl-modal-open");
  }

  function renderBrandMoreList() {
    const box = $("#mtl-brand-more-chips");
    if (!box || !brandMoreTarget) return;
    const current = brandOf(brandMoreTarget.input.value.trim());
    box.textContent = "";
    window.MtlBrands.list.forEach((brand) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "mtl-chip mtl-brand-chip" + (current && current.id === brand.id ? " is-active" : "");
      btn.dataset.brandId = brand.id;
      const badge = window.MtlBrands.badge(brand, "sm");
      if (badge) btn.appendChild(badge);
      const label = document.createElement("span");
      label.textContent = brand.name;
      btn.appendChild(label);
      btn.addEventListener("click", () => {
        const target = brandMoreTarget;
        if (!target) return;
        target.input.value = target.input.value.trim() === brand.name ? "" : brand.name;
        renderBrandPicker(target.box, target.input, target.aiBrand);
        if (target.box.id === "mtl-brand-chips") renderPriceChips();
        closeBrandMore();
      });
      box.appendChild(btn);
    });
  }

  function closeBrandMore() {
    const modal = $("#mtl-brand-more");
    if (modal) modal.hidden = true;
    brandMoreTarget = null;
    if ($("#mtl-share").hidden && $("#mtl-detail").hidden) {
      document.body.classList.remove("mtl-modal-open");
    }
  }

  function toggleBrandManual() {
    const input = $("#mtl-brand");
    const btn = $("#mtl-brand-manual-toggle");
    if (!input || !btn) return;
    const show = input.hidden;
    input.hidden = !show;
    btn.textContent = show ? "收起" : "手填";
    if (show) input.focus();
  }

  // 手填 / 改写品牌名时，同步 chip 的选中态（不重建 chip，避免打字时列表跳动）
  function syncBrandChipState(box, input) {
    if (!box || !input) return;
    const brand = brandOf(input.value.trim());
    box.querySelectorAll(".mtl-brand-chip").forEach((chip) => {
      chip.classList.toggle("is-active", Boolean(brand) && chip.dataset.brandId === brand.id);
    });
  }

  function buildStamp(record, index) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "mtl-stamp-card";
    card.dataset.id = record.id;
    card.style.setProperty("--mtl-tilt", ((index % 3) - 1) * 1.1 + "deg");

    const photo = document.createElement("div");
    photo.className = "mtl-stamp-photo";
    if (record.thumbBlob) {
      const img = document.createElement("img");
      const url = URL.createObjectURL(record.thumbBlob);
      archiveUrls.push(url);
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      photo.appendChild(img);
    } else {
      photo.classList.add("is-empty");
      photo.textContent = "茶";
    }

    const name = document.createElement("div");
    name.className = "mtl-stamp-name";
    name.textContent = record.drinkName || record.brand || "未命名";

    const stampBrand = brandBadge(record.brand, "sm");
    if (stampBrand) photo.appendChild(stampBrand);

    const place = document.createElement("div");
    place.className = "mtl-stamp-place";
    const placeParts = [];
    if (record.drinkName && record.brand) placeParts.push(record.brand);
    placeParts.push(record.city, record.district);
    place.textContent = placeParts.filter(Boolean).join(" · ") || "未定位";

    const date = document.createElement("div");
    date.className = "mtl-stamp-date";
    const dateText = (record.date || "").slice(5).replace("-", ".");
    date.textContent = Number.isFinite(record.price)
      ? dateText + " · " + priceLabel(record.price, record.priceApprox)
      : dateText;

    card.appendChild(photo);
    card.appendChild(name);
    card.appendChild(place);
    card.appendChild(date);
    if (moodByKey(record.mood)) {
      const moodDot = document.createElement("span");
      moodDot.className = "mtl-stamp-mood";
      moodDot.setAttribute("role", "img");
      moodDot.setAttribute("aria-label", "心情：" + moodLabel(record.mood));
      moodDot.innerHTML = moodSvg(record.mood);
      card.appendChild(moodDot);
    }
    return card;
  }

  function buildStickerCard(record) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "mtl-sticker-card";
    card.dataset.id = record.id;

    const art = document.createElement("div");
    art.className = "mtl-sticker-art" + (record.stickerBlob ? " has-cutout" : "");
    const blob = record.stickerBlob || record.thumbBlob || record.photoBlob;
    if (blob) {
      const img = document.createElement("img");
      img.className = "mtl-sticker-img";
      const url = URL.createObjectURL(blob);
      archiveUrls.push(url);
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      art.appendChild(img);
    } else {
      art.classList.add("is-empty");
      art.textContent = "茶";
    }

    const name = document.createElement("div");
    name.className = "mtl-sticker-name";
    name.textContent = record.drinkName || record.brand || "未命名";

    const stickerBrand = brandBadge(record.brand, "sm");
    if (stickerBrand) art.appendChild(stickerBrand);

    const meta = document.createElement("div");
    meta.className = "mtl-sticker-meta";
    const dateText = (record.date || "").slice(5).replace("-", ".");
    meta.textContent = [record.brand, dateText].filter(Boolean).join(" · ");

    card.appendChild(art);
    card.appendChild(name);
    card.appendChild(meta);
    return card;
  }

  function buildListRow(record) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "mtl-list-row";
    row.dataset.id = record.id;

    const thumb = document.createElement("div");
    thumb.className = "mtl-list-thumb";
    const blob = record.stickerBlob || record.thumbBlob;
    if (blob) {
      const img = document.createElement("img");
      const url = URL.createObjectURL(blob);
      archiveUrls.push(url);
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      thumb.appendChild(img);
    } else {
      thumb.textContent = "茶";
    }

    const body = document.createElement("div");
    body.className = "mtl-list-body";
    const title = document.createElement("div");
    title.className = "mtl-list-title";
    const listBrand = brandBadge(record.brand, "sm");
    if (listBrand) title.appendChild(listBrand);
    const name = document.createElement("div");
    name.className = "mtl-list-name";
    name.textContent = record.drinkName || record.brand || "未命名";
    title.appendChild(name);
    const meta = document.createElement("div");
    meta.className = "mtl-list-meta";
    const specs = [moodLabel(record.mood), record.brand, record.sugar, record.ice, record.cupSize]
      .filter(Boolean)
      .join(" · ");
    meta.textContent = specs || [record.city, record.district].filter(Boolean).join(" · ") || "未定位";
    if (record.voiceBlob) meta.textContent += " · 语音";
    body.appendChild(title);
    body.appendChild(meta);

    const side = document.createElement("div");
    side.className = "mtl-list-side";
    const date = document.createElement("span");
    date.textContent = (record.date || "").slice(5).replace("-", ".");
    side.appendChild(date);
    const time = timeLabel(record.timeOfDay);
    if (time) {
      const timeText = document.createElement("span");
      timeText.textContent = time;
      side.appendChild(timeText);
    }
    if (Number.isFinite(record.price)) {
      const price = document.createElement("strong");
      price.textContent = priceLabel(record.price, record.priceApprox);
      side.appendChild(price);
    }

    row.appendChild(thumb);
    row.appendChild(body);
    row.appendChild(side);
    return row;
  }

  function applyArchiveView() {
    const targets = {
      stamp: "#mtl-stamp-grid",
      sticker: "#mtl-sticker-grid",
      list: "#mtl-list",
    };
    Object.keys(targets).forEach((key) => {
      $(targets[key]).hidden = key !== archiveView;
    });
    $$("#mtl-archive-views [data-archive-view]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.archiveView === archiveView);
    });
  }

  function renderArchive() {
    $("#mtl-month").value = currentMonth;
    const items = monthRecords(currentMonth);
    $("#mtl-archive-summary").textContent = "这个月 " + items.length + " 杯";

    revokeArchiveUrls();
    const grid = $("#mtl-stamp-grid");
    const stickerGrid = $("#mtl-sticker-grid");
    const list = $("#mtl-list");
    grid.textContent = "";
    stickerGrid.textContent = "";
    list.textContent = "";

    items.forEach((record, index) => {
      grid.appendChild(buildStamp(record, index));
      stickerGrid.appendChild(buildStickerCard(record));
      list.appendChild(buildListRow(record));
    });

    $("#mtl-empty").hidden = items.length > 0;
    applyArchiveView();
  }

  // 高德 JS API 的 Key 必须在前端初始化，服务端只负责下发（见 /api/map-config）。
  function loadAmap() {
    if (window.AMap) return Promise.resolve();
    if (mapLoadPromise) return mapLoadPromise;

    mapLoadPromise = fetch("/api/map-config", { headers: { accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("MAP_CONFIG_FAILED"))))
      .then((config) => {
        if (!config || !config.key) throw new Error("NO_MAP_KEY");
        window._AMapSecurityConfig = { securityJsCode: String(config.securityJsCode || "") };
        return new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src =
            "https://webapi.amap.com/maps?v=2.0&key=" +
            encodeURIComponent(config.key) +
            "&callback=__mtlAmapReady";
          script.async = true;
          script.onerror = () => reject(new Error("MAP_LOAD_FAILED"));
          window.__mtlAmapReady = () => {
            delete window.__mtlAmapReady;
            resolve();
          };
          document.head.appendChild(script);
        });
      })
      .catch((err) => {
        mapLoadPromise = null;
        throw err;
      });

    return mapLoadPromise;
  }

  async function ensureMap() {
    if (map) return true;

    const emptyEl = $("#mtl-map-empty");
    try {
      await loadAmap();
    } catch (err) {
      logWarn("map.load.failed", { message: String(err && err.message ? err.message : err) });
      emptyEl.hidden = false;
      emptyEl.textContent =
        err && err.message === "NO_MAP_KEY"
          ? "地图暂不可用（还没配置高德 JS API Key）。"
          : "地图加载失败，稍后再试。";
      return false;
    }

    // 奶油纸感底图：GeoHUB 自定义样式（陆/水/路三色 + 关掉全部注记与楼块 + 隐藏行政边界线）。
    // 高德坐标系是 GCJ-02，落点前仍要做 WGS-84 → GCJ-02 转换。
    // showLabel:false 与 features 作为双保险，防止样式失效时文字 / POI 回来。
    map = new window.AMap.Map("mtl-map", {
      viewMode: "2D",
      zoom: 4,
      center: [104.2, 35.86],
      zooms: [3, 18],
      mapStyle: "amap://styles/f96fb1b8aee1fbc65cad5e7f45a2cbcb",
      showLabel: false,
      features: ["bg", "road"],
    });
    // 缩放跨过阈值时切换「城市徽章 / 地点图钉」两级视角。
    map.on("zoomend", () => {
      const level = map.getZoom() < MAP_CITY_MAX_ZOOM ? "city" : "point";
      if (level !== mapMode) drawMapMarkers(false);
    });
    map.on("click", closeMapSheet);
    return true;
  }

  // WGS-84（GPS）转 GCJ-02（高德/腾讯），仅用于地图落点显示。
  function wgs84ToGcj02(lat, lng) {
    const a = 6378245.0;
    const ee = 0.00669342162296594323;
    const outOfChina = lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
    if (outOfChina) return [lat, lng];

    const transformLat = (x, y) => {
      let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
      ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
      ret += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
      ret += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
      return ret;
    };
    const transformLng = (x, y) => {
      let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
      ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
      ret += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
      ret += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
      return ret;
    };

    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = (lat / 180.0) * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
    dLng = (dLng * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
    return [lat + dLat, lng + dLng];
  }

  // ---------- 地图：城市徽章 → 地点图钉 两级视角 ----------

  // 缩放到这个级别以上，才从「城市」钻进「具体地点」。
  const MAP_CITY_MAX_ZOOM = 9;

  function hasLocation(record) {
    return Number.isFinite(record.lat) && Number.isFinite(record.lng);
  }

  function drinkNameOf(record) {
    return record.drinkName || record.brand || "未命名";
  }

  // 同一地点（约 100 米内）的多杯合并成一个落点；坐标先转成高德的 GCJ-02。
  function groupLocated() {
    const groups = new Map();
    records.filter(hasLocation).forEach((record) => {
      const key = record.lat.toFixed(3) + "," + record.lng.toFixed(3);
      if (!groups.has(key)) {
        const point = wgs84ToGcj02(record.lat, record.lng);
        groups.set(key, { key, position: [point[1], point[0]], items: [] });
      }
      groups.get(key).items.push(record);
    });
    return Array.from(groups.values());
  }

  // 按城市把落点收成徽章：同城多杯只出一个数字圆点。
  function buildCityGroups(points) {
    const cities = new Map();
    points.forEach((point) => {
      const named = point.items.find((record) => record.city);
      const name = named ? String(named.city) : "";
      const key = name || "at:" + point.key;
      let city = cities.get(key);
      if (!city) {
        city = { key, name, count: 0, lng: 0, lat: 0, points: [] };
        cities.set(key, city);
      }
      city.count += point.items.length;
      city.points.push(point);
      city.lng += point.position[0] * point.items.length;
      city.lat += point.position[1] * point.items.length;
    });
    return Array.from(cities.values()).map((city) => ({
      key: city.key,
      name: city.name,
      count: city.count,
      points: city.points,
      position: [city.lng / city.count, city.lat / city.count],
    }));
  }

  function thumbUrlOf(record) {
    if (!record || !record.thumbBlob) return "";
    const url = URL.createObjectURL(record.thumbBlob);
    mapUrls.push(url);
    return url;
  }

  function cityBadgeHtml(city) {
    const label = city.count > 99 ? "99+" : String(city.count);
    return (
      '<div class="mtl-city-badge' +
      (city.key === mapActiveCityKey ? " is-active" : "") +
      '">' +
      label +
      "</div>"
    );
  }

  function pointPinHtml(point) {
    const single = point.items.length === 1 ? point.items[0] : null;
    const url = single ? thumbUrlOf(single) : "";
    const inner = url
      ? '<img src="' + url + '" alt="">'
      : '<span class="mtl-pin-glyph">' + (point.items.length > 1 ? point.items.length : "茶") + "</span>";
    return '<div class="mtl-pin' + (point.items.length > 1 ? " is-cluster" : "") + '">' + inner + "</div>";
  }

  function clearMapMarkers() {
    revokeMapUrls();
    if (map && mapMarkers.length) map.remove(mapMarkers);
    mapMarkers = [];
  }

  function drawMapMarkers(fit) {
    if (!map) return;
    clearMapMarkers();
    mapMode = map.getZoom() < MAP_CITY_MAX_ZOOM ? "city" : "point";

    if (mapMode === "city") {
      mapCityGroups.forEach((city) => {
        const marker = new window.AMap.Marker({
          position: city.position,
          content: cityBadgeHtml(city),
          offset: new window.AMap.Pixel(-16, -16),
          zIndex: 130,
        });
        marker.on("click", () => focusCity(city));
        mapMarkers.push(marker);
      });
    } else {
      mapPointGroups.forEach((point) => {
        const marker = new window.AMap.Marker({
          position: point.position,
          content: pointPinHtml(point),
          offset: new window.AMap.Pixel(-13, -13),
          zIndex: 120,
        });
        marker.on("click", () => openPointSheet(point));
        mapMarkers.push(marker);
      });
    }

    if (mapMarkers.length) map.add(mapMarkers);
    if (fit) fitMapView();
  }

  // 全貌：把所有城市徽章框进视野；只有一个城市时也不直接怼到最大。
  function fitMapView() {
    if (!mapMarkers.length) {
      map.setZoomAndCenter(4, [104.2, 35.86]);
      return;
    }
    map.setFitView(mapMarkers, false, [56, 56, 56, 56], 5);
  }

  function focusCity(city) {
    mapActiveCityKey = city.key;
    map.setZoomAndCenter(11.5, city.position, false, 600);
    openCitySheet(city);
  }

  function sheetRowHtml(record) {
    const url = thumbUrlOf(record);
    const meta = [record.date || "", record.district || ""].filter(Boolean).join(" · ");
    return (
      '<div class="mtl-sheet-row">' +
      (url ? '<img src="' + url + '" alt="">' : '<span class="mtl-sheet-glyph">茶</span>') +
      '<div class="mtl-sheet-meta"><strong>' +
      escapeHtml(drinkNameOf(record)) +
      "</strong><span>" +
      escapeHtml(meta) +
      "</span></div></div>"
    );
  }

  function openMapSheet(html) {
    const sheet = $("#mtl-map-sheet");
    if (!sheet) return;
    $("#mtl-map-sheet-body").innerHTML = html;
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add("is-open"));
  }

  function closeMapSheet() {
    const sheet = $("#mtl-map-sheet");
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove("is-open");
    window.setTimeout(() => {
      if (!sheet.classList.contains("is-open")) sheet.hidden = true;
    }, 220);
  }

  function latestFirst(items) {
    return items.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }

  function openCitySheet(city) {
    const items = latestFirst(city.points.flatMap((point) => point.items));
    const title = city.name ? "在" + city.name + "喝了 " + city.count + " 杯" : "这里喝了 " + city.count + " 杯";
    const sub = city.points.length + " 处地点 · 最近 " + (items[0] && items[0].date ? items[0].date : "—");
    const rows = items.slice(0, 3).map(sheetRowHtml).join("");
    const more = items.length > 3 ? '<p class="mtl-sheet-more">还有 ' + (items.length - 3) + " 杯</p>" : "";
    openMapSheet(
      '<p class="mtl-sheet-title">' + escapeHtml(title) + "</p>" +
        '<p class="mtl-sheet-sub">' + escapeHtml(sub) + "</p>" +
        rows +
        more
    );
  }

  function openPointSheet(point) {
    const items = latestFirst(point.items);
    if (items.length === 1) {
      const record = items[0];
      openMapSheet(
        '<p class="mtl-sheet-title">' + escapeHtml(drinkNameOf(record)) + "</p>" +
          '<p class="mtl-sheet-sub">' +
          escapeHtml([record.city, record.district].filter(Boolean).join(" · ") || "这里") +
          " · " +
          escapeHtml(record.date || "") +
          "</p>"
      );
      return;
    }
    const rows = items.slice(0, 4).map(sheetRowHtml).join("");
    const more = items.length > 4 ? '<p class="mtl-sheet-more">还有 ' + (items.length - 4) + " 杯</p>" : "";
    openMapSheet('<p class="mtl-sheet-title">这里喝了 ' + items.length + " 杯</p>" + rows + more);
  }

  async function renderMap() {
    const locatedCount = records.filter(hasLocation).length;
    mapPointGroups = groupLocated();
    mapCityGroups = buildCityGroups(mapPointGroups);

    const statsEl = $("#mtl-map-stats");
    const namedCities = new Set(mapCityGroups.filter((city) => city.name).map((city) => city.name));
    statsEl.textContent = locatedCount
      ? (namedCities.size ? namedCities.size + " 座城市 · " : "") +
        mapPointGroups.length +
        " 处地点 · " +
        locatedCount +
        " 杯"
      : "";
    statsEl.hidden = !locatedCount;

    const emptyEl = $("#mtl-map-empty");
    emptyEl.hidden = locatedCount > 0;
    if (!locatedCount) emptyEl.textContent = "还没有带位置的印章，拍一杯就会在这里点亮。";

    closeMapSheet();

    const firstOpen = !map;
    if (!(await ensureMap())) return;

    if (!mapPointGroups.length) {
      clearMapMarkers();
      map.setZoomAndCenter(4, [104.2, 35.86]);
      window.setTimeout(() => map.resize(), 60);
      return;
    }

    drawMapMarkers(firstOpen);
    window.setTimeout(() => map.resize(), 60);
  }

  function setStars(container, value) {
    const count = Number(value) || 0;
    container.dataset.value = String(count);
    $$("[data-star]", container).forEach((btn) => {
      btn.classList.toggle("is-on", Number(btn.dataset.star) <= count);
    });
  }

  function formatDetailMeta(record) {
    const when = [record.date || "", timeLabel(record.timeOfDay)].filter(Boolean).join(" ");
    const parts = when ? [when] : [];
    const place = [record.city, record.district].filter(Boolean).join(" · ");
    if (place) parts.push(place);
    if (Number.isFinite(record.price)) parts.push(priceLabel(record.price, record.priceApprox));
    return parts.filter(Boolean).join(" · ");
  }

  function openDetail(id) {
    const record = records.find((item) => item.id === id);
    if (!record) return;
    detailId = id;
    $("#mtl-detail-name").value = record.drinkName || "";
    $("#mtl-detail-date").value = record.date || dateKey(new Date());
    $("#mtl-detail-brand").value = record.brand || "";
    $("#mtl-detail-price").value = Number.isFinite(record.price) ? String(record.price) : "";
    $("#mtl-detail-city").value = record.city || "";
    $("#mtl-detail-district").value = record.district || "";
    $("#mtl-detail-sugar").value = record.sugar || "";
    $("#mtl-detail-ice").value = record.ice || "";
    $("#mtl-detail-cup").value = record.cupSize || "";
    $("#mtl-detail-toppings").value = record.toppings || "";
    $("#mtl-detail-note").value = record.note || "";
    setStars($("#mtl-detail-rating"), record.rating || 0);
    setMood($("#mtl-detail-mood"), record.mood || "");
    setTime($("#mtl-detail-time"), record.timeOfDay || "");
    $("#mtl-detail-meta").textContent = formatDetailMeta(record);
    setDetailPhoto(record);
    setDetailVoice(record);
    renderBrandPicker($("#mtl-detail-brand-chips"), $("#mtl-detail-brand"), "");

    $("#mtl-detail").hidden = false;
    document.body.classList.add("mtl-modal-open");
  }

  function setDetailPhoto(record) {
    if (detailUrl) URL.revokeObjectURL(detailUrl);
    detailUrl = "";
    const photo = $("#mtl-detail-photo");
    const blob = record.stickerBlob || record.photoBlob;
    if (blob) {
      detailUrl = URL.createObjectURL(blob);
      photo.src = detailUrl;
      photo.hidden = false;
    } else {
      photo.removeAttribute("src");
      photo.hidden = true;
    }
    photo.classList.toggle("is-sticker", Boolean(record.stickerBlob));
    $("#mtl-detail-sticker").textContent = record.stickerBlob ? "重做贴纸" : "生成贴纸";
  }

  function setDetailVoice(record) {
    const wrap = $("#mtl-detail-voice");
    const audio = $("#mtl-detail-audio");
    if (detailVoiceUrl) URL.revokeObjectURL(detailVoiceUrl);
    detailVoiceUrl = "";
    if (!record || !record.voiceBlob) {
      wrap.hidden = true;
      audio.removeAttribute("src");
      return;
    }
    detailVoiceUrl = URL.createObjectURL(record.voiceBlob);
    audio.src = detailVoiceUrl;
    wrap.hidden = false;
  }

  function closeDetail() {
    $("#mtl-detail").hidden = true;
    if ($("#mtl-share").hidden) {
      document.body.classList.remove("mtl-modal-open");
    }
    detailId = null;
    setDetailVoice(null);
    if (detailUrl) URL.revokeObjectURL(detailUrl);
    detailUrl = "";
  }

  async function saveDetail() {
    const record = records.find((item) => item.id === detailId);
    if (!record) return;
    const previousName = record.drinkName || "";
    const previousPrice = Number.isFinite(record.price) ? record.price : null;
    const price = readPrice($("#mtl-detail-price"));
    if (Number.isNaN(price)) {
      toast("价格填一个不小于 0 的数字，或留空");
      return;
    }

    record.drinkName = $("#mtl-detail-name").value.trim().slice(0, 60);
    const dateValue = $("#mtl-detail-date").value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) record.date = dateValue;
    record.city = $("#mtl-detail-city").value.trim().slice(0, 30);
    record.district = $("#mtl-detail-district").value.trim().slice(0, 30);
    record.note = $("#mtl-detail-note").value.trim().slice(0, 200);
    const detailBrand = $("#mtl-detail-brand").value.trim().slice(0, 30);
    putOptional(record, "brand", detailBrand);
    putOptional(record, "brandId", detailBrand && window.MtlBrands ? window.MtlBrands.matchId(detailBrand) : "");
    putOptional(record, "price", price);
    if (price !== previousPrice) delete record.priceApprox;
    putOptional(record, "sugar", $("#mtl-detail-sugar").value);
    putOptional(record, "ice", $("#mtl-detail-ice").value);
    putOptional(record, "cupSize", $("#mtl-detail-cup").value);
    putOptional(record, "toppings", $("#mtl-detail-toppings").value.trim().slice(0, 60));
    const rating = Number($("#mtl-detail-rating").dataset.value || 0);
    putOptional(record, "rating", rating > 0 ? Math.min(5, Math.round(rating)) : null);
    putOptional(record, "mood", getMood($("#mtl-detail-mood")));
    putOptional(record, "timeOfDay", getTime($("#mtl-detail-time")));
    if (record.source === "ai" && record.drinkName !== previousName) record.source = "ai+edit";

    try {
      await dbPut(record);
    } catch (err) {
      toast(err.message || "保存修改失败");
      return;
    }
    closeDetail();
    currentMonth = record.date.slice(0, 7);
    writeSettings({ currentMonth });
    updateAll();
    toast("已更新这枚印章");
  }

  async function deleteDetail() {
    const record = records.find((item) => item.id === detailId);
    if (!record) return;
    if (!window.confirm("删除这枚「" + (record.drinkName || "未命名") + "」印章？")) return;
    try {
      await dbDelete(record.id);
    } catch (err) {
      toast(err.message || "删除失败");
      return;
    }
    records = records.filter((item) => item.id !== record.id);
    closeDetail();
    updateAll();
    toast("已删除");
  }

  async function generateSticker() {
    const record = records.find((item) => item.id === detailId);
    if (!record) return;
    if (!record.photoBlob) {
      toast("这条记录没有照片，做不了贴纸");
      return;
    }
    if (!window.MtlRecognize || typeof window.MtlRecognize.cutout !== "function") {
      toast("当前环境不支持抠图");
      return;
    }

    const btn = $("#mtl-detail-sticker");
    btn.disabled = true;
    btn.textContent = "抠图中…";
    try {
      const raw = await window.MtlRecognize.cutout(record.photoBlob);
      const sticker = await addWhiteOutline(raw);
      record.stickerBlob = sticker;
      await dbPut(record);
      setDetailPhoto(record);
      updateAll();
      toast("贴纸已生成");
    } catch (err) {
      console.warn("[mtl] cutout failed", err);
      toast(
        err && err.code === "CUTOUT_NOT_CONFIGURED"
          ? "还没配抠图 Key，先用原图也可以"
          : (err && err.message) || "抠图失败，先用原图也可以"
      );
    } finally {
      btn.disabled = false;
      const current = records.find((item) => item.id === detailId);
      btn.textContent = current && current.stickerBlob ? "重做贴纸" : "生成贴纸";
    }
  }

  const SUGAR_LEVELS = { 全糖: 5, 七分: 4, 半糖: 3, 三分: 2, 无糖: 0, 不另外加糖: 0 };
  const CARD_FONT = '"PingFang SC", -apple-system, BlinkMacSystemFont, sans-serif';

  function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("图片读取失败"));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("图片导出失败"));
      }, "image/png");
    });
  }

  // 给透明抠图加一圈白边，做成「贴纸」；纯本机 Canvas，不上传。
  async function addWhiteOutline(blob) {
    const img = await loadImageFromBlob(blob);
    const maxSide = Math.max(img.width, img.height) || 1;
    const padding = Math.max(8, Math.round(maxSide * 0.04));
    const scale = Math.min(1, 1024 / (maxSide + padding * 2));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const p = Math.max(4, Math.round(padding * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w + p * 2;
    canvas.height = h + p * 2;
    const ctx = canvas.getContext("2d");

    const outline = document.createElement("canvas");
    outline.width = canvas.width;
    outline.height = canvas.height;
    const octx = outline.getContext("2d");

    const radius = Math.max(3, Math.round(p * 0.6));
    const steps = 16;
    for (let i = 0; i < steps; i += 1) {
      const angle = (Math.PI * 2 * i) / steps;
      octx.drawImage(img, p + Math.cos(angle) * radius, p + Math.sin(angle) * radius, w, h);
    }
    octx.globalCompositeOperation = "source-in";
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, outline.width, outline.height);

    ctx.drawImage(outline, 0, 0);
    ctx.drawImage(img, p, p, w, h);
    return canvasToBlob(canvas);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCover(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function fitCanvasText(ctx, text, maxWidth) {
    const value = String(text || "");
    if (ctx.measureText(value).width <= maxWidth) return value;
    let cut = value;
    while (cut.length > 1 && ctx.measureText(cut + "…").width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return cut + "…";
  }

  function cupRanks(record) {
    const asc = records
      .slice()
      .sort((a, b) => String(a.createdAt || a.date).localeCompare(String(b.createdAt || b.date)));
    const total = asc.findIndex((item) => item.id === record.id) + 1;
    const monthKeyText = (record.date || "").slice(0, 7);
    const sameMonth = asc.filter((item) => (item.date || "").slice(0, 7) === monthKeyText);
    const month = sameMonth.findIndex((item) => item.id === record.id) + 1;
    return { total: total || asc.length, month: month || 1 };
  }

  function brandRank(record) {
    const brand = brandOf(record.brand);
    if (!brand) return null;
    const asc = records
      .slice()
      .sort((a, b) => String(a.createdAt || a.date).localeCompare(String(b.createdAt || b.date)));
    const same = asc.filter((item) => {
      const itemBrand = brandOf(item.brand);
      return itemBrand && itemBrand.id === brand.id;
    });
    const rank = same.findIndex((item) => item.id === record.id) + 1;
    return { brand, rank: rank || same.length, total: same.length };
  }

  async function buildShareCard(record) {
    const W = 1080;
    const H = 1440;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const accent =
      (window.getComputedStyle(document.body).getPropertyValue("--mtl-primary") || "").trim() ||
      "#b9794f";

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#2b211b");
    bg.addColorStop(1, "#17110e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(W * 0.82, 0, 0, W * 0.82, 0, W * 0.85);
    glow.addColorStop(0, accent + "44");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 44px " + CARD_FONT;
    ctx.fillText("拍一杯", 72, 120);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "400 28px " + CARD_FONT;
    ctx.textAlign = "right";
    ctx.fillText(String(record.date || "").replace(/-/g, "."), W - 72, 120);
    ctx.textAlign = "left";

    const px = 72;
    const py = 180;
    const pw = W - 144;
    const ph = 620;
    ctx.save();
    roundRectPath(ctx, px, py, pw, ph, 32);
    ctx.clip();
    ctx.fillStyle = "#3a2c24";
    ctx.fillRect(px, py, pw, ph);
    if (record.photoBlob) {
      const img = await loadImageFromBlob(record.photoBlob);
      drawCover(ctx, img, px, py, pw, ph);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "700 96px " + CARD_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("茶", px + pw / 2, py + ph / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();

    const brandInfo = brandRank(record);
    if (brandInfo) {
      const brand = brandInfo.brand;
      ctx.beginPath();
      ctx.arc(102, 878, 30, 0, Math.PI * 2);
      ctx.fillStyle = brand.color;
      ctx.fill();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = brand.ink || "#ffffff";
      ctx.font = "700 24px " + CARD_FONT;
      ctx.fillText(brand.short, 102, 881);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "600 30px " + CARD_FONT;
      ctx.fillText(fitCanvasText(ctx, brand.name, 360), 148, 872);
      ctx.fillStyle = "rgba(255,255,255,0.48)";
      ctx.font = "400 21px " + CARD_FONT;
      ctx.fillText("第 " + brandInfo.rank + " 杯 · 共 " + brandInfo.total + " 杯", 148, 902);
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 56px " + CARD_FONT;
    ctx.fillText(fitCanvasText(ctx, record.drinkName || record.brand || "未命名", W - 144), 72, 966);

    const specs = [record.sugar, record.ice, record.cupSize].filter(Boolean).join(" · ");
    if (specs) {
      ctx.fillStyle = "rgba(255,255,255,0.62)";
      ctx.font = "400 30px " + CARD_FONT;
      ctx.fillText(fitCanvasText(ctx, specs, W - 144), 72, 1020);
    }

    const level = SUGAR_LEVELS[record.sugar];
    if (typeof level === "number") {
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.arc(84 + i * 38, 1072, 11, 0, Math.PI * 2);
        ctx.fillStyle = i < level ? accent : "rgba(255,255,255,0.16)";
        ctx.fill();
      }
    }

    const ranks = cupRanks(record);
    const cells = [
      ["第 " + ranks.total + " 杯", "累计"],
      ["第 " + ranks.month + " 杯", "本月"],
      [Number.isFinite(record.price) ? priceLabel(record.price, record.priceApprox) : "—", "花费"],
      [record.rating ? "★ " + record.rating : "—", "评分"],
    ];
    const gap = 18;
    const cw = (W - 144 - gap * 3) / 4;
    const ch = 150;
    const cy = 1104;
    cells.forEach((cell, index) => {
      const cx = 72 + index * (cw + gap);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      roundRectPath(ctx, cx, cy, cw, ch, 22);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 40px " + CARD_FONT;
      ctx.fillText(fitCanvasText(ctx, cell[0], cw - 20), cx + cw / 2, cy + 72);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "400 22px " + CARD_FONT;
      ctx.fillText(cell[1], cx + cw / 2, cy + 114);
    });
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "400 24px " + CARD_FONT;
    ctx.fillText("拍一杯 · 记录我的奶茶印章", W / 2, 1372);
    ctx.textAlign = "left";

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("分享卡导出失败"));
      }, "image/png");
    });
  }

  async function openShare(record) {
    let blob;
    try {
      blob = await buildShareCard(record);
    } catch (err) {
      console.warn("[mtl] 生成分享卡失败", err);
      toast("生成分享卡失败，换一张照片再试");
      return;
    }
    shareBlob = blob;
    if (shareUrl) URL.revokeObjectURL(shareUrl);
    shareUrl = URL.createObjectURL(blob);
    $("#mtl-share-preview").src = shareUrl;
    $("#mtl-share").hidden = false;
    document.body.classList.add("mtl-modal-open");
  }

  function closeShare() {
    $("#mtl-share").hidden = true;
    $("#mtl-share-preview").removeAttribute("src");
    if (shareUrl) URL.revokeObjectURL(shareUrl);
    shareUrl = "";
    shareBlob = null;
    if ($("#mtl-detail").hidden) {
      document.body.classList.remove("mtl-modal-open");
    }
  }

  function downloadShare() {
    if (!shareBlob) return;
    const url = URL.createObjectURL(shareBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "milk-tea-log-card-" + dateKey(new Date()) + ".png";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast("分享卡已保存");
  }

  async function shareCard() {
    if (!shareBlob) return;
    const file = new File([shareBlob], "milk-tea-log-card.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "我的奶茶印章" });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    downloadShare();
    toast("当前环境不支持直接分享，已保存图片");
  }

  /* ---------- 备份：打包成 zip（照片 / 贴纸 / 语音按文件存，不进 JSON） ---------- */

  function saveBlobFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let value = i;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[i] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  // 只「存储」不压缩（图片和语音本来就压过），零依赖、体积不会反而变大。
  function zipStore(entries) {
    const now = new Date();
    const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
    const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;

    entries.forEach((entry) => {
      const nameBytes = encoder.encode(entry.name);
      const size = entry.data.length;
      const crc = crc32(entry.data);

      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);

      locals.push(local, entry.data);
      centrals.push(central);
      offset += local.length + size;
    });

    const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(locals.concat(centrals, [eocd]), { type: "application/zip" });
  }

  async function unzipStore(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let eocd = -1;
    const minTail = Math.max(0, bytes.length - 22 - 65535);
    for (let i = bytes.length - 22; i >= minTail; i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error("不是有效的 zip");

    const count = view.getUint16(eocd + 10, true);
    let pointer = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder();
    const files = new Map();

    for (let i = 0; i < count; i += 1) {
      if (view.getUint32(pointer, true) !== 0x02014b50) break;
      const method = view.getUint16(pointer + 10, true);
      const compressedSize = view.getUint32(pointer + 20, true);
      const nameLength = view.getUint16(pointer + 28, true);
      const extraLength = view.getUint16(pointer + 30, true);
      const commentLength = view.getUint16(pointer + 32, true);
      const localOffset = view.getUint32(pointer + 42, true);
      const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      let data = bytes.subarray(start, start + compressedSize);
      if (method === 8) data = await inflateRaw(data);
      files.set(name, data);
      pointer += 46 + nameLength + extraLength + commentLength;
    }
    return files;
  }

  async function inflateRaw(data) {
    if (!window.DecompressionStream) throw new Error("当前浏览器打不开压缩过的 zip");
    const stream = new Blob([data]).stream().pipeThrough(new window.DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function fileExt(blob, fallback) {
    const type = (blob && blob.type) || "";
    if (type.indexOf("png") >= 0) return "png";
    if (type.indexOf("webp") >= 0) return "webp";
    if (type.indexOf("m4a") >= 0 || type.indexOf("mp4") >= 0) return "m4a";
    if (type.indexOf("mpeg") >= 0 || type.indexOf("mp3") >= 0) return "mp3";
    if (type.indexOf("wav") >= 0) return "wav";
    if (type.indexOf("ogg") >= 0) return "ogg";
    if (type.indexOf("webm") >= 0) return "webm";
    return fallback;
  }

  function extMime(path) {
    const ext = String(path || "").split(".").pop().toLowerCase();
    const map = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      m4a: "audio/mp4",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      webm: "audio/webm",
    };
    return map[ext] || "";
  }

  async function addBackupFile(entries, path, blob) {
    if (!blob) return "";
    entries.push({ name: path, data: new Uint8Array(await blob.arrayBuffer()) });
    return path;
  }

  async function exportBackup() {
    if (!records.length) {
      toast("还没有记录，先拍一杯");
      return;
    }

    toast("正在打包备份，稍等");
    const entries = [];
    const payload = [];
    for (const record of records) {
      const copy = Object.assign({}, record);
      delete copy.photoBlob;
      delete copy.thumbBlob;
      delete copy.stickerBlob;
      delete copy.voiceBlob;
      copy.photoFile = await addBackupFile(
        entries,
        "photos/" + record.id + "." + fileExt(record.photoBlob, "jpg"),
        record.photoBlob,
      );
      copy.thumbFile = await addBackupFile(
        entries,
        "thumbs/" + record.id + "." + fileExt(record.thumbBlob, "jpg"),
        record.thumbBlob,
      );
      copy.stickerFile = await addBackupFile(
        entries,
        "stickers/" + record.id + "." + fileExt(record.stickerBlob, "png"),
        record.stickerBlob,
      );
      copy.voiceFile = await addBackupFile(
        entries,
        "voices/" + record.id + "." + fileExt(record.voiceBlob, "webm"),
        record.voiceBlob,
      );
      payload.push(copy);
    }

    const meta = {
      format: "mtl-backup",
      version: 2,
      exportedAt: new Date().toISOString(),
      records: payload,
    };
    entries.push({
      name: "records.json",
      data: new TextEncoder().encode(JSON.stringify(meta, null, 2)),
    });

    saveBlobFile(zipStore(entries), "milk-tea-log-backup-" + dateKey(new Date()) + ".zip");
    writeSettings({ lastBackupAt: new Date().toISOString() });
    refreshBackupPanel();
    toast("备份已导出（照片和语音都在里面）");
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || "").split(",");
    if (parts.length !== 2) return null;
    const meta = parts[0].match(/^data:([^;]+);base64$/);
    if (!meta) return null;
    try {
      const binary = window.atob(parts[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: meta[1] });
    } catch (err) {
      return null;
    }
  }

  function textField(value, max) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
  }

  function finiteNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function zipEntryBlob(entries, path) {
    if (!entries || !path) return null;
    const bytes = entries.get(path);
    if (!bytes) return null;
    return new Blob([bytes], { type: extMime(path) });
  }

  function normalizeImported(item, entries) {
    if (!item || typeof item !== "object") return null;
    const createdAt =
      typeof item.createdAt === "string" && !Number.isNaN(Date.parse(item.createdAt))
        ? item.createdAt
        : "";
    const fallbackDate = createdAt ? dateKey(new Date(createdAt)) : dateKey(new Date());
    const date =
      typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
        ? item.date
        : fallbackDate;
    const price = finiteNumber(item.price);
    const rating = finiteNumber(item.rating);
    const record = {
      id: typeof item.id === "string" && item.id ? item.id.slice(0, 80) : uid(),
      createdAt: createdAt || date + "T12:00:00.000Z",
      date,
      drinkName: textField(item.drinkName || item.product, 60),
      city: textField(item.city, 30),
      district: textField(item.district, 30),
      note: textField(item.note, 200),
      lat: finiteNumber(item.lat),
      lng: finiteNumber(item.lng),
      confidence: finiteNumber(item.confidence),
      source: ["ai", "ai+edit", "manual"].indexOf(item.source) >= 0 ? item.source : "manual",
      mime: "image/jpeg",
    };
    putOptional(record, "brand", textField(item.brand, 30));
    putOptional(record, "price", price !== null && price >= 0 ? Math.round(price * 100) / 100 : null);
    if (item.priceApprox === true) record.priceApprox = true;
    putOptional(record, "sugar", textField(item.sugar, 20));
    putOptional(record, "ice", textField(item.ice, 20));
    putOptional(record, "cupSize", textField(item.cupSize, 20));
    putOptional(record, "toppings", textField(item.toppings, 60));
    putOptional(record, "rating", rating !== null && rating > 0 ? Math.min(5, Math.round(rating)) : null);
    putOptional(record, "mood", moodByKey(item.mood) ? item.mood : null);
    putOptional(record, "timeOfDay", timeLabel(item.timeOfDay));
    const photo =
      dataUrlToBlob(item.photo || item.thumb) || zipEntryBlob(entries, item.photoFile || item.thumbFile);
    const thumb =
      dataUrlToBlob(item.thumb || item.photo) || zipEntryBlob(entries, item.thumbFile || item.photoFile);
    const sticker = dataUrlToBlob(item.sticker) || zipEntryBlob(entries, item.stickerFile);
    if (photo) record.photoBlob = photo;
    if (thumb) record.thumbBlob = thumb;
    if (sticker) record.stickerBlob = sticker;
    const voice = zipEntryBlob(entries, item.voiceFile);
    if (voice) {
      record.voiceBlob = voice;
      record.voiceMime = textField(item.voiceMime, 40) || voice.type || "audio/webm";
      const seconds = finiteNumber(item.voiceSeconds);
      if (seconds && seconds > 0) record.voiceSeconds = Math.round(seconds);
    }
    return record;
  }

  async function readBackupFile(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const entries = await unzipStore(buffer);
      const metaBytes = entries.get("records.json");
      if (!metaBytes) throw new Error("备份里没有 records.json");
      const data = JSON.parse(new TextDecoder().decode(metaBytes));
      return { list: Array.isArray(data) ? data : data.records, entries };
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return { list: Array.isArray(data) ? data : data.records, entries: null };
  }

  async function importBackup(file) {
    if (!file) return;
    let parsed;
    try {
      parsed = await readBackupFile(file);
    } catch (err) {
      toast("这个文件不是有效的备份（zip 或 JSON）");
      return;
    }
    const list = Array.isArray(parsed.list) ? parsed.list : null;
    if (!list) {
      toast("备份格式不对，需要记录数组");
      return;
    }
    if (!list.length) {
      toast("备份里没有记录");
      return;
    }
    if (!window.confirm("导入 " + list.length + " 条备份？同 ID 的记录会跳过。")) return;

    const existing = new Set(records.map((record) => record.id));
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of list) {
      const record = normalizeImported(item, parsed.entries);
      if (!record) {
        failed += 1;
        continue;
      }
      if (existing.has(record.id)) {
        skipped += 1;
        continue;
      }
      try {
        await dbPut(record);
        existing.add(record.id);
        imported += 1;
      } catch (err) {
        failed += 1;
      }
    }

    try {
      records = await dbGetAll();
    } catch (err) {
      toast("导入后读取记录失败");
      return;
    }
    sortRecords();
    updateAll();
    let message = "导入 " + imported + " 条";
    if (skipped) message += "，跳过 " + skipped + " 条重复";
    if (failed) message += "，失败 " + failed + " 条";
    toast(message);
  }

  async function clearAll() {
    if (!records.length) {
      toast("还没有记录");
      return;
    }
    if (!window.confirm("清空全部 " + records.length + " 枚印章？建议先导出备份。")) return;
    try {
      await dbClear();
    } catch (err) {
      toast(err.message || "清空失败");
      return;
    }
    records = [];
    revokeArchiveUrls();
    revokeMapUrls();
    writeSettings({ lastBackupAt: "" });
    updateAll();
    refreshBackupPanel();
    toast("已清空");
  }

  function periodRange(period) {
    const now = new Date();
    const end = dateKey(now);
    if (period === "week") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      return { start: dateKey(start), end };
    }
    if (period === "year") {
      return { start: now.getFullYear() + "-01-01", end };
    }
    return { start: now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-01", end };
  }

  function topEntries(items, getter) {
    const counts = new Map();
    items.forEach((item) => {
      const key = getter(item);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }

  function renderTopList(target, entries, emptyText) {
    target.textContent = "";
    if (!entries.length) {
      const item = document.createElement("li");
      item.className = "mtl-muted";
      item.textContent = emptyText;
      target.appendChild(item);
      return;
    }
    entries.forEach(([name, count]) => {
      const item = document.createElement("li");
      item.textContent = name + " × " + count;
      target.appendChild(item);
    });
  }

  function topBrandEntries(items, limit) {
    return Array.from(brandCounts(items).values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  function renderTopBrands(target, entries, emptyText) {
    target.textContent = "";
    if (!entries.length) {
      const item = document.createElement("li");
      item.className = "mtl-muted";
      item.textContent = emptyText;
      target.appendChild(item);
      return;
    }
    const max = entries[0].count || 1;
    entries.forEach(({ brand, count }) => {
      const item = document.createElement("li");
      item.className = "mtl-top-brand";
      const badge = brandBadge(brand, "sm");
      if (badge) item.appendChild(badge);
      const name = document.createElement("span");
      name.className = "mtl-top-brand-name";
      name.textContent = brand.name;
      item.appendChild(name);
      const bar = document.createElement("span");
      bar.className = "mtl-top-brand-bar";
      const fill = document.createElement("span");
      fill.style.width = Math.max(10, Math.round((count / max) * 100)) + "%";
      fill.style.background = brand.color;
      bar.appendChild(fill);
      item.appendChild(bar);
      const num = document.createElement("strong");
      num.className = "mtl-top-brand-count";
      num.textContent = count;
      item.appendChild(num);
      target.appendChild(item);
    });
  }

  // 品牌墙：喝过的按杯数降序在前，没喝过的字典品牌灰度排在后面（只展示，不催促）。
  let brandWallOpen = false;

  function renderBrandWall() {
    const box = $("#mtl-brand-wall");
    if (!box || !window.MtlBrands) return;
    const counts = brandCounts(records);
    const knownIds = new Set(window.MtlBrands.list.map((brand) => brand.id));
    const collected = Array.from(counts.values()).sort((a, b) => b.count - a.count);
    const uncollected = window.MtlBrands.list
      .filter((brand) => !counts.has(brand.id))
      .map((brand) => ({ brand, count: 0 }));
    const total = knownIds.size + collected.filter((entry) => !knownIds.has(entry.brand.id)).length;

    box.textContent = "";
    collected.concat(uncollected).forEach(({ brand, count }) => {
      const item = document.createElement("div");
      item.className = "mtl-brand-wall-item " + (count > 0 ? "is-collected" : "is-empty");
      item.title = brand.name + " · " + (count > 0 ? count + " 杯" : "还没记录");
      const badge = brandBadge(brand, "lg");
      if (badge) item.appendChild(badge);
      const name = document.createElement("span");
      name.className = "mtl-brand-wall-name";
      name.textContent = brand.name;
      item.appendChild(name);
      const num = document.createElement("span");
      num.className = "mtl-brand-wall-count";
      num.textContent = count > 0 ? count + " 杯" : "未喝";
      item.appendChild(num);
      box.appendChild(item);
    });

    // 默认只露前两排（6 个），点按钮再看全部
    const itemCount = box.children.length;
    box.classList.toggle("is-collapsed", !brandWallOpen);
    const toggle = $("#mtl-brand-wall-toggle");
    if (toggle) {
      toggle.hidden = itemCount <= 6;
      toggle.textContent = brandWallOpen ? "收起" : "展开全部 " + itemCount + " 个品牌";
    }

    $("#mtl-brand-wall-summary").textContent = "已收集 " + collected.length + " / " + total;
  }

  function renderStats() {
    const range = periodRange(statPeriod);
    const items = records.filter((record) => record.date >= range.start && record.date <= range.end);
    const priced = items.filter((record) => Number.isFinite(record.price));
    const spend = priced.reduce((sum, record) => sum + record.price, 0);

    $("#mtl-stat-cups").textContent = items.length;
    $("#mtl-stat-spend").textContent = priced.length ? "¥" + formatMoney(spend) : "—";
    $("#mtl-stat-avg").textContent = priced.length ? "¥" + formatMoney(spend / priced.length) : "—";
    const approxCount = priced.filter((record) => record.priceApprox).length;
    $("#mtl-stat-note").hidden = approxCount === 0;
    $("#mtl-stat-note").textContent = approxCount ? "其中 " + approxCount + " 笔是估算价（标记为「约」）" : "";
    $("#mtl-stat-empty").hidden = items.length > 0;
    renderTopBrands($("#mtl-top-brands"), topBrandEntries(items, 3), "还没填品牌");
    renderTopList(
      $("#mtl-top-drinks"),
      topEntries(items, (item) => item.drinkName),
      "还没填饮品名"
    );

    $$("#mtl-period [data-period]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.period === statPeriod);
    });
  }

  function currentStreak() {
    const days = new Set(records.map((record) => record.date).filter(Boolean));
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    if (!days.has(dateKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
      if (!days.has(dateKey(cursor))) return 0;
    }
    let count = 0;
    while (days.has(dateKey(cursor))) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  function renderHeatmap() {
    const box = $("#mtl-heatmap");
    box.textContent = "";
    const counts = new Map();
    records.forEach((record) => {
      if (!record.date) return;
      counts.set(record.date, (counts.get(record.date) || 0) + 1);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = new Date(today);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const start = new Date(monday);
    start.setDate(start.getDate() - 7 * 11);

    for (let i = 0; i < 84; i += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = dateKey(day);
      const count = counts.get(key) || 0;
      const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;
      const cell = document.createElement("span");
      cell.className = "mtl-heat-cell lv-" + level + (day > today ? " is-future" : "");
      cell.title = key + " · " + count + " 杯";
      box.appendChild(cell);
    }
  }

  /* ---------- 口味档案（全部从已有记录派生，不额外让用户填） ---------- */

  function topKey(items, pick) {
    const map = new Map();
    items.forEach((item) => {
      const key = String(pick(item) || "").trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    let best = "";
    let max = 0;
    map.forEach((count, key) => {
      if (count > max) {
        max = count;
        best = key;
      }
    });
    return best;
  }

  // 轻提示：打过高分、但最近 7 天没点的饮品，顺口提一句。
  function tasteTip() {
    const cutoff = dateKey(new Date(Date.now() - 7 * 24 * 3600 * 1000));
    const latest = new Map();
    records.forEach((record) => {
      if (Number(record.rating) < 4) return;
      const name = String(record.drinkName || "").trim();
      if (!name) return;
      const prev = latest.get(name);
      if (!prev || (record.date || "") > (prev.date || "")) latest.set(name, record);
    });
    const stale = Array.from(latest.values()).filter((record) => (record.date || "") < cutoff);
    if (!stale.length) return "";
    stale.sort(
      (a, b) => Number(b.rating) - Number(a.rating) || String(a.date).localeCompare(String(b.date))
    );
    return "你给「" + String(stale[0].drinkName).trim() + "」打过高分，最近 7 天没点了。";
  }

  function renderTasteProfile() {
    const grid = $("#mtl-taste-grid");
    const empty = $("#mtl-taste-empty");
    const tip = $("#mtl-taste-tip");
    if (!grid || !empty) return;
    grid.textContent = "";
    const list = [];

    const topBrand = Array.from(brandCounts(records).values()).sort((a, b) => b.count - a.count)[0];
    if (topBrand) list.push(["最常买", topBrand.brand.name, topBrand.count + " 杯"]);

    const nameCount = new Map();
    records.forEach((record) => {
      const name = String(record.drinkName || "").trim();
      if (name) nameCount.set(name, (nameCount.get(name) || 0) + 1);
    });
    let topName = "";
    let topNameCount = 0;
    nameCount.forEach((count, name) => {
      if (count > topNameCount) {
        topName = name;
        topNameCount = count;
      }
    });
    if (topName) list.push(["常点的", topName, topNameCount + " 次"]);

    [["糖度", "sugar"], ["冰量", "ice"], ["杯型", "cupSize"], ["常喝", "timeOfDay"]].forEach(
      ([label, field]) => {
        const value = topKey(records, (record) => record[field]);
        if (value) list.push([label, value, ""]);
      }
    );

    const prices = records
      .map((record) => Number(record.price))
      .filter((price) => Number.isFinite(price) && price > 0);
    if (prices.length) {
      const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      list.push(["均价", "¥" + formatMoney(avg), prices.length + " 杯带价"]);
    }

    const moodKey = topKey(records, (record) => record.mood);
    const mood = moodKey ? MOODS.find((item) => item.key === moodKey) : null;
    if (mood) list.push(["最常心情", mood.label, ""]);

    grid.hidden = list.length === 0;
    empty.hidden = list.length > 0;
    list.forEach(([label, value, meta]) => {
      const cell = document.createElement("div");
      cell.className = "mtl-taste-item";
      const name = document.createElement("span");
      name.className = "mtl-taste-label";
      name.textContent = label;
      const strong = document.createElement("strong");
      strong.className = "mtl-taste-value";
      strong.textContent = value;
      cell.appendChild(name);
      cell.appendChild(strong);
      if (meta) {
        const small = document.createElement("span");
        small.className = "mtl-taste-meta";
        small.textContent = meta;
        cell.appendChild(small);
      }
      grid.appendChild(cell);
    });

    if (tip) {
      const text = tasteTip();
      tip.hidden = !text;
      tip.textContent = text;
    }
  }

  function renderMe() {
    $("#mtl-me-total").textContent = records.length;
    $("#mtl-me-brands").textContent = brandCounts(records).size;
    $("#mtl-me-streak").textContent = currentStreak();
    renderStats();
    renderBrandWall();
    renderHeatmap();
    renderTasteProfile();
    applyTheme(document.body.dataset.theme || DEFAULT_THEME);
    refreshBackupPanel();
    maybeNagBackup();
  }

  /* ---------- 自定义相机（点首页快门 → 全屏取景） ---------- */

  const cameraState = { stream: null, track: null, torch: false };

  function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // 非 HTTPS / 老浏览器：回落系统相机
      $("#mtl-camera-input").click();
      return;
    }
    $("#mtl-camera").hidden = false;
    document.body.classList.add("mtl-modal-open");
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      })
      .then((stream) => {
        cameraState.stream = stream;
        cameraState.track = stream.getVideoTracks()[0] || null;
        const video = $("#mtl-camera-video");
        video.srcObject = stream;
        return video.play().catch(() => {});
      })
      .then(() => logInfo("camera.opened", {}))
      .catch((error) => {
        closeCamera();
        logWarn("camera.failed", { message: String((error && error.message) || error) });
        toast("打不开相机，改从相册选一张");
        $("#mtl-gallery-input").click();
      });
  }

  function closeCamera() {
    if (cameraState.stream) {
      cameraState.stream.getTracks().forEach((track) => track.stop());
    }
    cameraState.stream = null;
    cameraState.track = null;
    cameraState.torch = false;
    const video = $("#mtl-camera-video");
    if (video) video.srcObject = null;
    $("#mtl-camera").hidden = true;
    $("#mtl-camera-flash").classList.remove("is-on");
    if ($("#mtl-detail").hidden && $("#mtl-share").hidden) {
      document.body.classList.remove("mtl-modal-open");
    }
  }

  function shootPhoto() {
    const video = $("#mtl-camera-video");
    if (!video.videoWidth) {
      toast("相机还在准备，稍等一下");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        closeCamera();
        if (!blob) {
          toast("这张没拍成，再按一次");
          return;
        }
        logInfo("camera.shot", { bytes: blob.size, w: canvas.width, h: canvas.height });
        handleFile(new File([blob], "camera-" + Date.now() + ".jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }

  function toggleTorch() {
    if (!cameraState.track) return;
    const caps = cameraState.track.getCapabilities ? cameraState.track.getCapabilities() : {};
    if (!caps || !caps.torch) {
      toast("这台设备的闪光灯不支持常亮");
      return;
    }
    cameraState.torch = !cameraState.torch;
    cameraState.track
      .applyConstraints({ advanced: [{ torch: cameraState.torch }] })
      .then(() => $("#mtl-camera-flash").classList.toggle("is-on", cameraState.torch))
      .catch(() => {
        cameraState.torch = false;
        toast("闪光灯打不开");
      });
  }

  function bindEvents() {
    const cameraInput = $("#mtl-camera-input");
    const galleryInput = $("#mtl-gallery-input");
    [cameraInput, galleryInput].forEach((input) => {
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        input.value = "";
        if (!file) return;
        if (!$("#mtl-camera").hidden) closeCamera();
        handleFile(file);
      });
    });

    $("#mtl-shutter").addEventListener("click", openCamera);
    $("#mtl-hero-last").addEventListener("click", (event) => {
      const id = event.currentTarget.dataset.id;
      if (id) openDetail(id);
    });
    $("#mtl-camera-close").addEventListener("click", closeCamera);
    $("#mtl-camera-shot").addEventListener("click", shootPhoto);
    $("#mtl-camera-flash").addEventListener("click", toggleTorch);
    initVoiceControls();
    // 从相机页去相册：先关掉摄像头再开系统选图
    $(".mtl-camera-album").addEventListener("click", closeCamera);

    $("#mtl-confirm-card").addEventListener("submit", handleSubmit);
    $("#mtl-retake").addEventListener("click", retake);

    $$(".mtl-tab[data-view]").forEach((tab) => {
      tab.addEventListener("click", () => switchView(tab.dataset.view));
    });

    $("#mtl-map-sheet-close").addEventListener("click", closeMapSheet);

    $("#mtl-month").addEventListener("change", () => {
      currentMonth = $("#mtl-month").value || monthKey(new Date());
      writeSettings({ currentMonth });
      renderArchive();
    });

    $$("#mtl-archive-views [data-archive-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        archiveView = btn.dataset.archiveView;
        writeSettings({ archiveView });
        applyArchiveView();
      });
    });

    $("#view-archive").addEventListener("click", (event) => {
      const card = event.target.closest("[data-id]");
      if (card) openDetail(card.dataset.id);
    });

    $("#mtl-export").addEventListener("click", exportBackup);
    $("#mtl-import").addEventListener("click", () => $("#mtl-import-input").click());
    $("#mtl-import-input").addEventListener("change", () => {
      const input = $("#mtl-import-input");
      const file = input.files && input.files[0];
      input.value = "";
      if (file) importBackup(file);
    });
    $("#mtl-clear").addEventListener("click", clearAll);

    $("#mtl-detail-save").addEventListener("click", saveDetail);
    $("#mtl-detail-delete").addEventListener("click", deleteDetail);
    $("#mtl-detail-share").addEventListener("click", () => {
      const record = records.find((item) => item.id === detailId);
      if (record) openShare(record);
    });
    $("#mtl-detail-sticker").addEventListener("click", generateSticker);
    $("#mtl-share-save").addEventListener("click", downloadShare);
    $("#mtl-share-do").addEventListener("click", shareCard);

    $("#mtl-install-tip-ok").addEventListener("click", closeInstallTip);
    $$("#mtl-install-tip [data-install-close]").forEach((el) => {
      el.addEventListener("click", closeInstallTip);
    });

    document.addEventListener("click", (event) => {
      const closer = event.target.closest("[data-close]");
      if (!closer) return;
      if (closer.closest("#mtl-brand-more")) closeBrandMore();
      else if (closer.closest("#mtl-share")) closeShare();
      else if (closer.closest("#mtl-detail")) closeDetail();
      else if (closer.closest("#mtl-city-sheet")) closeCityPicker();
      else if (closer.closest("#mtl-menu-search")) closeMenuSearch();
    });

    $$("#mtl-period [data-period]").forEach((btn) => {
      btn.addEventListener("click", () => {
        statPeriod = btn.dataset.period;
        renderStats();
      });
    });
    $$("#mtl-themes [data-theme]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyTheme(btn.dataset.theme);
        writeSettings({ theme: btn.dataset.theme });
      });
    });
    $("#mtl-brand-wall-toggle").addEventListener("click", () => {
      brandWallOpen = !brandWallOpen;
      renderBrandWall();
    });

    [["#mtl-rating", "#mtl-rating-clear"], ["#mtl-detail-rating", "#mtl-detail-rating-clear"]].forEach(
      ([starsSel, clearSel]) => {
        const box = $(starsSel);
        box.addEventListener("click", (event) => {
          const star = event.target.closest("[data-star]");
          if (star) setStars(box, Number(star.dataset.star));
        });
        $(clearSel).addEventListener("click", () => setStars(box, 0));
      }
    );

    $("#mtl-recent-chips").addEventListener("click", (event) => {
      const chip = event.target.closest(".mtl-chip");
      if (!chip) return;
      applySuggestion({
        name: chip.dataset.name || "",
        brandName: chip.dataset.brand || "",
        kind: chip.dataset.kind || "menu",
        sugar: chip.dataset.sugar || "",
        ice: chip.dataset.ice || "",
        cupSize: chip.dataset.cup || "",
        price: chip.dataset.price ? Number(chip.dataset.price) : null,
      });
      $("#mtl-drink-name").focus();
    });

    $("#mtl-drink-search").addEventListener("click", openMenuSearch);
    $("#mtl-menu-search-input").addEventListener("input", (event) => {
      renderMenuSearch(event.target.value);
    });

    $("#mtl-price-chips").addEventListener("click", (event) => {
      const chip = event.target.closest(".mtl-chip");
      if (chip) choosePrice(chip);
    });

    $("#mtl-price-manual-toggle").addEventListener("click", togglePriceManual);
    $("#mtl-brand-manual-toggle").addEventListener("click", toggleBrandManual);

    $("#mtl-price").addEventListener("input", () => {
      if (pending) pending.priceApprox = false;
      syncPriceChips();
    });

    ["#mtl-drink-name", "#mtl-brand"].forEach((selector) => {
      $(selector).addEventListener("change", renderPriceChips);
    });

    // 品牌 chips 只改 input.value、不触发 change，这里补一次价格带刷新。
    const brandChips = $("#mtl-brand-chips");
    if (brandChips) {
      brandChips.addEventListener("click", () =>
        window.setTimeout(() => {
          renderPriceChips();
          renderSuggestions();
        }, 0)
      );
    }

    $("#mtl-brand").addEventListener("change", renderSuggestions);

    $("#mtl-brand").addEventListener("input", () => {
      syncBrandChipState($("#mtl-brand-chips"), $("#mtl-brand"));
    });

    $("#mtl-detail-brand").addEventListener("input", () => {
      syncBrandChipState($("#mtl-detail-brand-chips"), $("#mtl-detail-brand"));
    });

    $("#mtl-place-chips").addEventListener("click", (event) => {
      const chip = event.target.closest(".mtl-chip");
      if (!chip) return;
      $("#mtl-city").value = chip.dataset.city || "";
      $("#mtl-district").value = chip.dataset.district || "";
    });

    $("#mtl-city").addEventListener("click", () => openCityPicker($("#mtl-city"), $("#mtl-district")));
    $("#mtl-detail-city").addEventListener("click", () =>
      openCityPicker($("#mtl-detail-city"), $("#mtl-detail-district"))
    );
    $("#mtl-city-locate").addEventListener("click", locateCity);
    $("#mtl-city-search").addEventListener("input", (event) => renderCityList(event.target.value));
    $("#mtl-city-list").addEventListener("click", (event) => {
      const item = event.target.closest(".mtl-city-item");
      if (item) chooseCity(item.dataset.city);
    });
    $("#mtl-city-hot").addEventListener("click", (event) => {
      const chip = event.target.closest(".mtl-chip");
      if (chip) chooseCity(chip.dataset.city);
    });
    $("#mtl-city-manual-toggle").addEventListener("click", () => {
      const input = $("#mtl-city-manual");
      const show = input.hidden;
      input.hidden = !show;
      $("#mtl-city-manual-toggle").textContent = show ? "收起手填" : "找不到？手填城市";
      if (show) input.focus();
    });
    $("#mtl-city-manual").addEventListener("change", () => {
      const name = $("#mtl-city-manual").value.trim().slice(0, 30);
      if (name) chooseCity(name);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!$("#mtl-install-tip").hidden) closeInstallTip();
      else if (!$("#mtl-city-sheet").hidden) closeCityPicker();
      else if (!$("#mtl-share").hidden) closeShare();
      else if (!$("#mtl-detail").hidden) closeDetail();
      else if (!$("#mtl-menu-search").hidden) closeMenuSearch();
    });
  }

  async function init() {
    const settings = readSettings();
    currentMonth = settings.currentMonth || monthKey(new Date());
    archiveView = ["stamp", "sticker", "list"].indexOf(settings.archiveView) >= 0 ? settings.archiveView : "stamp";
    applyTheme(settings.theme || DEFAULT_THEME);
    renderMoodPicker($("#mtl-mood"));
    renderMoodPicker($("#mtl-detail-mood"));
    renderTimeChips($("#mtl-time"));
    renderTimeChips($("#mtl-detail-time"));
    bindEvents();
    try {
      records = await dbGetAll();
    } catch (err) {
      console.warn("[mtl] 读取本地记录失败", err);
      records = [];
      toast("本地存储不可用，记录可能无法保存");
    }
    sortRecords();
    updateAll();
    ensurePersistentStorage();
    refreshBackupPanel();
    maybeShowInstallTip();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
