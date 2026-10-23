# Running — 怎么跑起来（零基础版）

> v0.2.0：Node 服务端同时托管页面与两个接口（AI 识别、逆地理编码）。
> iPhone 真机测试必须走 HTTPS（Safari 定位只在 HTTPS 下可用）。

## 1. 你需要什么

- 一台 Mac（需 Node 18+；本项目用 Node 24 验证通过）
- Google Chrome（Mac 上看效果）
- iPhone（和 Mac 连同一个 Wi-Fi）
- 两个 Key（只在服务端 `.env` 里，绝不进前端）：
  - `DASHSCOPE_API_KEY`：豆包（火山方舟）API Key；也兼容替换成通义千问 VL（阿里云百炼）
  - `AMAP_KEY`：高德 Web 服务 Key

## 2. 第一次安装

```bash
cd /Users/Admin/Knowledge/Coding/milk-tea-log
npm install
cp .env.example .env
```

然后编辑 `.env`，填两行：

```bash
DASHSCOPE_API_KEY=你的方舟Key
AMAP_KEY=你的高德Key
```

> 只想先看界面、不花识别费用：把 `MOCK_AI=1`，识别会返回固定的「伯牙绝弦」。

## 3. 启动

```bash
cd /Users/Admin/Knowledge/Coding/milk-tea-log
npm start
```

看到下面三行就成功了：

```
[mtl] 服务已启动：http://localhost:8830
[mtl] AI：已配置
[mtl] 逆地理编码：已配置
```

Mac 上打开：http://localhost:8830

> 停止服务：在终端按 `Ctrl + C`。

## 4. iPhone 真机测试（必须 HTTPS）

### 4.1 起一条临时 HTTPS 隧道

另开一个终端：

```bash
~/.local/bin/cloudflared tunnel --url http://localhost:8830
```

终端会打印一个地址，形如：

```
https://xxxx-xxxx.trycloudflare.com
```

### 4.2 iPhone 打开这个地址

1. iPhone 连和 Mac 同一个 Wi-Fi（其实走公网隧道，不同 Wi-Fi 也行）。
2. Safari 打开上面那个 `https://...trycloudflare.com`。
3. 点「拍一杯」→ 允许相机；保存时允许定位。
4. 完整走一遍：拍照 → 等识别/定位 → 确认 → 「收进这个月」→ 看「印章」和「地图」。

> 隧道地址每次重启都会变；关掉终端隧道就失效。
> 隧道暴露在公网，服务端已按 IP 限流 30 次/分钟，测试完记得 `Ctrl + C` 关掉。
> 这只是**开发期**的临时办法；要给多人长期测试，用第 9 节的正式部署方案。

## 5. 怎么用

1. 「拍一杯」：拍照或从相册选一张（杯贴 / 杯身 / 小票最准）。
2. 等 3 步走完：识别饮品名、获取城市/区、生成印章。
3. 确认卡里可以改饮品名、城市、区，备注选填；不满意点「重拍」。
4. 点「收进这个月」保存。
5. 「印章」按月份看，点任一印章可编辑 / 删除；底部可导出备份、清空。
6. 「地图」看带定位的印章分布。

## 6. 数据存在哪

- 记录与照片：浏览器 **IndexedDB**（库 `mtl`，表 `records`），照片只在本机。
- 月份等设置：`localStorage`，key `mtl:settings:v1`。
- 照片在识别时会发到本机 Node 服务，再转发给豆包（火山方舟）视觉模型；**服务端不落盘、日志不记图片**。
- 换浏览器、清缓存、换设备都会丢；验证期请定期「导出备份」。

## 7. 常见问题

| 问题 | 处理 |
|---|---|
| `npm start` 报端口占用 | 改 `.env` 里 `PORT=8831`，隧道地址同步改成 `http://localhost:8831` |
| 识别一直失败 | 看终端 `[mtl] recognize failed` 的 reason；确认 Key 有额度 |
| 识别提示「还没配置」 | `.env` 里 `DASHSCOPE_API_KEY` 为空，或改完没重启服务 |
| 定位拿不到 | 确认是 `https://` 打开；Safari 设置里允许「位置」；也可手填城市/区 |
| 城市/区是空的 | `AMAP_KEY` 没配或高德 Key 不是「Web 服务」类型 |
| 地图空白 | 检查 `web/assets/vendor/leaflet/` 是否存在；瓦片用高德，需能联网 |
| 手机打不开隧道 | 确认 Mac 上 `npm start` 和 `cloudflared` 两个终端都在跑 |
| 页面样式不对 | 强制刷新：`Cmd + Shift + R` |

## 8. 改哪里

| 想改什么 | 改哪个文件 |
|---|---|
| 页面结构/文案 | `web/index.html` |
| 颜色/布局 | `web/assets/css/style.css` |
| 记录逻辑/归档/地图 | `web/assets/js/app.js` |
| 前端识别调用 | `web/assets/js/recognize.js` |
| AI 与定位接口 | `server/index.js` |
| 需求范围 | `plan/RPD_需求文档.md` |
| 项目规则 | `.trae/rules/project_rules.md`（先改母本再同步） |

## 9. 正式上线：云服务器整站（本次采用）

