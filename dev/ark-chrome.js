"use strict";

// 火山方舟 Key 申请用的临时浏览器助手：启动本机真实 Chrome，并支持查看/点击页面。
// 用法：
//   node dev/ark-chrome.js launch [url]   启动可见的 Chrome（独立 profile，登录态会保留）
//   node dev/ark-chrome.js state          打印当前页面地址/标题/可见文字，并截图到 .autoshot/ark-shot.png
//   node dev/ark-chrome.js click "文字"   点击页面上第一处包含该文字且可见的元素
//   node dev/ark-chrome.js goto <url>     打开新地址

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, ".autoshot");
const PROFILE_DIR = path.join(OUT_DIR, "chrome-profile");
const SHOT_PATH = path.join(OUT_DIR, "ark-shot.png");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.ARK_CDP_PORT || 9444);

function assertPortFree() {
  const net = require("net");
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", (err) => reject(new Error(`调试端口 ${PORT} 已被占用（${err.code}），换一个 ARK_CDP_PORT`)));
    srv.once("listening", () => srv.close(() => resolve()));
    srv.listen(PORT, "127.0.0.1");
  });
}

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function launch(url) {
  ensureOutDir();
  await assertPortFree();
  const child = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      url || "https://console.volcengine.com/ark",
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
  console.log("[ark] 已启动本机 Chrome（可见窗口），profile:", PROFILE_DIR);
}

async function connect() {
  return chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 15000 });
}

function pickPage(browser) {
  const contexts = browser.contexts();
  const ctx = contexts[0];
  if (!ctx) throw new Error("没有可用的浏览器上下文");
  const pages = ctx.pages().filter((p) => !/^(chrome|devtools|about):/.test(p.url()));
  const wantIndex = process.env.ARK_PAGE_INDEX ? Number(process.env.ARK_PAGE_INDEX) : -1;
  if (wantIndex >= 0) {
    if (!pages[wantIndex]) throw new Error(`没有第 ${wantIndex} 个标签页`);
    return pages[wantIndex];
  }
  return pages[pages.length - 1] || ctx.pages()[ctx.pages().length - 1] || ctx.newPage();
}

async function withPage(fn) {
  const browser = await connect();
  try {
    const page = pickPage(browser);
    await page.bringToFront();
    return await fn(page);
  } finally {
    // 只断开连接，不关闭用户正在看的窗口
    await browser.close().catch(() => {});
  }
}

async function printState(page) {
  const title = await page.title();
  const url = page.url();
  const text = await page.evaluate(() => (document.body ? document.body.innerText : ""));
  const clickable = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll("button, a, [role='button'], [class*='tab'], [class*='menu']").forEach((el) => {
      const t = (el.innerText || "").replace(/\s+/g, " ").trim();
      const rect = el.getBoundingClientRect();
      if (!t || t.length > 30 || rect.width === 0 || rect.height === 0) return;
      items.push(t);
    });
    return Array.from(new Set(items)).slice(0, 80);
  });

  console.log("[ark] URL:", url);
  console.log("[ark] TITLE:", title);
  console.log("[ark] CLICKABLE:", clickable.join(" | "));
  console.log("[ark] TEXT_START");
  console.log(text.replace(/\n{2,}/g, "\n").slice(0, 3000));
  console.log("[ark] TEXT_END");
}

