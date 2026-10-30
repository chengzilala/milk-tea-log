"use strict";

const path = require("path");
const express = require("express");
const multer = require("multer");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { logEvent, writeClientEvents } = require("./log");

const app = express();
const PORT = Number(process.env.PORT || 8830);
const WEB_DIR = path.join(__dirname, "..", "web");
// 官网介绍页：纯静态单页，挂在 /site/ 下，可直接整包替换。
const SITE_DIR = path.join(__dirname, "..", "site");

const DASHSCOPE_API_KEY = String(process.env.DASHSCOPE_API_KEY || "").trim();
const DASHSCOPE_BASE_URL = String(
  process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"
).replace(/\/+$/, "");
const DASHSCOPE_MODEL = String(process.env.DASHSCOPE_MODEL || "qwen-vl-max-latest").trim();
const AMAP_KEY = String(process.env.AMAP_KEY || "").trim();
// 高德 JS API（地图渲染）的 Key 与安全密钥：必须下发到前端才能加载地图，
// 靠高德控制台的域名白名单限制来源；服务端只在请求时下发，不写进仓库。
const AMAP_JS_KEY = String(process.env.AMAP_JS_KEY || "").trim();
const AMAP_JS_SECURITY = String(process.env.AMAP_JS_SECURITY || "").trim();
const REMOVEBG_API_KEY = String(process.env.REMOVEBG_API_KEY || "").trim();
// 抠图供应商开关：remove.bg 将于 2026-12-01 停止独立服务，换供应商时只改这里。
const CUTOUT_PROVIDER = String(process.env.CUTOUT_PROVIDER || "removebg").trim().toLowerCase();
// 语音转文字：走的也是 OpenAI 兼容的 /audio/transcriptions。
// 没单独配 STT_API_KEY 时默认复用上面的文本 / 视觉 Key 与地址，但模型必须显式给，
// 避免用错模型白白扣费；三者不齐就当「没配置」，前端自动降级为只留语音。
const STT_API_KEY = String(process.env.STT_API_KEY || DASHSCOPE_API_KEY || "").trim();
const STT_BASE_URL = String(process.env.STT_BASE_URL || DASHSCOPE_BASE_URL || "").replace(/\/+$/, "");
const STT_MODEL = String(process.env.STT_MODEL || "").trim();
const MOCK_AI = String(process.env.MOCK_AI || "0") === "1";

function isSttConfigured() {
  return Boolean(STT_API_KEY && STT_BASE_URL && STT_MODEL);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

app.disable("x-powered-by");
// 线上放在 Caddy/Nginx/隧道后面时设为 1：只信任本机回环代理传来的 X-Forwarded-For，
// 否则所有请求的 req.ip 都是 127.0.0.1，限流会变成全站共享。
if (String(process.env.TRUST_PROXY || "0") === "1") app.set("trust proxy", "loopback");
app.use(express.json({ limit: "64kb" }));

// 简单的内存限流：避免公网被刷，导致模型/抠图费用失控。
const rateBuckets = new Map();
function makeRateLimit(limit) {
  return function rateLimit(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let bucket = rateBuckets.get(ip);
    if (!bucket || now - bucket.start > 60 * 1000) {
      bucket = { start: now, count: 0 };
      rateBuckets.set(ip, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      return res.status(429).json({ error: "RATE_LIMITED", message: "请求太频繁，稍后再试" });
    }
    return next();
  };
}

const rateLimit = makeRateLimit(30);
// 抠图按次计费，单独收紧到 8 次/分钟。
const cutoutRateLimit = makeRateLimit(8);
// 语音转写同样按次计费，给一个比抠图稍宽的上限。
const sttRateLimit = makeRateLimit(10);
// 前端诊断日志是批量上报，给一个更宽松但仍有限的上限。
const clientLogRateLimit = makeRateLimit(120);

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    if (now - bucket.start > 5 * 60 * 1000) rateBuckets.delete(ip);
  }
}, 5 * 60 * 1000).unref();

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(DASHSCOPE_API_KEY),
    geocodeConfigured: Boolean(AMAP_KEY),
    mapConfigured: Boolean(AMAP_JS_KEY),
    cutoutConfigured: isCutoutConfigured(),
    sttConfigured: isSttConfigured(),
    mockAi: MOCK_AI,
  });
});

// 高德 JS API 需要在前端初始化，Key 无法藏在服务端。
// 这里按请求下发（配置放 .env），配合高德控制台的域名白名单使用。
app.get("/api/map-config", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ key: AMAP_JS_KEY, securityJsCode: AMAP_JS_SECURITY });
});

