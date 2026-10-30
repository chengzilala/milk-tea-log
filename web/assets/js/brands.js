/**
 * 品牌字典（纯前端，不含任何 Key，也不含第三方商标图片）。
 * 视觉统一用「品牌主色 + 短名」的徽章表示，产品不暗示与任何品牌方有官方合作。
 */
(function () {
  "use strict";

  // color 取品牌主色（做了可读性微调），short 是徽章里最多两个字的识别符。
  const LIST = [
    { id: "mixue", name: "蜜雪冰城", short: "蜜雪", color: "#e6002d", aliases: ["蜜雪", "MIXUE", "雪王"] },
    { id: "chagee", name: "霸王茶姬", short: "茶姬", color: "#14544c", aliases: ["霸王", "CHAGEE"] },
    { id: "heytea", name: "喜茶", short: "喜茶", color: "#1b1b1b", aliases: ["HEYTEA"] },
    { id: "nayuki", name: "奈雪的茶", short: "奈雪", color: "#8fae2e", aliases: ["奈雪", "NAYUKI"] },
    { id: "chapanda", name: "茶百道", short: "茶百", color: "#1f6fb2", aliases: ["ChaPanda", "CHAPANDA"] },
    { id: "guming", name: "古茗", short: "古茗", color: "#2f7d4f", aliases: ["GUMING"] },
    { id: "auntea", name: "沪上阿姨", short: "沪上", color: "#e2231a", aliases: ["沪上", "AUNTEA JENNY", "AUNTEA"] },
    { id: "shuyi", name: "书亦烧仙草", short: "书亦", color: "#7a4b9e", aliases: ["书亦", "Shuyi"] },
    { id: "yihetang", name: "益禾堂", short: "益禾", color: "#00a05a", aliases: ["益禾", "YIHETANG"] },
    { id: "coco", name: "CoCo都可", short: "Co", color: "#f26a21", aliases: ["都可", "COCO", "CoCo"] },
    { id: "yidiandian", name: "一点点", short: "一点", color: "#0a7a44", aliases: ["1点点", "一點點"] },
    { id: "chayan", name: "茶颜悦色", short: "茶颜", color: "#1b6b63", aliases: ["茶颜", "Sexy Tea"] },
    { id: "tianlala", name: "甜啦啦", short: "甜啦", color: "#f5a623", aliases: ["SweetLala"] },
    { id: "ashui", name: "阿水大杯茶", short: "阿水", color: "#1f8ecf", aliases: ["阿水"] },
    { id: "lelecha", name: "乐乐茶", short: "乐乐", color: "#e34b3f", aliases: ["LELECHA"] },
    { id: "qifentian", name: "7分甜", short: "七分", color: "#ff8a1f", aliases: ["七分甜"] },
    { id: "moshuang", name: "茉酸奶", short: "茉酸", color: "#4f8f6a", aliases: ["More Yogurt"] },
    { id: "moli", name: "茉莉奶白", short: "茉莉", color: "#2f5d50", aliases: ["Moli"] },
    { id: "ama", name: "阿嬷手作", short: "阿嬷", color: "#8b5e3c", aliases: ["阿嬷"] },
    { id: "guigui", name: "桂桂茶", short: "桂桂", color: "#b58b2a", aliases: ["桂桂"] },
    { id: "chahuanong", name: "茶话弄", short: "茶话", color: "#c0392b", aliases: ["茶话"] },
    { id: "ningji", name: "柠季", short: "柠季", color: "#f2c200", aliases: ["柠季手打柠檬茶"] },
    { id: "luckin", name: "瑞幸咖啡", short: "瑞", color: "#22357a", aliases: ["瑞幸", "luckin", "Luckin Coffee"] },
    { id: "cotti", name: "库迪咖啡", short: "库", color: "#c8102e", aliases: ["库迪", "COTTI"] },
    { id: "manner", name: "Manner", short: "M", color: "#6b4c3a", aliases: ["Manner Coffee", "曼纳"] },
    { id: "starbucks", name: "星巴克", short: "星", color: "#00704a", aliases: ["Starbucks", "星巴克咖啡"] },
    { id: "luckycup", name: "幸运咖", short: "幸", color: "#f0a01e", aliases: ["Lucky Cup"] },
    { id: "nowwa", name: "挪瓦咖啡", short: "挪", color: "#e85d25", aliases: ["挪瓦", "NOWWA"] },
    { id: "happylemon", name: "快乐柠檬", short: "快乐", color: "#f4c400", aliases: ["Happy Lemon"] },
    { id: "gongcha", name: "贡茶", short: "贡", color: "#6b4c3a", aliases: ["Gong Cha"] },
  ];

  const FALLBACK_COLORS = ["#8b6f5c", "#7a8b6f", "#6f7f8b", "#8b6f7f", "#7f6f8b", "#8b826f"];

  // 归一化：去空格、括号里的门店信息、常见标点与结尾「店」。
  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[（(【\[].*?[）)】\]]/g, "")
      .replace(/[\s·・\-_/\\,，.。:：'"「」《》]/g, "")
      .replace(/[（(【\[）)】\]]/g, "")
      .replace(/门店$|店$/, "");
  }

  function readableInk(hex) {
    const raw = String(hex || "").replace("#", "");
    if (raw.length !== 6) return "#ffffff";
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.62 ? "#231b16" : "#ffffff";
  }

  function hashColor(text) {
    let sum = 0;
    Array.from(String(text || "")).forEach((ch) => {
      sum += ch.codePointAt(0) || 0;
    });
    return FALLBACK_COLORS[sum % FALLBACK_COLORS.length];
  }

  LIST.forEach((brand) => {
    brand.ink = readableInk(brand.color);
  });

  // 长别名优先，避免「茶百」之类短串抢先命中。
  const INDEX = [];
  LIST.forEach((brand) => {
    [brand.name].concat(brand.aliases || []).forEach((alias) => {
      const key = normalize(alias);
      if (key) INDEX.push({ key, brand });
    });
  });
  INDEX.sort((a, b) => b.key.length - a.key.length);

  function find(text) {
    const key = normalize(text);
    if (!key) return null;
    const exact = INDEX.find((item) => item.key === key);
    if (exact) return exact.brand;
    const partial = INDEX.find((item) => key.indexOf(item.key) >= 0);
    return partial ? partial.brand : null;
  }

  // 未收录的品牌也返回一个可渲染的兜底对象（首字 + 稳定配色）。
  function resolve(text) {
    const name = String(text || "").trim();
    if (!name) return null;
    const matched = find(name);
    if (matched) return matched;
    const chars = Array.from(name);
    return {
      id: "custom:" + normalize(name),
      name,
      short: chars[0] || "茶",
      color: hashColor(name),
      ink: "#ffffff",
      custom: true,
    };
  }

  function matchId(text) {
    const brand = find(text);
    return brand ? brand.id : "";
  }

  function toBrand(brandOrText) {
    if (!brandOrText) return null;
    return typeof brandOrText === "string" ? resolve(brandOrText) : brandOrText;
  }

  // size: "sm"（列表 / 卡片角标）| "lg"（品牌墙）
  function badge(brandOrText, size) {
    const brand = toBrand(brandOrText);
    if (!brand) return null;
    const el = document.createElement("span");
    el.className = "mtl-brand-badge" + (size ? " is-" + size : "");
    el.style.setProperty("--brand-color", brand.color);
    el.style.setProperty("--brand-ink", brand.ink);
    el.textContent = brand.short;
    el.title = brand.name;
    el.setAttribute("aria-label", brand.name);
    return el;
  }

  window.MtlBrands = {
    list: LIST,
    find,
    resolve,
    matchId,
    badge,
  };
})();