async function clickText(page, text) {
  const loc = page.getByText(text, { exact: false });
  const count = await loc.count();
  for (let i = count - 1; i >= 0; i -= 1) {
    const el = loc.nth(i);
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 10000 });
      await page.waitForTimeout(1200);
      console.log(`[ark] 已点击：${text}`);
      return;
    }
  }
  throw new Error(`页面上没找到可点击文字：${text}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  ensureOutDir();

  if (cmd === "launch") {
    await launch(rest[0]);
    return;
  }

  if (cmd === "state") {
    await withPage(async (page) => {
      await page.screenshot({ path: SHOT_PATH, fullPage: false });
      console.log("[ark] 截图:", SHOT_PATH);
      await printState(page);
    });
    return;
  }

  if (cmd === "goto") {
    if (!rest[0]) throw new Error("缺少地址");
    await withPage(async (page) => {
      await page.goto(rest[0], { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
      console.log("[ark] 已打开:", page.url());
    });
    return;
  }

  if (cmd === "xy") {
    const [x, y] = [Number(rest[0]), Number(rest[1])];
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("缺少坐标");
    await withPage(async (page) => {
      await page.mouse.click(x, y);
      await page.waitForTimeout(1200);
      console.log(`[ark] 已在 (${x}, ${y}) 点击`);
      await page.screenshot({ path: SHOT_PATH, fullPage: false });
    });
    return;
  }

  if (cmd === "click") {
    if (!rest[0]) throw new Error("缺少要点击的文字");
    await withPage(async (page) => {
      await clickText(page, rest[0]);
      await page.screenshot({ path: SHOT_PATH, fullPage: false });
      console.log("[ark] 截图:", SHOT_PATH);
    });
    return;
  }

  if (cmd === "sel") {
    if (!rest[0]) throw new Error("缺少选择器");
    await withPage(async (page) => {
      const target = page.locator(rest[0]).filter({ visible: true }).first();
      await target.click({ timeout: 10000 });
      await page.waitForTimeout(1000);
      console.log("[ark] 已点击选择器:", rest[0]);
      await page.screenshot({ path: SHOT_PATH, fullPage: false });
    });
    return;
  }

  if (cmd === "rowclick") {
    const [rowText, linkText] = rest;
    if (!rowText || !linkText) throw new Error("用法：rowclick <行内文字> <要点击的文字>");
    await withPage(async (page) => {
      const row = page.locator(`tr:has-text("${rowText}")`).last();
      const link = row.getByText(linkText, { exact: true }).first();
      await link.click({ force: true });
      await page.waitForTimeout(1500);
      console.log(`[ark] 已在「${rowText}」行点击「${linkText}」`);
      const dialogs = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[role=dialog], [class*=modal], [class*=Modal]"))
          .filter((e) => e.getBoundingClientRect().width > 0)
          .map((e) => (e.innerText || "").replace(/\n+/g, " | ").slice(0, 600))
      );
      console.log("[ark] 弹窗:", JSON.stringify(dialogs.slice(0, 2)));
      await page.screenshot({ path: SHOT_PATH, fullPage: false });
    });
    return;
  }

  if (cmd === "key") {
    if (!rest[0]) throw new Error("缺少按键名");
    await withPage(async (page) => {
      await page.keyboard.press(rest[0]);
      await page.waitForTimeout(800);
      console.log("[ark] 已按键:", rest[0]);
      await page.screenshot({ path: SHOT_PATH, fullPage: false });
    });
    return;
  }

  if (cmd === "js") {
    if (!rest[0]) throw new Error("缺少要执行的 JS");
    await withPage(async (page) => {
      const code = rest.join(" ");
      const result = await page.evaluate((src) => {
        try {
          // eslint-disable-next-line no-new-func
          const out = new Function(`return (${src})`)();
          return JSON.stringify(out, null, 1);
        } catch (err) {
          return `JS_ERROR: ${err.message}`;
        }
      }, code);
      console.log(String(result).slice(0, 3000));
    });
    return;
  }

  if (cmd === "tabs") {
    const browser = await connect();
    try {
      const pages = browser.contexts()[0].pages();
      for (let i = 0; i < pages.length; i += 1) {
        const p = pages[i];
        if (/^(chrome|devtools|about):/.test(p.url())) continue;
        const logged = await p
          .evaluate(() => (document.body ? document.body.innerText.includes("退出登录") : false))
          .catch(() => false);
        console.log(`[${i}] 已登录=${logged} | ${await p.title().catch(() => "")} | ${p.url()}`);
      }
    } finally {
      await browser.close().catch(() => {});
    }
    return;
  }

  if (cmd === "savekey") {
    // 轮询页面上一次性展示的 API Key，拿到后直接写入 .env（终端只打印掩码）
    const envPath = path.join(ROOT, ".env");
    const deadline = Date.now() + Number(rest[0] || 180000);
    let saved = "";
    while (Date.now() < deadline && !saved) {
      const browser = await connect();
      try {
        const page = pickPage(browser);
        const candidates = await page.evaluate(() => {
          const nodes = Array.from(document.querySelectorAll("[role=dialog], [class*=modal], [class*=Modal], [class*=drawer]")).filter(
            (e) => e.getBoundingClientRect().width > 0
          );
          const texts = [];
          nodes.forEach((n) => texts.push(n.innerText || ""));
          Array.from(document.querySelectorAll("input, textarea")).forEach((i) => texts.push(i.value || ""));
          return texts;
        });
        for (const text of candidates) {
          const match = String(text).match(/[A-Za-z0-9][A-Za-z0-9_-]{29,}/);
          if (match && !match[0].startsWith("api-key-") && !match[0].startsWith("apikey-")) {
            saved = match[0];
            break;
          }
        }
      } finally {
        await browser.close().catch(() => {});
      }
      if (!saved) await new Promise((r) => setTimeout(r, 1500));
    }

    if (!saved) {
      console.error("[ark] 超时：没在页面上看到完整 Key");
      process.exit(1);
    }

    const current = fs.readFileSync(envPath, "utf8");
    const next = current.replace(/^DASHSCOPE_API_KEY=.*$/m, `DASHSCOPE_API_KEY=${saved}`);
    fs.writeFileSync(envPath, next);
    console.log(`[ark] 已写入 .env：${saved.slice(0, 4)}…${saved.slice(-4)}（长度 ${saved.length}）`);
    return;
  }

  if (cmd === "watchkey") {
    // 监听「创建 API Key」的接口响应，从返回体里取明文 Key，写入 .env（只打印掩码）
    const envPath = path.join(ROOT, ".env");
    const browser = await connect();
    const page = pickPage(browser);
    let saved = "";

    page.on("response", async (res) => {
      try {
        const req = res.request();
        if (req.method() !== "POST") return;
        if (!/key|credential|token/i.test(res.url())) return;
        const body = await res.text();
        const named = body.match(/"(?:api_?[Kk]ey|ApiKey|key)"\s*:\s*"([A-Za-z0-9][A-Za-z0-9_-]{19,})"/);
        if (named) {
          saved = named[1];
          return;
        }
        const anyToken = body.match(/"([A-Za-z0-9][A-Za-z0-9_-]{29,})"/);
        if (anyToken && !/^api-key-|^apikey-/.test(anyToken[1])) saved = anyToken[1];
      } catch (err) {
        // 忽略解析失败
      }
    });

    const deadline = Date.now() + Number(rest[0] || 180000);
    while (Date.now() < deadline && !saved) {
      await new Promise((r) => setTimeout(r, 400));
    }
    await browser.close().catch(() => {});

    if (!saved) {
      console.error("[ark] 超时：没有截获到 Key");
      process.exit(1);
    }

    const current = fs.readFileSync(envPath, "utf8");
    const next = current.replace(/^DASHSCOPE_API_KEY=.*$/m, `DASHSCOPE_API_KEY=${saved}`);
    fs.writeFileSync(envPath, next);
    console.log(`[ark] 已写入 .env：${saved.slice(0, 4)}…${saved.slice(-4)}（长度 ${saved.length}）`);
    return;
  }

  throw new Error(`未知命令：${cmd}`);
}

main().catch((err) => {
  console.error("[ark] 失败：", err.message);
  process.exit(1);
});