// 前端诊断日志：只收流程与结果，不接收图片；单条 data 限长，避免被刷爆磁盘。
function sanitizeClientEvent(item) {
  if (!item || typeof item !== "object") return null;
  const rawData = item.data && typeof item.data === "object" ? item.data : {};
  let data = rawData;
  try {
    const text = JSON.stringify(rawData);
    if (text.length > 1500) data = { truncated: true, size: text.length };
  } catch (err) {
    data = { truncated: true, reason: "unserializable" };
  }
  return {
    t: String(item.t || "").slice(0, 40),
    sid: String(item.sid || "").slice(0, 40),
    level: String(item.level || "info").slice(0, 10),
    event: String(item.event || "").slice(0, 60),
    data,
  };
}

app.post("/api/log", clientLogRateLimit, (req, res) => {
  const body = req.body || {};
  const rawEvents = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  const events = rawEvents.map(sanitizeClientEvent).filter(Boolean);
  if (!events.length) {
    return res.status(400).json({ error: "NO_EVENTS", message: "没有日志内容" });
  }
  writeClientEvents(events, { ua: body.ua });
  return res.json({ ok: true, count: events.length });
});

// 主流品牌候选清单：给模型收敛范围，减少把品牌写进 drinkName 或乱造名字。
const BRAND_CANDIDATES = [
  "蜜雪冰城", "霸王茶姬", "喜茶", "奈雪的茶", "茶百道", "古茗", "沪上阿姨", "书亦烧仙草",
  "益禾堂", "CoCo都可", "一点点", "茶颜悦色", "甜啦啦", "阿水大杯茶", "乐乐茶", "7分甜",
  "茉酸奶", "茉莉奶白", "阿嬷手作", "桂桂茶", "茶话弄", "柠季", "瑞幸咖啡", "库迪咖啡",
  "Manner", "星巴克", "幸运咖", "挪瓦咖啡", "快乐柠檬", "贡茶",
];

const RECOGNIZE_PROMPT = [
  "你是奶茶 / 咖啡记录助手。看这张照片，识别杯贴、杯套、小票以及杯子本身的视觉特征。",
  "只输出一个 JSON 对象，不要 Markdown，不要解释。格式：",
  '{"drinkName":"具体饮品名","brand":"品牌名","brandConfidence":0.0,"category":"奶茶|果茶|咖啡|其他|未知","priceHint":0,"confidence":0.0}',
  "规则：",
  "1. drinkName 只填具体饮品名，例如“伯牙绝弦”；品牌名填到 brand，不要混进 drinkName。",
  "2. 如果只能看到品牌、看不到具体饮品名，drinkName 返回空字符串，并降低 confidence。",
  "3. 如果照片里没有杯子或文字，drinkName 返回空字符串，category 返回“未知”，confidence 低于 0.3。",
  "4. confidence 是 0 到 1 的小数，表示你对 drinkName 的把握。",
  "5. brand 优先从这份候选清单里原样选一个：" + BRAND_CANDIDATES.join("、") + "。",
  "6. 即使杯贴上没有清晰的品牌文字，也要根据杯型、杯盖、杯套花纹、logo 剪影、门店背景、饮品特征推断最可能的品牌；有七八成把握就给，不要因为字不清楚就留空。",
  "7. 如果确定是候选清单之外的品牌且能看清品牌名，brand 返回该品牌名；完全无法判断时 brand 返回空字符串。",
  "8. brandConfidence 是 0 到 1 的小数，表示你对 brand 的把握；brand 为空时返回 0。",
  "9. priceHint 是这类饮品在门店的正常售价估计（人民币，单位元）：能确定品牌和饮品时给一个常见价（如 9.9、15、18、20）；不确定就给 0。这只是估价，不要当成小票金额。",
].join("\n");

function contentToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (part && typeof part.text === "string" ? part.text : "")).join("");
  }
  return "";
}

const TRANSIENT_NET_CODES = ["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE", "UND_ERR_CONNECT_TIMEOUT"];

// 本机 DNS 偶尔超时，会表现为 Node fetch 的 "fetch failed"；这类错误重试一次通常就好。
function isTransientNetworkError(err) {
  if (!err) return false;
  const code = err.cause && err.cause.code ? String(err.cause.code) : "";
  return err.message === "fetch failed" || TRANSIENT_NET_CODES.includes(code);
}

