/**
 * 品牌菜单库（纯前端静态数据，不含任何 Key，也不含品牌 logo / 商标图片）。
 * 只收各品牌「常驻、认知度高」的单品，用来做三件事：
 *   1. AI 认出名字后对齐到标准写法（去掉杯型 / 冰量 / 括号等噪声）；
 *   2. 认出品牌但没认出单品时，给出该品牌的常见款候选；
 *   3. 全品牌搜饮品名，少打字。
 * price 是门店常见价位的估价，只用于「约 ¥」提示，不是官方定价；
 * 菜单会随季节调整，以门店实际为准。用户自己记过的名字由 app.js 合并进来。
 */
(function () {
  "use strict";

  const BRAND_MENU = {
    mixue: [
      { name: "冰鲜柠檬水", aliases: ["柠檬水"], price: 4, hot: 5 },
      { name: "珍珠奶茶", price: 6, hot: 4 },
      { name: "满杯百香果", price: 7, hot: 4 },
      { name: "蜜桃四季春", price: 7, hot: 4 },
      { name: "草莓摇摇奶昔", price: 8, hot: 4 },
      { name: "茉莉奶绿", price: 7, hot: 3 },
      { name: "雪王雪顶咖啡", price: 8, hot: 3 },
      { name: "芝士奶盖四季春", price: 8, hot: 2 },
      { name: "棒打鲜橙", price: 7, hot: 2 },
      { name: "摩天脆脆", price: 6, hot: 2 },
    ],
    chagee: [
      { name: "伯牙绝弦", price: 18, hot: 5 },
      { name: "桂馥兰香", price: 20, hot: 5 },
      { name: "白雾红尘", price: 18, hot: 4 },
      { name: "桂子飘飘", price: 18, hot: 3 },
      { name: "青青糯山", price: 20, hot: 3 },
      { name: "春日桃桃", price: 22, hot: 3 },
      { name: "凤栖绿桂", price: 18, hot: 3 },
      { name: "万里木兰", price: 20, hot: 3 },
      { name: "青沫观音", price: 18, hot: 2 },
      { name: "山野栀子", price: 18, hot: 2 },
      { name: "花田乌龙", price: 18, hot: 2 },
      { name: "金乌扶摇", price: 20, hot: 2 },
    ],
    heytea: [
      { name: "多肉葡萄", price: 18, hot: 5 },
      { name: "烤黑糖波波牛乳", price: 19, hot: 5 },
      { name: "芝芝莓莓", price: 19, hot: 4 },
      { name: "芝芝桃桃", price: 19, hot: 3 },
      { name: "满杯红柚", price: 18, hot: 3 },
      { name: "多肉青提", price: 19, hot: 3 },
      { name: "芋泥波波", price: 17, hot: 2 },
      { name: "生打椰椰", price: 16, hot: 2 },
      { name: "纯绿妍茶后", price: 13, hot: 2 },
      { name: "喜柿多多", price: 19, hot: 2 },
    ],
    nayuki: [
      { name: "霸气芝士草莓", price: 26, hot: 4 },
      { name: "霸气葡萄", price: 26, hot: 4 },
      { name: "霸气橙子", price: 22, hot: 3 },
      { name: "鸭屎香宝藏茶", price: 19, hot: 3 },
      { name: "金色山脉宝藏茶", price: 19, hot: 2 },
      { name: "芋泥宝藏茶", price: 19, hot: 2 },
    ],
    chapanda: [
      { name: "杨枝甘露", price: 18, hot: 5 },
      { name: "豆乳玉麒麟", price: 17, hot: 4 },
      { name: "芋泥啵啵奶茶", price: 16, hot: 3 },
      { name: "招牌芋圆奶茶", price: 15, hot: 3 },
      { name: "桂花酒酿奶茶", price: 15, hot: 3 },
      { name: "生椰西瓜", price: 16, hot: 2 },
      { name: "茉莉奶绿", price: 13, hot: 2 },
    ],
    guming: [
      { name: "超A芝士葡萄", aliases: ["芝士葡萄"], price: 19, hot: 5 },
      { name: "布蕾脆脆奶芙", price: 16, hot: 5 },
      { name: "杨枝甘露", price: 15, hot: 4 },
      { name: "超A多肉葡萄", price: 18, hot: 4 },
      { name: "招牌柠檬茶", price: 10, hot: 3 },
      { name: "云岭茉莉白", price: 14, hot: 2 },
      { name: "龙井香青团", price: 16, hot: 2 },
    ],
    auntea: [
      { name: "血糯米奶茶", price: 12, hot: 4 },
      { name: "杨枝甘露", price: 16, hot: 3 },
      { name: "芋泥波波奶茶", price: 14, hot: 3 },
    ],
    shuyi: [
      { name: "书亦烧仙草", aliases: ["烧仙草"], price: 12, hot: 4 },
      { name: "杨枝甘露", price: 15, hot: 3 },
      { name: "芋泥啵啵", price: 14, hot: 2 },
    ],
    yihetang: [
      { name: "益禾烤奶", aliases: ["烤奶"], price: 10, hot: 5 },
      { name: "杨枝甘露", price: 13, hot: 3 },
      { name: "蜂蜜柚子茶", price: 9, hot: 2 },
    ],
    coco: [
      { name: "珍珠奶茶", price: 12, hot: 5 },
      { name: "奶茶三兄弟", price: 15, hot: 4 },
      { name: "百香双响炮", price: 14, hot: 4 },
      { name: "鲜芋青稞牛奶", price: 16, hot: 3 },
      { name: "莓莓果茶", price: 15, hot: 2 },
    ],
    yidiandian: [
      { name: "波霸奶茶", price: 12, hot: 5 },
      { name: "四季春珍波椰", price: 14, hot: 3 },
      { name: "阿华田", price: 14, hot: 3 },
      { name: "红茶玛奇朵", price: 13, hot: 3 },
      { name: "冰淇淋红茶", price: 12, hot: 3 },
      { name: "波霸奶绿", price: 13, hot: 2 },
    ],
    chayan: [
      { name: "幽兰拿铁", price: 18, hot: 5 },
      { name: "声声乌龙", price: 17, hot: 4 },
      { name: "桂花弄", price: 16, hot: 3 },
      { name: "烟花易冷", price: 17, hot: 3 },
      { name: "素颜锡兰", price: 16, hot: 3 },
      { name: "筝筝纸鸢", price: 17, hot: 2 },
      { name: "人间烟火", price: 18, hot: 2 },
      { name: "岭南佳荔", price: 18, hot: 2 },
    ],
    tianlala: [{ name: "一桶水果茶", price: 15, hot: 4 }],
    ningji: [
      { name: "手打柠檬茶", price: 12, hot: 5 },
      { name: "鸭屎香柠檬茶", price: 15, hot: 4 },
    ],
    lelecha: [
      { name: "脏脏茶", price: 20, hot: 3 },
      { name: "酪酪葡萄", price: 22, hot: 3 },
      { name: "酪酪草莓", price: 22, hot: 2 },
    ],
    qifentian: [
      { name: "杨枝甘露", price: 18, hot: 4 },
      { name: "芒果西米露", price: 16, hot: 2 },
    ],
    ama: [
      { name: "黑糖珍珠鲜奶", price: 22, hot: 3 },
      { name: "芋泥啵啵鲜奶", price: 22, hot: 2 },
    ],
    luckin: [
      { name: "生椰拿铁", price: 19, hot: 5 },
      { name: "厚乳拿铁", price: 18, hot: 4 },
      { name: "橙C美式", price: 15, hot: 4 },
      { name: "椰云拿铁", price: 19, hot: 4 },
      { name: "拿铁", price: 16, hot: 4 },
      { name: "标准美式", aliases: ["美式"], price: 13, hot: 4 },
      { name: "丝绒拿铁", price: 18, hot: 3 },
      { name: "陨石拿铁", price: 19, hot: 3 },
      { name: "碧螺知春拿铁", price: 19, hot: 3 },
    ],
    cotti: [
      { name: "生椰拿铁", price: 12, hot: 4 },
      { name: "潘帕斯蓝", price: 14, hot: 3 },
      { name: "柚见美式", price: 12, hot: 3 },
      { name: "拿铁", price: 12, hot: 3 },
    ],
    manner: [
      { name: "拿铁", price: 19, hot: 4 },
      { name: "美式", price: 15, hot: 4 },
      { name: "燕麦拿铁", price: 21, hot: 3 },
      { name: "桂花拿铁", price: 22, hot: 2 },
    ],
    starbucks: [
      { name: "拿铁", price: 30, hot: 4 },
      { name: "美式", price: 28, hot: 4 },
      { name: "焦糖玛奇朵", price: 33, hot: 3 },
      { name: "抹茶星冰乐", price: 33, hot: 3 },
      { name: "摩卡星冰乐", price: 33, hot: 2 },
    ],
    luckycup: [
      { name: "拿铁", price: 8, hot: 4 },
      { name: "生椰拿铁", price: 10, hot: 4 },
      { name: "美式", price: 7, hot: 3 },
    ],
    nowwa: [
      { name: "生椰拿铁", price: 15, hot: 3 },
      { name: "拿铁", price: 15, hot: 2 },
    ],
  };

  // 归一化：去括号内容、空格标点、杯型 / 冰量 / 糖度等规格词，避免同款多种写法。
  const SPEC_WORDS =
    /(超大杯|大杯|中杯|小杯|标准杯|加大杯|正常冰|少冰|去冰|多冰|常温|加冰|热饮|冷饮|正常糖|标准糖|少糖|半糖|七分糖|三分糖|无糖|全糖|不另外加糖|去糖|微糖|少甜)/g;

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[（(【\[].*?[）)】\]]/g, "")
      .replace(/[（(【\[）)】\]]/g, "")
      .replace(/[\s·・\-_/\\,，.。:：'"「」《》]/g, "")
      .replace(SPEC_WORDS, "");
  }

  function brandList() {
    return (window.MtlBrands && window.MtlBrands.list) || [];
  }

  function brandNameOf(id) {
    const brand = brandList().find((item) => item.id === id);
    return brand ? brand.name : "";
  }

  function resolveBrandId(text) {
    const raw = String(text || "").trim();
    if (!raw) return "";
    if (BRAND_MENU[raw]) return raw;
    if (window.MtlBrands) {
      const brand = window.MtlBrands.find(raw);
      if (brand) return brand.id;
    }
    return "";
  }

  function hasBrand(brandId) {
    return Boolean(brandId && BRAND_MENU[brandId] && BRAND_MENU[brandId].length);
  }

  function itemsFor(brandId) {
    return (BRAND_MENU[brandId] || []).map((item) => ({
      brandId,
      brandName: brandNameOf(brandId),
      name: item.name,
      aliases: item.aliases || [],
      price: item.price || 0,
      hot: item.hot || 1,
    }));
  }

  function allItems() {
    const list = [];
    Object.keys(BRAND_MENU).forEach((brandId) => {
      itemsFor(brandId).forEach((item) => list.push(item));
    });
    return list;
  }

  // 先在指定品牌里找，再退回全部品牌；extras 是用户自己记过 / 手填补充的名字。
  function matchIn(pool, key) {
    let hit = pool.find(
      (item) => normalize(item.name) === key || (item.aliases || []).some((alias) => normalize(alias) === key)
    );
    if (hit) return hit;
    return (
      pool.find((item) => {
        const itemKey = normalize(item.name);
        if (!itemKey || itemKey.length < 3) return false;
        const index = key.indexOf(itemKey);
        return index >= 0 && key.length - itemKey.length <= 4;
      }) || null
    );
  }

  function matchName(name, brandOrText, extras) {
    const key = normalize(name);
    if (!key) return null;
    const brandId = resolveBrandId(brandOrText);
    const extraList = (extras || []).map((entry) => ({
      brandId: entry.brandId || "",
      brandName: entry.brandName || brandNameOf(entry.brandId || ""),
      name: entry.name,
      aliases: [],
      price: 0,
      hot: 0,
    }));
    if (brandId) {
      const brandPool = itemsFor(brandId).concat(extraList.filter((entry) => entry.brandId === brandId));
      const hit = matchIn(brandPool, key);
      if (hit) return hit;
    }
    return matchIn(allItems().concat(extraList), key);
  }

  function scoreKey(key, query) {
    if (!key || !query) return 0;
    if (key === query) return 100;
    if (key.indexOf(query) === 0) return 80;
    if (key.indexOf(query) > 0) return 60;
    if (query.length >= 2 && query.indexOf(key) >= 0) return 45;
    return 0;
  }

  /**
   * 全品牌搜索。
   * @param {string} query
   * @param {{extras?: Array, limit?: number}} options
   * @returns {Array<{brandId:string,brandName:string,name:string,price:number,count:number,source:string}>}
   */
  function search(query, options) {
    const q = normalize(query);
    if (!q) return [];
    const opts = options || {};
    const limit = opts.limit || 20;
    const extras = opts.extras || [];
    const map = new Map();

    function put(entry, score, source) {
      const key = (entry.brandId || "") + "|" + normalize(entry.name);
      const existing = map.get(key);
      if (existing) {
        existing.score = Math.max(existing.score, score);
        if (source === "history") {
          existing.source = "history";
          existing.count = Math.max(existing.count || 0, entry.count || 0);
        }
        return;
      }
      map.set(key, {
        brandId: entry.brandId || "",
        brandName: entry.brandName || brandNameOf(entry.brandId || ""),
        name: entry.name,
        price: entry.price || 0,
        hot: entry.hot || 0,
        count: entry.count || 0,
        source,
        score,
      });
    }

    allItems().forEach((item) => {
      let score = 0;
      [item.name].concat(item.aliases || []).forEach((alias) => {
        score = Math.max(score, scoreKey(normalize(alias), q));
      });
      if (score) put(item, score, "menu");
    });

    extras.forEach((entry) => {
      const score = scoreKey(normalize(entry.name), q);
      if (!score) return;
      put(entry, score + Math.min(8, entry.count || 0) * 2, "history");
    });

    // 直接搜品牌名：把这个品牌的常见款带出来。
    brandList().forEach((brand) => {
      const names = [brand.name].concat(brand.aliases || []).map(normalize);
      if (!names.some((name) => name.indexOf(q) >= 0)) return;
      if (!hasBrand(brand.id)) return;
      itemsFor(brand.id)
        .slice(0, 4)
        .forEach((item) => put(item, 40 + (item.hot || 0), "menu"));
    });

    return Array.from(map.values())
      .sort((a, b) => b.score - a.score || (b.count || 0) - (a.count || 0) || (b.hot || 0) - (a.hot || 0))
      .slice(0, limit);
  }

  /**
   * 捕获页的候选：品牌已知就给该品牌常见款（你点过的排前面），否则给你的常点。
   */
  function suggest(options) {
    const opts = options || {};
    const brandId = resolveBrandId(opts.brand);
    const extras = opts.extras || [];
    const limit = opts.limit || 5;
    const list = [];

    if (brandId) {
      const history = new Map();
      extras
        .filter((entry) => entry.brandId === brandId)
        .forEach((entry) => history.set(normalize(entry.name), entry.count || 0));
      itemsFor(brandId).forEach((item) => {
        list.push({
          brandId,
          brandName: brandNameOf(brandId),
          name: item.name,
          price: item.price,
          hot: item.hot,
          count: history.get(normalize(item.name)) || 0,
          source: "menu",
        });
      });
      extras
        .filter((entry) => entry.brandId === brandId && !hasItem(brandId, entry.name))
        .forEach((entry) => {
          list.push({
            brandId,
            brandName: brandNameOf(brandId),
            name: entry.name,
            price: 0,
            hot: 0,
            count: entry.count || 0,
            source: "history",
          });
        });
      return list
        .sort((a, b) => b.count - a.count || b.hot - a.hot)
        .slice(0, limit);
    }

    return extras
      .filter((entry) => entry.name)
      .slice(0, limit)
      .map((entry) => ({
        brandId: entry.brandId || "",
        brandName: entry.brandName || brandNameOf(entry.brandId || ""),
        name: entry.name,
        price: 0,
        hot: 0,
        count: entry.count || 0,
        source: "history",
      }));
  }

  function hasItem(brandId, name) {
    const key = normalize(name);
    return (BRAND_MENU[brandId] || []).some(
      (item) => normalize(item.name) === key || (item.aliases || []).some((alias) => normalize(alias) === key)
    );
  }

  // 搜索弹层没输入时展示的热门单品。
  function popular(limit) {
    return allItems()
      .filter((item) => item.hot >= 4)
      .sort((a, b) => b.hot - a.hot || a.name.localeCompare(b.name, "zh"))
      .slice(0, limit || 10);
  }

  window.MtlMenu = {
    normalize,
    hasBrand,
    matchName,
    search,
    suggest,
    popular,
    itemsFor,
  };
})();
