"use strict";

/**
 * 统一日志落盘（服务端）。
 *
 * - 服务端自己的事件写 logs/server-YYYY-MM-DD.jsonl；
 * - 前端上报的流程日志写 logs/client-YYYY-MM-DD.jsonl。
 * 只记流程与结果，不记图片内容、不记任何 Key；日志目录已加入 .gitignore。
 */

const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");

function pad(n) {
  return String(n).padStart(2, "0");
}

function dayKey(date) {
  const d = date || new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function append(fileName, lines) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, fileName), lines);
  } catch (err) {
    console.warn("[mtl] 写日志失败", String((err && err.message) || err).slice(0, 160));
  }
}

function logEvent(event, data, level) {
  const entry = { t: new Date().toISOString(), event, data: data || {} };
  if (level === "warn") console.warn("[mtl]", event, entry.data);
  else console.log("[mtl]", event, entry.data);
  append(`server-${dayKey()}.jsonl`, JSON.stringify(entry) + "\n");
}

function writeClientEvents(events, meta) {
  const ua = String((meta && meta.ua) || "").slice(0, 300);
  const lines = [];
  events.forEach((item) => {
    if (!item || typeof item !== "object") return;
    lines.push(
      JSON.stringify({
        t: String(item.t || "").slice(0, 40),
        sid: String(item.sid || "").slice(0, 40),
        level: String(item.level || "info").slice(0, 10),
        event: String(item.event || "").slice(0, 60),
        data: item.data && typeof item.data === "object" ? item.data : {},
        ua,
      })
    );
  });
  if (!lines.length) return 0;
  append(`client-${dayKey()}.jsonl`, lines.join("\n") + "\n");
  return lines.length;
}

module.exports = { logEvent, writeClientEvents, LOG_DIR };