function describeNetworkError(err) {
  const code = err.cause && err.cause.code ? String(err.cause.code) : "";
  return code || String(err.message || err).slice(0, 120);
}

function parseModelJson(text) {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("模型没有返回 JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callQwenVision(buffer, mime) {
  const dataUrl = `data:${mime || "image/jpeg"};base64,${buffer.toString("base64")}`;
  // 豆包（火山方舟）默认开启深度思考，读图要 30s+；关掉后约 2s 返回
  const isArk = DASHSCOPE_BASE_URL.includes("volces.com");

  const body = JSON.stringify({
    model: DASHSCOPE_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: RECOGNIZE_PROMPT },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 260,
    response_format: { type: "json_object" },
    ...(isArk ? { thinking: { type: "disabled" } } : {}),
  });

  const attempts = 2;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body,
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = payload && payload.error && payload.error.message ? payload.error.message : "";
        logEvent("recognize.upstream", { status: response.status, detail: detail.slice(0, 160) }, "warn");
        if (response.status === 401 || response.status === 403) {
          throw new Error("识别服务鉴权失败，请检查 API Key");
        }
        if (response.status === 429) {
          throw new Error("识别服务繁忙，稍后再试");
        }
        throw new Error("识别服务暂时不可用");
      }

      const text = contentToText(payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content);
      const parsed = parseModelJson(text);
      const drinkName = String(parsed.drinkName || "").trim().slice(0, 60);
      const brand = String(parsed.brand || "").trim().slice(0, 30);
      const category = ["奶茶", "果茶", "咖啡", "其他", "未知"].includes(parsed.category)
        ? parsed.category
        : "未知";
      const priceRaw = Number(parsed.priceHint);
      const priceHint =
        Number.isFinite(priceRaw) && priceRaw > 0 && priceRaw <= 100
          ? Math.round(priceRaw * 10) / 10
          : 0;
      const confidenceRaw = Number(parsed.confidence);
      const confidence = Number.isFinite(confidenceRaw)
        ? Math.min(1, Math.max(0, confidenceRaw))
        : 0.5;
      const brandConfidenceRaw = Number(parsed.brandConfidence);
      const brandConfidence = brand
        ? Number.isFinite(brandConfidenceRaw)
          ? Math.min(1, Math.max(0, brandConfidenceRaw))
          : 0.5
        : 0;

      return { drinkName, brand, brandConfidence, category, priceHint, confidence };
    } catch (err) {
      lastError = err;
      const retryable = err.name !== "AbortError" && isTransientNetworkError(err);
      if (!retryable || attempt === attempts) throw err;
      logEvent("recognize.retry", {
        attempt,
        reason: describeNetworkError(err),
      }, "warn");
      await new Promise((resolve) => setTimeout(resolve, 600));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error("识别失败");
}

app.post("/api/recognize", rateLimit, upload.single("image"), async (req, res) => {
  const startedAt = Date.now();
  if (!req.file) {
    return res.status(400).json({ error: "NO_IMAGE", message: "没有收到图片" });
  }

  if (MOCK_AI) {
    return res.json({
      drinkName: "伯牙绝弦",
      brand: "霸王茶姬",
      brandConfidence: 0.8,
      category: "奶茶",
      priceHint: 18,
      confidence: 0.66,
      mock: true,
    });
  }

  if (!DASHSCOPE_API_KEY) {
    return res.status(503).json({
      error: "AI_NOT_CONFIGURED",
      message: "识别服务还没配置，先手动写饮品名也能保存",
    });
  }

  try {
    const result = await callQwenVision(req.file.buffer, req.file.mimetype);
    logEvent("recognize.ok", {
      bytes: req.file.size,
      ms: Date.now() - startedAt,
      name: result.drinkName,
      brand: result.brand,
      brandConfidence: result.brandConfidence,
      category: result.category,
      priceHint: result.priceHint,
      confidence: result.confidence,
    });
    return res.json(result);
  } catch (err) {
    const timeout = err.name === "AbortError";
    const network = isTransientNetworkError(err);
    logEvent("recognize.failed", {
      bytes: req.file.size,
      ms: Date.now() - startedAt,
      reason: timeout ? "timeout" : describeNetworkError(err),
    }, "warn");
    return res.status(502).json({
      error: timeout ? "AI_TIMEOUT" : network ? "AI_NETWORK" : "AI_FAILED",
      message: timeout
        ? "识别超时，先手动写饮品名也能保存"
        : network
          ? "网络波动，这次没认出来，直接手动写也行"
          : err.message || "识别失败，可以手动写饮品名",
    });
  }
});

