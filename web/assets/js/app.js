(function () {
  "use strict";

  const DB_NAME = "mtl";
  const DB_VERSION = 1;
  const STORE = "records";
  const SETTINGS_KEY = "mtl:settings:v1";
  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const PHOTO_EDGE = 1280;
  const THUMB_EDGE = 640;

  const THEMES = {
    caramel: { name: "焦糖", color: "#f7efe6" },
    matcha: { name: "抹茶", color: "#f1f4e9" },
    sakura: { name: "樱花", color: "#fbf0f1" },
    blueberry: { name: "蓝莓", color: "#f1f2f8" },
  };

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  let records = [];
  let currentMonth = monthKey(new Date());
  let pending = null;
  let jobSeq = 0;
  let dbPromise = null;
  let archiveUrls = [];
  let mapUrls = [];
  let map = null;
  let mapMarkers = null;
  let detailId = null;
  let detailUrl = "";
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

  function applyTheme(theme) {
    const key = THEMES[theme] ? theme : "caramel";
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

  function updateAll() {
    updateBadge();
    renderArchive();
    if ($("#view-map").classList.contains("is-active")) renderMap();
    if (!$("#mtl-me").hidden) renderMe();
  }

  function switchView(name) {
    $$(".mtl-view").forEach((view) => {
      view.classList.toggle("is-active", view.id === "view-" + name);
    });
    $$(".mtl-tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.view === name);
    });
    if (name === "archive") renderArchive();
    if (name === "map") window.setTimeout(renderMap, 80);
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
  }

  function clearPending() {
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
    const fromExif = pending && pending.geoSource === "exif";

    if (!fromExif) {
      if (!window.isSecureContext) {
        if (!pending || job !== jobSeq) return;
        pending.geoState = "insecure";
        setStep("geo", "warn");
        noteWorking("当前不是 HTTPS，定位不可用，可手填城市 / 区");
        return;
      }
      if (!navigator.geolocation) {
        pending.geoState = "error";
        pending.geoError = "这个浏览器不支持定位";
        setStep("geo", "warn");
        noteWorking(pending.geoError);
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
    } catch (err) {
      if (!pending || job !== jobSeq) return;
      pending.geoState = "error";
      pending.geoError = fromExif
        ? "拍摄地查不到城市 / 区，可手填"
        : err.message || "没拿到定位，可手填城市 / 区";
      setStep("geo", "warn");
      noteWorking(pending.geoError);
    }
  }

  async function runAi(job) {
    setStep("ai", "active");
    if (!pending || !pending.photoBlob) return;
    try {
      const result = await window.MtlRecognize.recognize(pending.photoBlob);
      if (!pending || job !== jobSeq) return;
      pending.aiState = "ok";
      const rawName = String(result.drinkName || "").trim();
      const fixed = rawName ? readCorrections()[rawName] : "";
      pending.aiRawName = rawName;
      pending.drinkName = fixed || rawName;
      pending.autoFixed = Boolean(fixed && fixed !== rawName);
      pending.category = result.category || "";
      pending.confidence = Number(result.confidence);
      if (!Number.isFinite(pending.confidence)) pending.confidence = 0.5;
      setStep("ai", pending.drinkName ? "done" : "warn");
    } catch (err) {
      if (!pending || job !== jobSeq) return;
      pending.aiState = "error";
      pending.aiError = err.message || "识别暂时不可用";
      setStep("ai", "warn");
      noteWorking(pending.aiError);
    }
  }

  async function runCutout(job) {
    if (!pending || !pending.photoBlob || !window.MtlRecognize) return;
    if (typeof window.MtlRecognize.cutout !== "function") return;
    try {
      const raw = await window.MtlRecognize.cutout(pending.photoBlob);
      if (!pending || job !== jobSeq) return;
      pending.stickerBlob = await addWhiteOutline(raw);
      pending.cutoutState = "done";
      renderConfirmPhoto();
      noteWorking("贴纸已生成");
    } catch (err) {
      // 抠图是可选项：没配 Key / 超时 / 失败都不阻塞记录。
      if (pending && job === jobSeq) {
        pending.cutoutState = "skipped";
        renderConfirmPhoto();
      }
      console.info("[mtl] cutout skipped", err && err.code ? err.code : String(err));
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

    clearPending();
    const job = ++jobSeq;
    pending = {
      job,
      previewUrl: URL.createObjectURL(file),
      messages: [],
      aiState: "pending",
      geoState: "pending",
      drinkName: "",
      aiRawName: "",
      autoFixed: false,
      category: "",
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
      toast(err.message || "图片处理失败");
      clearPending();
      return;
    }
    if (!pending || job !== jobSeq) return;

    pending.photoBlob = images.photo;
    pending.thumbBlob = images.thumb;
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

  function renderRecentChips() {
    const names = readRecentNames();
    const wrap = $("#mtl-recent-wrap");
    const box = $("#mtl-recent-chips");
    box.textContent = "";
    wrap.hidden = names.length === 0;
    names.forEach((name) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mtl-chip";
      btn.textContent = name;
      btn.dataset.name = name;
      box.appendChild(btn);
    });
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
    renderRecentChips();
    renderPlaceChips();

    const badge = $("#mtl-ai-badge");
    const hints = [];
    badge.hidden = false;

    if (pending.aiState === "ok") {
      if (!pending.drinkName) {
        badge.textContent = "AI 没认出来";
        hints.push("可以手动写饮品名，不影响保存");
      } else if (pending.autoFixed) {
        badge.textContent = "按你的习惯";
        hints.push("已按你上次的改法填好");
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

    $("#mtl-ai-hint").textContent = hints.join("；");
    setFormStatus("");
    $("#mtl-confirm-card").scrollIntoView({ behavior: "smooth", block: "start" });
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
    const aiHadName = Boolean(pending.aiRawName);
    const record = {
      id: uid(),
      createdAt: now.toISOString(),
      date: dateKey(takenAt),
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
    putOptional(record, "price", price);
    putOptional(record, "sugar", sugar);
    putOptional(record, "ice", ice);
    putOptional(record, "cupSize", cupSize);
    putOptional(record, "toppings", toppings);
    putOptional(record, "rating", rating > 0 ? Math.min(5, Math.round(rating)) : null);
    if (pending.stickerBlob) {
      record.stickerBlob = pending.stickerBlob;
      record.stickerStyle = "outline-white-v1";
    }

    try {
      await dbPut(record);
    } catch (err) {
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
      ? dateText + " · ¥" + formatMoney(record.price)
      : dateText;

    card.appendChild(photo);
    card.appendChild(name);
    card.appendChild(place);
    card.appendChild(date);
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
    const name = document.createElement("div");
    name.className = "mtl-list-name";
    name.textContent = record.drinkName || record.brand || "未命名";
    const meta = document.createElement("div");
    meta.className = "mtl-list-meta";
    const specs = [record.brand, record.sugar, record.ice, record.cupSize].filter(Boolean).join(" · ");
    meta.textContent = specs || [record.city, record.district].filter(Boolean).join(" · ") || "未定位";
    body.appendChild(name);
    body.appendChild(meta);

    const side = document.createElement("div");
    side.className = "mtl-list-side";
    const date = document.createElement("span");
    date.textContent = (record.date || "").slice(5).replace("-", ".");
    side.appendChild(date);
    if (Number.isFinite(record.price)) {
      const price = document.createElement("strong");
      price.textContent = "¥" + formatMoney(record.price);
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

  function ensureMap() {
    if (map) return true;
    if (typeof window.L === "undefined") {
      $("#mtl-map-empty").hidden = false;
      $("#mtl-map-empty").textContent = "地图组件没加载，检查 assets/vendor/leaflet。";
      return false;
    }

    map = window.L.map("mtl-map", {
      zoomControl: true,
      attributionControl: true,
    }).setView([35.86, 104.2], 4);

    // 高德瓦片在国内加载稳定；坐标系是 GCJ-02，落点前需从 GPS 坐标转换。
    // 底图用 scl=2 的 512px 图（缩到 256 CSS px，手机高分屏不发虚）；
    // 高德的 2 倍图不带文字，所以再叠一层透明注记（路名 / 地名 / POI）。
    window.L.tileLayer(
      "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scl=2&style=8&x={x}&y={y}&z={z}",
      {
        subdomains: "1234",
        maxZoom: 18,
        tileSize: 256,
        className: "mtl-map-tiles",
        attribution: "&copy; 高德地图",
      }
    ).addTo(map);

    window.L.tileLayer(
      "https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}",
      {
        subdomains: "1234",
        maxZoom: 18,
        className: "mtl-map-labels",
        opacity: 0.9,
      }
    ).addTo(map);

    mapMarkers = window.L.layerGroup().addTo(map);
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

  // 同一地点（约 100 米内）的多杯合并成一个落点。
  function groupLocated() {
    const groups = new Map();
    records
      .filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng))
      .forEach((record) => {
        const key = record.lat.toFixed(3) + "," + record.lng.toFixed(3);
        if (!groups.has(key)) {
          groups.set(key, { lat: record.lat, lng: record.lng, items: [] });
        }
        groups.get(key).items.push(record);
      });
    return Array.from(groups.values());
  }

  function groupPopupHtml(group) {
    if (group.items.length === 1) {
      const record = group.items[0];
      return (
        "<strong>" +
        escapeHtml(record.drinkName || record.brand || "未命名") +
        "</strong><br>" +
        escapeHtml([record.city, record.district].filter(Boolean).join(" · ") || "未定位") +
        "<br><small>" +
        escapeHtml(record.date || "") +
        "</small>"
      );
    }
    const lines = group.items.slice(0, 5).map((record) => {
      const day = (record.date || "").slice(5).replace("-", ".");
      return escapeHtml(day + " · " + (record.drinkName || record.brand || "未命名"));
    });
    if (group.items.length > 5) lines.push("等 " + group.items.length + " 杯");
    return "<strong>这里 " + group.items.length + " 杯</strong><br>" + lines.join("<br>");
  }

  function renderMap() {
    const locatedCount = records.filter(
      (record) => Number.isFinite(record.lat) && Number.isFinite(record.lng)
    ).length;
    const groups = groupLocated();
    $("#mtl-map-count").textContent = locatedCount ? locatedCount + " 枚" : "";
    $("#mtl-map-empty").hidden = locatedCount > 0;
    $("#mtl-map-empty").textContent = "还没有带位置的印章。";

    if (!ensureMap()) return;

    revokeMapUrls();
    mapMarkers.clearLayers();

    if (!groups.length) {
      map.setView([35.86, 104.2], 4);
      map.invalidateSize();
      return;
    }

    groups.forEach((group) => {
      let html = '<span class="mtl-map-fallback">茶</span>';
      if (group.items.length === 1 && group.items[0].thumbBlob) {
        const url = URL.createObjectURL(group.items[0].thumbBlob);
        mapUrls.push(url);
        html = '<img src="' + url + '" alt="">';
      } else if (group.items.length > 1) {
        html = '<span class="mtl-map-count-label">' + group.items.length + "</span>";
      }
      const icon = window.L.divIcon({
        className: "mtl-map-stamp" + (group.items.length > 1 ? " is-cluster" : ""),
        html,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });
      const point = wgs84ToGcj02(group.lat, group.lng);
      const marker = window.L.marker(point, { icon }).addTo(mapMarkers);
      marker.bindPopup(groupPopupHtml(group));
    });

    const bounds = window.L.latLngBounds(
      groups.map((group) => wgs84ToGcj02(group.lat, group.lng))
    );
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    window.setTimeout(() => map.invalidateSize(), 60);
  }

  function setStars(container, value) {
    const count = Number(value) || 0;
    container.dataset.value = String(count);
    $$("[data-star]", container).forEach((btn) => {
      btn.classList.toggle("is-on", Number(btn.dataset.star) <= count);
    });
  }

  function formatDetailMeta(record) {
    const parts = [record.date || ""];
    const place = [record.city, record.district].filter(Boolean).join(" · ");
    if (place) parts.push(place);
    if (Number.isFinite(record.price)) parts.push("¥" + formatMoney(record.price));
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
    $("#mtl-detail-meta").textContent = formatDetailMeta(record);
    setDetailPhoto(record);

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

  function closeDetail() {
    $("#mtl-detail").hidden = true;
    if ($("#mtl-me").hidden && $("#mtl-share").hidden) {
      document.body.classList.remove("mtl-modal-open");
    }
    detailId = null;
    if (detailUrl) URL.revokeObjectURL(detailUrl);
    detailUrl = "";
  }

  async function saveDetail() {
    const record = records.find((item) => item.id === detailId);
    if (!record) return;
    const previousName = record.drinkName || "";
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
    putOptional(record, "brand", $("#mtl-detail-brand").value.trim().slice(0, 30));
    putOptional(record, "price", price);
    putOptional(record, "sugar", $("#mtl-detail-sugar").value);
    putOptional(record, "ice", $("#mtl-detail-ice").value);
    putOptional(record, "cupSize", $("#mtl-detail-cup").value);
    putOptional(record, "toppings", $("#mtl-detail-toppings").value.trim().slice(0, 60));
    const rating = Number($("#mtl-detail-rating").dataset.value || 0);
    putOptional(record, "rating", rating > 0 ? Math.min(5, Math.round(rating)) : null);
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

    if (record.brand) {
      ctx.font = "600 26px " + CARD_FONT;
      const brand = fitCanvasText(ctx, record.brand, 480);
      const bw = ctx.measureText(brand).width + 44;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      roundRectPath(ctx, 72, 848, bw, 52, 26);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(brand, 94, 884);
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
      [Number.isFinite(record.price) ? "¥" + formatMoney(record.price) : "—", "花费"],
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
    if ($("#mtl-detail").hidden && $("#mtl-me").hidden) {
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

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
      reader.readAsDataURL(blob);
    });
  }

  async function exportBackup() {
    if (!records.length) {
      toast("还没有记录，先拍一杯");
      return;
    }

    const payload = [];
    for (const record of records) {
      const copy = Object.assign({}, record);
      delete copy.photoBlob;
      delete copy.thumbBlob;
      delete copy.stickerBlob;
      copy.photo = record.photoBlob ? await blobToDataUrl(record.photoBlob) : "";
      copy.thumb = record.thumbBlob ? await blobToDataUrl(record.thumbBlob) : "";
      copy.sticker = record.stickerBlob ? await blobToDataUrl(record.stickerBlob) : "";
      payload.push(copy);
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "milk-tea-log-backup-" + dateKey(new Date()) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast("备份已导出");
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

  function normalizeImported(item) {
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
    putOptional(record, "sugar", textField(item.sugar, 20));
    putOptional(record, "ice", textField(item.ice, 20));
    putOptional(record, "cupSize", textField(item.cupSize, 20));
    putOptional(record, "toppings", textField(item.toppings, 60));
    putOptional(record, "rating", rating !== null && rating > 0 ? Math.min(5, Math.round(rating)) : null);
    const photo = dataUrlToBlob(item.photo || item.thumb);
    const thumb = dataUrlToBlob(item.thumb || item.photo);
    const sticker = dataUrlToBlob(item.sticker);
    if (photo) record.photoBlob = photo;
    if (thumb) record.thumbBlob = thumb;
    if (sticker) record.stickerBlob = sticker;
    return record;
  }

  async function importBackup(file) {
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (err) {
      toast("这个文件不是有效的备份 JSON");
      return;
    }
    const list = Array.isArray(data) ? data : Array.isArray(data.records) ? data.records : null;
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
      const record = normalizeImported(item);
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
    updateAll();
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

  function renderStats() {
    const range = periodRange(statPeriod);
    const items = records.filter((record) => record.date >= range.start && record.date <= range.end);
    const priced = items.filter((record) => Number.isFinite(record.price));
    const spend = priced.reduce((sum, record) => sum + record.price, 0);

    $("#mtl-stat-cups").textContent = items.length;
    $("#mtl-stat-spend").textContent = priced.length ? "¥" + formatMoney(spend) : "—";
    $("#mtl-stat-avg").textContent = priced.length ? "¥" + formatMoney(spend / priced.length) : "—";
    $("#mtl-stat-empty").hidden = items.length > 0;
    renderTopList($("#mtl-top-brands"), topEntries(items, (item) => item.brand), "还没填品牌");
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

  function computeBadges() {
    const asc = records.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const days = [];
    asc.forEach((record) => {
      if (record.date && days[days.length - 1] !== record.date) days.push(record.date);
    });

    let nightDate = "";
    for (const record of asc) {
      const stamp = record.createdAt || record.date + "T12:00:00";
      const hour = new Date(stamp).getHours();
      if (hour >= 22 || hour < 4) {
        nightDate = record.date;
        break;
      }
    }

    const seasonOf = (date) => {
      const month = Number(date.slice(5, 7));
      if (month >= 3 && month <= 5) return 0;
      if (month >= 6 && month <= 8) return 1;
      if (month >= 9 && month <= 11) return 2;
      return 3;
    };
    const seasons = new Set(days.map(seasonOf));
    let seasonDate = "";
    const seenSeasons = new Set();
    for (const day of days) {
      seenSeasons.add(seasonOf(day));
      if (seenSeasons.size >= 4) {
        seasonDate = day;
        break;
      }
    }

    const brands = new Set(asc.map((record) => record.brand).filter(Boolean));
    let brandDate = "";
    const seenBrands = new Set();
    for (const record of asc) {
      if (record.brand) seenBrands.add(record.brand);
      if (seenBrands.size >= 5) {
        brandDate = record.date;
        break;
      }
    }

    let maxRun = 0;
    let run = 0;
    let previous = "";
    let streakDate = "";
    days.forEach((day) => {
      const gap = previous
        ? Math.round((Date.parse(day + "T00:00:00") - Date.parse(previous + "T00:00:00")) / 86400000)
        : 0;
      run = gap === 1 ? run + 1 : 1;
      if (run > maxRun) maxRun = run;
      if (run === 7 && !streakDate) streakDate = day;
      previous = day;
    });

    return [
      {
        icon: "初",
        name: "第一杯",
        on: days.length > 0,
        date: days[0] || "",
        progress: records.length ? "已达成" : "还差 1 杯",
      },
      {
        icon: "夜",
        name: "夜猫子",
        on: Boolean(nightDate),
        date: nightDate,
        progress: nightDate ? "已达成" : "22 点后喝一杯",
      },
      {
        icon: "四",
        name: "四季品茗",
        on: seasons.size >= 4,
        date: seasonDate,
        progress: "已集 " + seasons.size + "/4",
      },
      {
        icon: "牌",
        name: "品牌收集家",
        on: brands.size >= 5,
        date: brandDate,
        progress: "已集 " + brands.size + "/5",
      },
      {
        icon: "连",
        name: "连续 7 天",
        on: maxRun >= 7,
        date: streakDate,
        progress: "最长 " + maxRun + "/7 天",
      },
      {
        icon: "廿",
        name: "20 杯收藏家",
        on: records.length >= 20,
        date: records.length >= 20 ? asc[19].date : "",
        progress: records.length + "/20 杯",
      },
    ];
  }

  function renderBadges() {
    const box = $("#mtl-badges");
    box.textContent = "";
    computeBadges().forEach((badge) => {
      const card = document.createElement("div");
      card.className = "mtl-ach" + (badge.on ? " is-on" : "");
      const icon = document.createElement("div");
      icon.className = "mtl-ach-icon";
      icon.textContent = badge.icon;
      const name = document.createElement("div");
      name.className = "mtl-ach-name";
      name.textContent = badge.name;
      const meta = document.createElement("div");
      meta.className = "mtl-ach-meta";
      meta.textContent = badge.on && badge.date ? badge.date : badge.progress;
      card.appendChild(icon);
      card.appendChild(name);
      card.appendChild(meta);
      box.appendChild(card);
    });
  }

  function renderMe() {
    $("#mtl-me-total").textContent = records.length;
    $("#mtl-me-brands").textContent = new Set(records.map((record) => record.brand).filter(Boolean)).size;
    $("#mtl-me-streak").textContent = currentStreak();
    renderStats();
    renderHeatmap();
    renderBadges();
    applyTheme(document.body.dataset.theme || "caramel");
  }

  function openMe() {
    renderMe();
    $("#mtl-me").hidden = false;
    document.body.classList.add("mtl-modal-open");
  }

  function closeMe() {
    $("#mtl-me").hidden = true;
    if ($("#mtl-detail").hidden && $("#mtl-share").hidden) {
      document.body.classList.remove("mtl-modal-open");
    }
  }

  function bindEvents() {
    const cameraInput = $("#mtl-camera-input");
    const galleryInput = $("#mtl-gallery-input");
    [cameraInput, galleryInput].forEach((input) => {
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        input.value = "";
        if (file) handleFile(file);
      });
    });

    $("#mtl-confirm-card").addEventListener("submit", handleSubmit);
    $("#mtl-retake").addEventListener("click", retake);

    $$(".mtl-tab").forEach((tab) => {
      tab.addEventListener("click", () => switchView(tab.dataset.view));
    });

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

    document.addEventListener("click", (event) => {
      const closer = event.target.closest("[data-close]");
      if (!closer) return;
      if (closer.closest("#mtl-share")) closeShare();
      else if (closer.closest("#mtl-detail")) closeDetail();
      else if (closer.closest("#mtl-me")) closeMe();
    });

    $("#mtl-me-open").addEventListener("click", openMe);
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
      $("#mtl-drink-name").value = chip.dataset.name || "";
      $("#mtl-drink-name").focus();
    });

    $("#mtl-place-chips").addEventListener("click", (event) => {
      const chip = event.target.closest(".mtl-chip");
      if (!chip) return;
      $("#mtl-city").value = chip.dataset.city || "";
      $("#mtl-district").value = chip.dataset.district || "";
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!$("#mtl-share").hidden) closeShare();
      else if (!$("#mtl-detail").hidden) closeDetail();
      else if (!$("#mtl-me").hidden) closeMe();
    });
  }

  async function init() {
    const settings = readSettings();
    currentMonth = settings.currentMonth || monthKey(new Date());
    archiveView = ["stamp", "sticker", "list"].indexOf(settings.archiveView) >= 0 ? settings.archiveView : "stamp";
    applyTheme(settings.theme || "caramel");
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
  }

  document.addEventListener("DOMContentLoaded", init);
})();
