"use strict";

const path = require("path");
const express = require("express");
const multer = require("multer");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = Number(process.env.PORT || 8830);
const WEB_DIR = path.join(__dirname, "..", "web");

const DASHSCOPE_API_KEY = String(process.env.DASHSCOPE_API_KEY || "").trim();
const DASHSCOPE_BASE_URL = String(
  process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"
).replace(/\/+$/, "");
const DASHSCOPE_MODEL = String(process.env.DASHSCOPE_MODEL || "qwen-vl-max-latest").trim();
const AMAP_KEY = String(process.env.AMAP_KEY || "").trim();
const REMOVEBG_API_KEY = String(process.env.REMOVEBG_API_KEY || "").trim();
// 抠图供应商开关：remove.bg 将于 2026-12-01 停止独立服务，换供应商时只改这里。
const CUTOUT_PROVIDER = String(process.env.CUTOUT_PROVIDER || "removebg").trim().toLowerCase();
const MOCK_AI = String(process.env.MOCK_AI || "0") === "1";

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
    cutoutConfigured: isCutoutConfigured(),
    mockAi: MOCK_AI,
  });
});

const RECOGNIZE_PROMPT = [
  "你是奶茶记录助手。看这张照片，只识别杯贴、杯套或小票上的饮品信息。",
  "只输出一个 JSON 对象，不要 Markdown，不要解释。格式：",
  '{"drinkName":"具体饮品名","category":"奶茶|果茶|咖啡|其他|未知","confidence":0.0}',
  "规则：",
  "1. drinkName 只填具体饮品名，例如“伯牙绝弦”；不要填品牌名、价格、糖度、小料。",
  "2. 如果只能看到品牌、看不到具体饮品名，drinkName 返回空字符串，并降低 confidence。",
  "3. 如果照片里没有杯子或文字，drinkName 返回空字符串，category 返回“未知”，confidence 低于 0.3。",
  "4. confidence 是 0 到 1 的小数，表示你对 drinkName 的把握。",
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
    max_tokens: 200,
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
        console.warn("[mtl] recognize upstream", response.status, detail.slice(0, 160));
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
      const category = ["奶茶", "果茶", "咖啡", "其他", "未知"].includes(parsed.category)
        ? parsed.category
        : "未知";
      const confidenceRaw = Number(parsed.confidence);
      const confidence = Number.isFinite(confidenceRaw)
        ? Math.min(1, Math.max(0, confidenceRaw))
        : 0.5;

      return { drinkName, category, confidence };
    } catch (err) {
      lastError = err;
      const retryable = err.name !== "AbortError" && isTransientNetworkError(err);
      if (!retryable || attempt === attempts) throw err;
      console.warn("[mtl] recognize retry", {
        attempt,
        reason: describeNetworkError(err),
      });
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
      category: "奶茶",
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
    console.log("[mtl] recognize ok", {
      bytes: req.file.size,
      ms: Date.now() - startedAt,
      hasName: Boolean(result.drinkName),
    });
    return res.json(result);
  } catch (err) {
    const timeout = err.name === "AbortError";
    const network = isTransientNetworkError(err);
    console.warn("[mtl] recognize failed", {
      bytes: req.file.size,
      ms: Date.now() - startedAt,
      reason: timeout ? "timeout" : describeNetworkError(err),
    });
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
      console.warn("[mtl] cutout upstream", response.status, detail);
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
    console.log("[mtl] cutout ok", {
      bytesIn: req.file.size,
      bytesOut: png.length,
      ms: Date.now() - startedAt,
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    return res.send(png);
  } catch (err) {
    console.warn("[mtl] cutout failed", {
      bytes: req.file.size,
      ms: Date.now() - startedAt,
      reason: err.name === "AbortError" ? "timeout" : String(err.message || err).slice(0, 160),
    });
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
    console.log("[mtl] geocode ok", { ms: 0, hasCity: Boolean(value.city) });
    return res.json(value);
  } catch (err) {
    console.warn("[mtl] geocode failed", {
      reason: err.name === "AbortError" ? "timeout" : String(err.message || err).slice(0, 160),
    });
    return res.status(502).json({
      error: err.name === "AbortError" ? "GEO_TIMEOUT" : "GEO_FAILED",
      message: err.name === "AbortError" ? "定位地址解析超时，可以手动填" : "地址服务暂时不可用，可以手动填",
    });
  }
});

app.use(
  express.static(WEB_DIR, {
    extensions: ["html"],
    setHeaders(res, filePath) {
      if (/\.(html|js|css)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-store");
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
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
  console.log(`[mtl] 抠图：${isCutoutConfigured() ? `已配置（${CUTOUT_PROVIDER}）` : "未配置（贴纸降级为原图）"}`);
});