const STT_TIMEOUT_MS = 25000;

async function callTranscribe(buffer, mime) {
  const type = String(mime || "audio/webm");
  const ext = type.indexOf("mp4") >= 0 ? "m4a" : type.indexOf("ogg") >= 0 ? "ogg" : "webm";
  const form = new FormData();
  form.append("file", new Blob([buffer], { type }), "voice." + ext);
  form.append("model", STT_MODEL);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);

  try {
    const response = await fetch(`${STT_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${STT_API_KEY}` },
      body: form,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload && payload.error && payload.error.message ? payload.error.message : "";
      logEvent("transcribe.upstream", { status: response.status, detail: detail.slice(0, 160) }, "warn");
      if (response.status === 401 || response.status === 403) {
        throw new Error("转文字服务鉴权失败，语音已经留着");
      }
      if (response.status === 429) throw new Error("转文字服务繁忙，稍后再试");
      throw new Error("转文字暂时不可用，语音已经留着");
    }
    const text = String((payload && (payload.text || payload.transcript)) || "")
      .trim()
      .slice(0, 200);
    if (!text) throw new Error("没听清这段，再试一次或直接手写");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// 语音转文字：音频只在内存里转发一次，不落盘、不写进日志。
app.post("/api/transcribe", sttRateLimit, upload.single("audio"), async (req, res) => {
  const startedAt = Date.now();
  if (!req.file) {
    return res.status(400).json({ error: "NO_AUDIO", message: "没有收到语音" });
  }
  if (!isSttConfigured()) {
    return res.status(503).json({
      error: "STT_NOT_CONFIGURED",
      message: "转文字服务还没配置，语音会保留在记录里",
    });
  }

  try {
    const text = await callTranscribe(req.file.buffer, req.file.mimetype);
    logEvent("transcribe.ok", {
      bytes: req.file.size,
      ms: Date.now() - startedAt,
      chars: text.length,
    });
    return res.json({ text });
  } catch (err) {
    const timeout = err.name === "AbortError";
    const network = isTransientNetworkError(err);
    logEvent("transcribe.failed", {
      bytes: req.file.size,
      ms: Date.now() - startedAt,
      reason: timeout ? "timeout" : describeNetworkError(err),
    }, "warn");
    return res.status(502).json({
      error: timeout ? "STT_TIMEOUT" : network ? "STT_NETWORK" : "STT_FAILED",
      message: timeout
        ? "转文字超时，语音已经留着"
        : network
          ? "网络波动，没转成文字，语音还在"
          : err.message || "转文字没成功，语音还在",
    });
  }
});

const CUTOUT_TIMEOUT_MS = 25000;

async function callRemoveBg(buffer, mime) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CUTOUT_TIMEOUT_MS);

  try {
    const form = new FormData();
    form.append("image_file", new Blob([buffer], { type: mime || "image/jpeg" }), "milk-tea.jpg");
    form.append("size", "auto");
    form.append("format", "png");

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": REMOVEBG_API_KEY,
        Accept: "image/png",
      },
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const first = payload && Array.isArray(payload.errors) ? payload.errors[0] : null;
      const detail = first && first.title ? String(first.title).slice(0, 120) : "";
      logEvent("cutout.upstream", { status: response.status, detail }, "warn");
      if (response.status === 402) {
        throw Object.assign(new Error("抠图额度用完了，先用原图也能做贴纸"), { code: "CUTOUT_QUOTA" });
      }
      if (response.status === 401 || response.status === 403) {
        throw Object.assign(new Error("抠图服务鉴权失败，请检查 Key"), { code: "CUTOUT_AUTH" });
      }
      if (response.status === 429) {
        throw Object.assign(new Error("抠图请求太频繁，稍后再试"), { code: "CUTOUT_BUSY" });
      }
      throw Object.assign(new Error("抠图服务暂时不可用"), { code: "CUTOUT_FAILED" });
    }

    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

// 抠图适配层：目前只有 remove.bg；后续换供应商只需在这里新增一个实现。
const CUTOUT_PROVIDERS = {
  removebg: {
    configured: () => REMOVEBG_API_KEY.length >= 12,
    run: callRemoveBg,
  },
};

function getCutoutProvider() {
  return CUTOUT_PROVIDERS[CUTOUT_PROVIDER] || null;
}