> 当前现状（2026-10-22）：域名 `chesterlee.cn` 注册在**阿里云**，ICP 备案正在**腾讯云**提交审核。
> **备案跟着接入商走**：备案在腾讯云，服务器就要放腾讯云；放阿里云内地节点会被阿里云监测判定「未备案」并阻断访问。
> 所以本次上线机器选**腾讯云轻量应用服务器**（下面的命令对阿里云轻量同样适用，只是控制台换成腾讯云）。
> 一个 Node 进程同时托管页面和 4 个接口，没有跨域、没有反向代理的额外配置。
> 下文用 `yourdomain.com` 代替你的主域名、`mtl.yourdomain.com` 代替本站子域，照抄前先替换。

### 9.1 整体结构

```
测试者 iPhone
   │ https
   ▼
Caddy（443，自动证书）
   │ reverse_proxy 127.0.0.1:8830
   ▼
node server/index.js
   ├── web/ 静态页（含 privacy.html）
   ├── /api/recognize → 豆包 / 通义 VL
   ├── /api/cutout    → remove.bg（失败降级原图）
   └── /api/geocode   → 高德逆地理
```

### 9.2 买机器与解析域名

1. 腾讯云轻量应用服务器：**2 核 2G**，Ubuntu 24.04，地域选离测试者近的（上海 / 广州）。
   - 想**不等备案、立刻能测**：同一台可以买「香港」地域（免备案），备案通过后再迁到内地节点。
   - 内地节点必须等备案通过后再解析域名；审核期间别把域名指到内地 IP。
2. 防火墙（腾讯云叫「防火墙」，阿里云叫「安全组」）只放行 **22、80、443**，不要放行 8830。
3. DNS 在阿里云云解析：加 A 记录，主机记录 `mtl` → 服务器公网 IP（备案通过后再加）。
4. 备案号下来后，把 `web/index.html` 与 `web/privacy.html` 页脚的「ICP备案号待填」换成真实备案号。

### 9.3 服务器初始化

```bash
# Node 20 + git + Caddy
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git caddy
node -v

sudo mkdir -p /opt && sudo chown $USER /opt
cd /opt && git clone <仓库地址> milk-tea-log
cd milk-tea-log && npm install --omit=dev
cp .env.example .env
```

`.env` 至少填这些（Key 不要发到聊天、不要提交仓库）：

```bash
PORT=8830
TRUST_PROXY=1
DASHSCOPE_API_KEY=...
DASHSCOPE_MODEL=...
DASHSCOPE_BASE_URL=...
AMAP_KEY=...
REMOVEBG_API_KEY=...   # 不填则自动降级为原图贴纸
```

用 pm2 常驻并开机自启：

```bash
sudo npm i -g pm2
pm2 start server/index.js --name mtl
pm2 save
sudo env PATH=$PATH pm2 startup systemd -u $USER --hp $HOME
```

本机自检：

```bash
curl http://127.0.0.1:8830/api/health
# 期望：{"ok":true,"aiConfigured":true,"geocodeConfigured":true,"cutoutConfigured":true,"mockAi":false}
```

### 9.4 Caddy 配 HTTPS

编辑 `/etc/caddy/Caddyfile`：

```caddyfile
mtl.yourdomain.com {
    encode gzip
    reverse_proxy 127.0.0.1:8830
}
```

```bash
sudo systemctl reload caddy
curl -s https://mtl.yourdomain.com/api/health
```

Caddy 会自动申请并续期证书，前提是 80/443 可访问、DNS 已生效（可能等几分钟）。

> 必须设 `TRUST_PROXY=1`，否则所有请求都来自 127.0.0.1，限流会变成全站共享。

### 9.5 测试数据怎么收

- 这一版记录只存在测试者手机的 IndexedDB，**服务端不存记录**。
- 收集方式：让测试者点「印章 → 导出备份」，把 JSON 发给你。
- 想自动汇总，需要新增一个「上传记录」接口并同步隐私政策——**本版未做**，属于下一版范围。

### 9.6 上线前检查

- [ ] `https://mtl.yourdomain.com/api/health` 三项 `configured` 均为 true
- [ ] iPhone Safari 打开无「不安全」，定位权限能正常弹出
- [ ] 页脚「隐私政策」可打开，内容与实际能力一致
- [ ] 页脚备案号已换成真实备案号，并链接 `beian.mit.gov.cn`
- [ ] `.env` 未进仓库（`.gitignore` 已含 `.env`）
- [ ] 防火墙未开放 8830，只开 22/80/443
- [ ] remove.bg 额度已确认（免费 50 次/月）；不够就先关抠图或充值
- [ ] 临时隧道已关闭，避免多一个公网入口
- [ ] 真机走一遍：拍照 → 识别 → 定位 → 印章 → 地图

### 9.7 成本与取舍

| 方案 | 成本 | 稳定性 | 适合 |
|---|---|---|---|
| **腾讯云轻量整站（本次）** | 几十元/月（新用户常有百元内/年促销） | 好 | 多人多天测试 |
| 临时隧道（第 4 节） | 0 | 差（地址会变、Mac 要开机） | 自己真机调试 |
| 帽子云前端 + 云主机 API（9.8） | 服务器 + 多一层配置 | 好 | 后期想上 CDN |
| 只上传帽子云 | 0 | — | 只能看界面，AI/定位不可用 |

### 9.8 备选：帽子云前端 + 云主机 API

- 适用：以后静态页想走 CDN、访问量变大时。
- 做法：仓库推 GitHub / Gitee → 帽子云绑定仓库，输出目录填 `web`；
  反向代理规则 `/api*` → `https://mtl.yourdomain.com`（保留原始路径）。
- 代价：多一个故障点和一套配置；测试期不必。