function isCutoutConfigured() {
  const provider = getCutoutProvider();
  return Boolean(provider && provider.configured());
}

app.post("/api/cutout", cutoutRateLimit, upload.single("image"), async (req, res) => {
  const startedAt = Date.now();
  if (!req.file) {
    return res.status(400).json({ error: "NO_IMAGE", message: "没有收到图片" });
  }

  const provider = getCutoutProvider();
  if (!provider || !provider.configured()) {
    return res.status(503).json({
      error: "CUTOUT_NOT_CONFIGURED",
      message: "抠图服务还没配置，会先用原图做贴纸",
    });
  }

  try {
    const png = await provider.run(req.file.buffer, req.file.mimetype);
    logEvent("cutout.ok", {
      bytesIn: req.file.size,
      bytesOut: png.length,
      ms: Date.now() - startedAt,
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    return res.send(png);
  } catch (err) {
    logEvent("cutout.failed", {
      bytes: req.file.size,
      ms: Date.now() - startedAt,
      reason: err.name === "AbortError" ? "timeout" : String(err.message || err).slice(0, 160),
    }, "warn");
    return res.status(502).json({
      error: err.code || (err.name === "AbortError" ? "CUTOUT_TIMEOUT" : "CUTOUT_FAILED"),
      message:
        err.name === "AbortError" ? "抠图超时，可以先用原图做贴纸" : err.message || "抠图失败，可以先用原图",
    });
  }
});

const geoCache = new Map();
const GEO_CACHE_TTL = 24 * 60 * 60 * 1000;

function pickText(value) {
  if (Array.isArray(value)) return "";
  return typeof value === "string" ? value : "";
}

async function reverseGeocode(lat, lng) {
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = geoCache.get(cacheKey);
  if (cached && Date.now() - cached.at < GEO_CACHE_TTL) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
  url.searchParams.set("key", AMAP_KEY);
  url.searchParams.set("location", `${lng},${lat}`);
  url.searchParams.set("extensions", "base");
  url.searchParams.set("radius", "1000");

  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || String(payload.status) !== "1") {
      const info = payload && payload.info ? String(payload.info).slice(0, 80) : `HTTP ${response.status}`;
      throw new Error(`地址服务返回异常：${info}`);
    }

    const regeo = payload.regeocode || (payload.regeocodes && payload.regeocodes[0]) || null;
    const component = (regeo && regeo.addressComponent) || {};
    const province = pickText(component.province);
    const city = pickText(component.city) || province;
    const district = pickText(component.district);
    const value = {
      city,
      district,
      adcode: pickText(component.adcode),
      formatted: regeo && typeof regeo.formatted_address === "string" ? regeo.formatted_address : "",
    };

    geoCache.set(cacheKey, { at: Date.now(), value });
    if (geoCache.size > 500) {
      const oldest = geoCache.keys().next().value;
      if (oldest) geoCache.delete(oldest);
    }
    return value;
  } finally {
    clearTimeout(timer);
  }
}

app.post("/api/geocode", rateLimit, async (req, res) => {
  const startedAt = Date.now();
  const lat = Number(req.body && req.body.lat);
  const lng = Number(req.body && req.body.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: "BAD_COORDS", message: "坐标不合法" });
  }

  if (!AMAP_KEY) {
    return res.status(503).json({
      error: "GEOCODE_NOT_CONFIGURED",
      message: "地址服务还没配置，可以手动填城市/区",
    });
  }

  try {
    const value = await reverseGeocode(lat, lng);
    logEvent("geocode.ok", {
      ms: Date.now() - startedAt,
      city: value.city,
      district: value.district,
    });
    return res.json(value);
  } catch (err) {
    logEvent("geocode.failed", {
      reason: err.name === "AbortError" ? "timeout" : String(err.message || err).slice(0, 160),
    }, "warn");
    return res.status(502).json({
      error: err.name === "AbortError" ? "GEO_TIMEOUT" : "GEO_FAILED",
      message: err.name === "AbortError" ? "定位地址解析超时，可以手动填" : "地址服务暂时不可用，可以手动填",
    });
  }
});

// 城市列表：给前端「选城市」用，按省分组。高德行政区划接口有频控，服务端缓存 7 天。
const cityCache = { at: 0, provinces: null };
const CITY_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const MUNICIPALITIES = new Set(["北京市", "上海市", "天津市", "重庆市", "香港特别行政区", "澳门特别行政区"]);

async function loadProvinces() {
  if (cityCache.provinces && Date.now() - cityCache.at < CITY_CACHE_TTL) {
    return { provinces: cityCache.provinces, cached: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const url = new URL("https://restapi.amap.com/v3/config/district");
  url.searchParams.set("key", AMAP_KEY);
  url.searchParams.set("keywords", "中国");
  url.searchParams.set("subdistrict", "2");
  url.searchParams.set("extensions", "base");

  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || String(payload.status) !== "1") {
      const info = payload && payload.info ? String(payload.info).slice(0, 80) : `HTTP ${response.status}`;
      throw new Error(`行政区划接口返回异常：${info}`);
    }

    const root = (payload.districts && payload.districts[0]) || null;
    const provinces = ((root && root.districts) || [])
      .map((province) => {
        const name = pickText(province.name);
        // 直辖市 / 特别行政区没有「市」这一级（接口会给「北京城区」这类名字），直接用省名当城市。
        const cities =
          MUNICIPALITIES.has(name)
            ? [name]
            : (province.districts || [])
                .filter((item) => item.level === "city")
                .map((item) => pickText(item.name))
                .filter(Boolean);
        cities.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
        return { name, cities };
      })
      .filter((province) => province.name && province.cities.length)
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

    if (!provinces.length) throw new Error("行政区划数据为空");

    cityCache.provinces = provinces;
    cityCache.at = Date.now();
    return { provinces, cached: false };
  } finally {
    clearTimeout(timer);
  }
}

app.get("/api/cities", rateLimit, async (req, res) => {
  const startedAt = Date.now();

  if (!AMAP_KEY) {
    return res.status(503).json({
      error: "CITIES_NOT_CONFIGURED",
      message: "城市列表还没配置，可以直接手填城市",
    });
  }

  try {
    const value = await loadProvinces();
    logEvent("cities.ok", {
      provinces: value.provinces.length,
      cached: value.cached,
      ms: Date.now() - startedAt,
    });
    res.set("Cache-Control", "public, max-age=86400");
    return res.json(value);
  } catch (err) {
    logEvent("cities.failed", {
      reason: err.name === "AbortError" ? "timeout" : String(err.message || err).slice(0, 160),
      ms: Date.now() - startedAt,
    }, "warn");
    return res.status(502).json({
      error: "CITIES_FAILED",
      message: "城市列表暂时拿不到，可以直接手填城市",
    });
  }
});

// 官网介绍页：https://mtl.chesterlee.cn/site/
app.use(
  "/site",
  express.static(SITE_DIR, {
    extensions: ["html"],
    setHeaders(res, filePath) {
      if (/\.(html|js|css)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-store");
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    },
  })
);

app.use(
  express.static(WEB_DIR, {
    extensions: ["html"],
    setHeaders(res, filePath) {
      if (/\.(html|js|css)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-store");
      }
      // nosniff 下 manifest 必须是标准 MIME，否则 Chrome 不认主屏图标
      if (/\.webmanifest$/i.test(filePath)) {
        res.setHeader("Content-Type", "application/manifest+json");
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      // 高德 JS API 用 Referer 校验域名白名单：no-referrer 会让浏览器不带来源，
      // 直接返回 INVALID_USER_DOMAIN（地图加载不出来）。这里只发域名、不发完整路径。
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    },
  })
);

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "NOT_FOUND", message: "接口不存在" });
  }
  return res.status(404).send("Not found");
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "图片太大了，换一张小一点的" : "图片上传失败";
    return res.status(400).json({ error: "UPLOAD_FAILED", message });
  }
  console.error("[mtl] server error", String(err && err.message ? err.message : err).slice(0, 200));
  return res.status(500).json({ error: "SERVER_ERROR", message: "服务出错了，稍后再试" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[mtl] 服务已启动：http://localhost:${PORT}`);
  console.log(`[mtl] AI：${MOCK_AI ? "mock 模式" : DASHSCOPE_API_KEY ? "已配置" : "未配置"}`);
  console.log(`[mtl] 逆地理编码：${AMAP_KEY ? "已配置" : "未配置"}`);
  console.log(`[mtl] 地图（JS API）：${AMAP_JS_KEY ? "已配置" : "未配置（地图区显示暂不可用）"}`);
  console.log(`[mtl] 抠图：${isCutoutConfigured() ? `已配置（${CUTOUT_PROVIDER}）` : "未配置（贴纸降级为原图）"}`);
});
