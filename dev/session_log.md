# session_log — milk-tea-log

## 2026-10-21 会话条目：项目骨架 + H5 验证版起步（骨架已交付）

- 目标：
  - 基于《可行性分析_拍一拍记奶茶》搭出 `milk-tea-log` 项目结构，先做 H5 验证版。
- 已做：
  - 用 `new-project-scaffold` 创建 `milk-tea-log`（web 型）骨架：目录、规则、5 个技能副本、工作法、`.gitignore`。
  - 补 `git-sync` 技能副本（与其它项目一致，便于后续双推）。
  - 改写 `.trae/rules/general_rules.md` 头部；按本项目重写 `.trae/rules/project_rules.md`。
  - 建 `README.md` / `usage/Running.md` / `plan/RPD_需求文档.md` / 本文件 / `milk-tea-log.code-workspace`。
  - 建 H5 静态骨架：`web/index.html` + `assets/css/style.css` + `assets/js/app.js` + `assets/js/recognize.js`。
  - 登记 `_分发清单.md`（v1.15）/ 规划库 README §10 / `Coding.code-workspace`（仅注释行）。
  - 跑 `sync.sh` 体检：差异 0（一致 114）。
- 关键结论/决定：
  - 先做 H5 验证版，不做登录/支付/社区；AI 识别只预留接口，API Key 只在服务端。
  - 数据先存 `localStorage`（`mtl:records:v1`），必须支持导出 JSON。
  - 核心闭环：拍照/选图 → 手动确认 → 保存 → 日历/月报；先验证「有没有人持续记」。
- 产出物（文件/链接）：
  - `web/index.html`
  - `web/assets/css/style.css`
  - `web/assets/js/app.js`
  - `web/assets/js/recognize.js`
  - `plan/RPD_需求文档.md`
  - `usage/Running.md`
  - `README.md`
- 待办：
  - 5 人可用性走查（首次记录 ≤10 秒）。
  - 30 张真实照片识别测试。
  - 20 人 × 7 天人工验证。
- 风险/注意事项：
  - 识别接口未接，页面默认关闭，不能写成「AI 已可用」。
  - `localStorage` 会因清缓存/换设备丢失，验证期务必导出备份。
  - 不提交真实照片、消费记录、密钥；上线前补 ICP 备案与隐私政策。

## 2026-10-22 会话条目：v0.2.0 改造为「AI 认饮品名 + 印章地图」，准备 iPhone 真机测试

- 目标：
  - 用 iPhone 真机跑通完整新版流程：拍照 → AI 认饮品名 → 定位城市/区 → 生成印章 → 归档/地图。
- 已做：
  - 新建 `server/index.js`：Express 静态托管 + `POST /api/recognize`（通义千问 VL）+ `POST /api/geocode`（高德逆地理）；按 IP 限流 30 次/分、20s 识别超时、8s 地理超时、`MOCK_AI` 开关。
  - 重写 `web/index.html`：三 Tab（拍一杯 / 印章 / 地图）、处理中三步状态、确认卡、详情弹层、toast。
  - 重写 `web/assets/js/recognize.js`（前端只调 `/api/recognize`）与 `app.js`（IndexedDB `mtl/records`、压缩 1280/640、AI+定位并行、印章网格、Leaflet 地图、编辑/删除/导出/清空）。
  - 重写 `web/assets/css/style.css`，补齐新页面全部 `mtl-` 类，手机优先、奶油浅色 + 印章元素。
  - 本地引入 Leaflet 1.9.4（`web/assets/vendor/leaflet/`），地图瓦片改用高德（含 WGS-84 → GCJ-02 落点转换）。
  - `npm install` 完成；`/api/health`、静态页、未配 Key 的 503 兜底均已自检通过（返回明确提示）。
  - 安装 cloudflared 2026.10.3 到 `~/.local/bin/cloudflared`（GitHub 直连太慢，改用 gh-proxy 镜像 + 断点续传）。
  - 起临时隧道：`https://elder-mill-revenues-similar.trycloudflare.com` → `http://localhost:8830`，外网访问 200。
  - 更新 `README.md`、`usage/Running.md` 到 Node 启动 + Key 配置 + 隧道步骤；`plan/RPD_需求文档.md` 加 v0.8 实现口径说明。
  - 补充部署结论与方案：只上帽子云无法测 AI/定位（不跑 Node、Key 不能进前端）；正式测试用「帽子云静态页 + 云主机 Node + `/api*` 反向代理」。`Running.md` 新增第 9 节（云主机 pm2、Caddy HTTPS、帽子云输出目录 `web`、反代规则、上线检查、成本对比），`README.md` 新增部署方案对比表。
- 关键结论/决定：
  - 数据只在本机（IndexedDB），服务端不落盘；Key 只放 `.env`，前端不接触。
  - iPhone 定位必须 HTTPS，故真机测试走 Cloudflare 临时隧道；隧道地址每次重启会变。
- 产出物（文件/链接）：
  - `server/index.js`、`web/index.html`、`web/assets/js/app.js`、`web/assets/js/recognize.js`、`web/assets/css/style.css`、`web/assets/vendor/leaflet/`
  - `package.json`、`.env.example`、`README.md`、`usage/Running.md`
- 待办：
  - 用户在 `.env` 填入 `DASHSCOPE_API_KEY`、`AMAP_KEY` 后重启服务，iPhone 走一遍真实识别与定位。
  - 根据真机结果调 prompt / 置信度阈值 / 定位文案。
  - 30 张真实照片识别准确率记录。
- 风险/注意事项：
  - 临时隧道暴露公网，测试完关掉；不要长期常开。
  - 高德瓦片为 GCJ-02，已做坐标转换；若换正式地图方案需同步改。
  - 不把真实照片、密钥提交到仓库。

## 2026-10-22 会话条目：上线落点评估与上线前合规/部署准备

- 目标：
  - 选定正式上线落点，补齐上线前合规项与服务端反向代理适配，供随后真机发布测试。
- 关键结论/决定：
  - 只上帽子云**不可行**：静态托管不跑 Node，识别 / 抠图 / 逆地理 4 个接口无法提供，Key 也不能进前端。
  - 采用 **阿里云轻量应用服务器 2核2G 整站部署**：一个 Node 进程托管 `web/` + 4 个接口，Caddy 自动 HTTPS；
    主域已在阿里云备案时子域无需接入备案。帽子云降级为后期 CDN 备选。
  - 小程序阶段走**自建后端**（与 H5 共用接口），不锁定云厂商；若改用微信云托管需另办接入备案。
- 已做：
  - `server/index.js`：新增 `TRUST_PROXY=1` 支持（仅信任本机回环代理），限流改用真实 `req.ip`；
    抠图接口单独限流 8 次/分钟（按次计费，防刷）。
  - `.env.example`：新增 `TRUST_PROXY` 说明。
  - 新增 `web/privacy.html` 隐私政策（照片仅转发识别/抠图、服务端不落盘、坐标用途、可导出/清空、不做广告）。
  - `web/index.html` 页脚加「隐私政策」与备案号链接（备案号待填）；`style.css` 补页脚与正文样式。
  - `usage/Running.md` 第 9 节重写为「阿里云轻量整站」上线步骤（买机/解析、Node+pm2、Caddy、检查清单、成本）；
    `README.md` 部署对比表与下一步同步为本次方案。
- 产出物：
  - `web/privacy.html`、`server/index.js`、`.env.example`、`web/index.html`、`web/assets/css/style.css`
  - `usage/Running.md` §9、`README.md` 部署方案
- 待办（阻塞上线）：
  - 用户确认主域名并提供 ICP 备案号（替换页脚与隐私页「待填」）。
  - 用户购买阿里云轻量 2核2G、解析 `mtl` 子域；提供公网 IP 后由我部署。
  - git 仓库尚未初始化（需用户确认后才能 `git init` / 建远程仓库）。
  - 确认 remove.bg 额度（免费 50 次/月），不足则先关抠图。
- 风险/注意事项：
  - 服务器防火墙只开 22/80/443，8830 不对外；`.env` 不入库。
  - 现场隧道已失效，本机 8830 服务仍在；上线后关闭临时隧道。

## 2026-10-22 会话条目：v0.3.0 补齐不依赖 Key 的产品能力

- 目标：
  - 在 Key 与真机测试后置的前提下，先把不依赖外部服务的产品能力补全，避免开发停摆。
- 已做：
  - `web/index.html` 重写为 v0.3.0：新增「我的」入口、最近常喝 chips、更多信息折叠区（品牌 / 价格 / 糖度 / 冰量 / 杯型 / 小料 / 评分）、导入备份、详情字段扩展、统计面板、热力图、徽章墙、4 套主题按钮。
  - `web/assets/js/app.js` 重写：记录可选字段读写（空值不落键）、最近常喝与识别纠错记忆、导入备份（同 ID 跳过、兼容旧 `product` 字段）、周期统计、连续打卡、6 枚徽章、热力图、主题切换、地图同坐标聚合（`toFixed(3)`）、近期卡片与详情星级、导入导出与清空、完整事件绑定。
  - `web/assets/css/style.css` 追加 v0.3.0 样式：4 套主题变量、折叠区、chips、星级、统计卡、TOP 列表、热力图、徽章、主题选择、地图聚合标记。
  - `package.json` 版本升到 `0.3.0`；`README.md`、`.trae/rules/project_rules.md` 同步到 v0.3.0。
- 关键结论/决定：
  - 记录新增字段全部选填，旧记录缺字段按空处理，不做数据迁移。
  - 备份改为全量导出 / 导入；导入同 ID 跳过，避免重复。
  - 主题用 `<body data-theme>` + CSS 变量实现，设置存 `mtl:settings:v1`。
- 产出物（文件/链接）：
  - `web/index.html`、`web/assets/js/app.js`、`web/assets/css/style.css`、`package.json`、`README.md`、`.trae/rules/project_rules.md`
- 待办：
  - 用户填入 `DASHSCOPE_API_KEY` 后跑真实识别；按 Running 第 9 节部署方案 C。
  - 30 张真实照片识别测试、iPhone 真机走查、HTTPS 部署、隐私政策 + ICP 备案。
- 风险/注意事项：
  - 本轮只做轻量验证（`node --check`、id 一致性、静态资源 200），未做真机交互验证。
  - 清缓存 / 换设备会丢失 IndexedDB 记录，需继续提醒用户导出备份。

## 2026-10-22 会话条目：v0.4.0 分享卡（Phase 3 第一步）

- 目标：
  - 在不依赖任何外部服务的前提下，补上验证期最需要的传播能力：把一条记录生成 1080×1440 分享卡。
- 已做：
  - `web/index.html` 详情弹层新增「做张分享卡」按钮；新增 `#mtl-share` 预览弹层（预览图 + 保存图片 / 分享 + 隐私说明）。
  - `web/assets/js/app.js` 新增本机 Canvas 生成：照片 cover 裁切、品牌标签、品名自动省略、规格行、5 点糖度、累计 / 本月杯数、花费、评分、水印；导出 PNG Blob。
  - 保存走 `a[download]`；分享优先 `navigator.canShare` + `navigator.share`，不支持则降级为下载并提示。
  - 分享卡只含饮品、规格、杯数、花费、评分，不含备注与位置；弹层三层互不干扰（分享 / 详情 / 我的）。
  - `web/assets/css/style.css` 补分享卡预览样式；版本升到 `v0.4.0`（`package.json`、页脚、关于）。
  - 同步 `README.md`、`plan/RPD_需求文档.md`（v0.9.2）、`.trae/rules/project_rules.md`。
- 关键结论/决定：
  - 分享卡完全在本机生成，不上传照片，不需要 Key；主题色会写进卡片点缀色。
  - 素材用 1280px 原图绘制，不使用 640px 缩略图放大。
- 产出物（文件/链接）：
  - `web/index.html`、`web/assets/js/app.js`、`web/assets/css/style.css`、`package.json`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 真机验证 `navigator.share`（iOS Safari）与下载表现。
  - 继续 Phase 3：贴纸册视图、抠图 `/api/cutout`（后者需要 Key）。
- 风险/注意事项：
  - Canvas 中文排版依赖系统字体，跨设备字宽会有细微差异。
  - 本轮只做语法与静态资源轻量校验，未做浏览器视觉走查。


## 2026-10-22 会话条目：v0.4.1 地图高清化 + 深色样式

- 目标：
  - 解决地图「太模糊、看不清」，并把底图做成参考 App 那种深色样式。
- 已做：
  - `web/assets/js/app.js` 高德瓦片参数 `scale=1` → `scl=2`（返回 512px 图，缩到 256 CSS px），补 `tileSize: 256` 与 `className: "mtl-map-tiles"`。
  - 高德 2 倍图不带任何文字（实测 z12 / z15 都一样），故再加一层注记图层 `webst` `style=8`，`className: "mtl-map-labels"`、`opacity: 0.9`。实测该层不是「纯文字透明层」，而是**自带整套路网与 POI 的半透明浅色图**。
  - `web/assets/css/style.css` 新增 `.mtl-map-tiles` 滤镜 `invert(1) hue-rotate(190deg) saturate(0.18) contrast(0.72) brightness(0.95)` 把底图压成深色；`.mtl-map-labels` 用 `saturate(0.18) brightness(0.95) contrast(1.15)` 压住注记层的黄路 / 彩标（否则会盖掉深色底）；`.mtl-map::after` 再蒙一层 `rgba(16,26,40,0.12)` 淡深蓝、`pointer-events: none` 且 z-index 450（低于印章标记）。地图容器改深色底、高度改为 `calc(100dvh - 250px)`、最小 380px；缩放按钮与版权条改深色。
  - 版本升到 `v0.4.1`（`package.json`、页脚、关于）；同步 `README.md`、`plan/RPD_需求文档.md`（v0.9.3）、`.trae/rules/project_rules.md`。
- 关键结论/决定：
  - 高德 `style=7` 在 `webrd` 域名不支持 `scl=2`（404），`style=8` 可以；已实测同 x/y/z 下 scl=1 与 scl=2 覆盖范围一致（仅分辨率不同）。
  - 高德官方深色瓦片需 JS API Key（会进前端），不符合项目红线；改为对浅色瓦片做 CSS 滤镜，零 Key、零新依赖。
  - CARTO / OSM 等国外深色瓦片在本机网络超时，不采用。
- 产出物（文件/链接）：
  - `web/assets/js/app.js`、`web/assets/css/style.css`、`web/index.html`、`package.json`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 手机真机再看一眼实际观感（已过本机 Chrome 390×844 DPR2 视觉走查）；若嫌偏暗/偏灰，只调 `.mtl-map-tiles` 与 `.mtl-map-labels` 的 `brightness / saturate` 即可。
- 风险/注意事项：
  - 滤镜只作用于瓦片图层，不影响印章标记、缩放控件与版权条。
  - 注记层是 1 倍图（2 倍图无文字），文字会比底图略软；底图路网仍是 512px，放大不发虚。
  - 视觉验证用 Playwright 启动本机真实 Chrome 截图：底图 9 张 512×512、注记 9 张 256×256，滤镜与深蓝蒙层生效。

## 2026-10-22 会话条目：v0.5.0 抠图贴纸 + 贴纸册 / 清单视图（Phase 3 收尾）

- 目标：
  - 一次把 Phase 3 剩余能力写完：抠图贴纸、贴纸册视图、清单视图、详情页手动抠图、跨月补记、备份含贴纸。
- 已做：
  - `server/index.js` 新增 `POST /api/cutout`：multer 收图 → 转发 remove.bg（`X-Api-Key`）→ 直接回 `image/png`；25s 超时；错误码 `CUTOUT_NOT_CONFIGURED`（503）/ `CUTOUT_AUTH` / `CUTOUT_QUOTA` / `CUTOUT_BUSY` / `CUTOUT_TIMEOUT`；`/api/health` 增加 `cutoutConfigured`；启动日志打印抠图配置状态。
  - `web/assets/js/recognize.js` 新增 `cutout(imageBlob)`，Key 仍只在服务端。
  - `web/assets/js/app.js`：选图后与 AI 并行触发抠图（失败静默）；本机 Canvas `addWhiteOutline()`（16 方向偏移描边 + `source-in`）生成白边贴纸，最长边压到 1024；记录新增 `stickerBlob` / `stickerStyle`；归档页三视图（印章 / 贴纸册 / 清单）由 `applyArchiveView()` + settings 保持；新增 `buildStickerCard()` / `buildListRow()`；详情页新增「生成贴纸」手动重试；详情可改日期并自动跳到对应月份；导出 / 导入兼容 `sticker`。
  - `web/index.html` / `web/assets/css/style.css`：归档视图切换段控件、3 列贴纸册、深色贴纸卡、清单行、详情日期输入与两个按钮、分享卡弹层 `#mtl-share`。
  - `package.json` 升到 `0.5.0`；`README.md`、`plan/RPD_需求文档.md`（v0.9.4）、`.trae/rules/project_rules.md`、`.env.example` 同步。
- 关键结论/决定：
  - 抠图做成**可选增强**：未配 `REMOVEBG_API_KEY`、失败或超时都降级为原图贴纸卡，任何环境都能完整测试。
  - 白边完全在本机 Canvas 完成，避免引入服务端图像库依赖。
  - 改日期后自动切 `currentMonth` 并写 settings，避免「保存后记录消失」的困惑。
- 产出物（文件/链接）：
  - `server/index.js`、`web/assets/js/recognize.js`、`web/assets/js/app.js`、`web/index.html`、`web/assets/css/style.css`、`package.json`、`.env.example`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 用户填入 `REMOVEBG_API_KEY` 后验证真实抠图（当前 `/api/cutout` 返回 `CUTOUT_NOT_CONFIGURED`，降级路径已验证）。
  - 真机验证 `navigator.share`、日期选择器、贴纸册深色卡视觉。
- 风险/注意事项：
  - remove.bg 免费额度有限，批量测试注意配额；抠图会把照片转发给第三方（已在隐私说明中注明）。
  - 旧记录没有 `stickerBlob`，贴纸册会用原图 + 高光底卡兜底，不做数据迁移。
  - 本轮只做 `node --check`、id 一致性、`/api/health` 与 `/api/cutout` 降级校验，未做浏览器视觉走查。

## 2026-10-22 会话条目：v0.5.1 修复逆地理编码恒为空

- 目标：
  - 配好 Key 跑真实链路时，验证定位城市/区是否真实可用。
- 已做：
  - 实测 `POST /api/geocode`（31.2304, 121.4737）返回 `city:"", district:""`，但直连高德接口同一 Key、同一坐标返回 `province:"上海市", district:"黄浦区"`。
  - 定位到 `server/index.js` 解析字段写错：高德 v3 regeo 返回 `regeocode`（单数），代码读的是 `regeocodes[0]`。改为优先 `payload.regeocode`，保留旧字段兜底。
  - 重启服务复测：`{"city":"上海市","district":"黄浦区","adcode":"310101","formatted":"上海市黄浦区南京东路街道上海市人民政府"}`。
  - 版本升到 `v0.5.1`（`package.json`、页脚、关于）；同步 `README.md`、`plan/RPD_需求文档.md`（v0.9.5）、`.trae/rules/project_rules.md`。
- 关键结论/决定：
  - 该 Bug 此前一直静默存在：解析落空不抛错，前端只表现为「没有自动填城市/区」，容易被当成定位失败。
  - AI 识别链路已连通（`/api/recognize` 200，约 1.5s）；参考截图类图片返回「未知」属正常，真实杯贴待真机验证。
- 产出物（文件/链接）：
  - `server/index.js`、`package.json`、`web/index.html`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 填 `REMOVEBG_API_KEY` 后验证真实抠图（当前仍未配置，走原图贴纸降级）。
  - 用手机拍真实杯贴，验证 AI 认名质量与自动定位。
- 风险/注意事项：
  - 若高德改版或换 v5 接口，字段名需重新核对。
  - 本轮验证只覆盖接口层，未做浏览器端到端走查。

## 2026-10-22 会话条目：v0.5.2 抠图适配层（应对 remove.bg 停服）

- 目标：
  - remove.bg 官方公告 2026-12-01 09:00（CET）停止独立站、并入 Canva / Leonardo.Ai；用户决定先用 remove.bg 完成验证，同时把切换成本降到最低。
- 已做：
  - `server/index.js` 新增 `CUTOUT_PROVIDER`（默认 `removebg`）与 `CUTOUT_PROVIDERS` 适配层、`isCutoutConfigured()`；路由改为调用 `provider.run()`，健康检查与启动日志同步。
  - 占位 Key 判定：`REMOVEBG_API_KEY` 长度 < 12 视为未配置，避免 `.env` 里残留 `你的_key` 被误判为已配置、实际返回鉴权失败。
  - `.env.example` 补 `CUTOUT_PROVIDER` 与停服提示；版本升到 `v0.5.2`，同步 `README.md`、`plan/RPD_需求文档.md`（v0.9.6）、`.trae/rules/project_rules.md`。
- 关键结论/决定：
  - 目前保留 remove.bg 作为唯一实现；12 月前换供应商时只需在 `CUTOUT_PROVIDERS` 加一个实现并改 `CUTOUT_PROVIDER`。
  - 用户尚未填入真实 Key，`/api/health` 的 `cutoutConfigured` 仍为 `false`，贴纸走原图降级。
- 产出物（文件/链接）：
  - `server/index.js`、`.env.example`、`package.json`、`web/index.html`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 填入真实 `REMOVEBG_API_KEY` 后跑一次真实抠图，确认返回透明 PNG 且白边正常。
  - 12 月 1 日前确定替代供应商（国内云分割 / 本地 rembg）。
- 风险/注意事项：
  - remove.bg 每月 50 次免费为低分辨率额度，验证时注意配额。
  - 若忘记切换，12 月 1 日后抠图会持续失败并降级为原图贴纸（不会影响记录保存）。

## 2026-10-22 会话条目：v0.5.3 真机测试暴露识别网络失败

- 目标：
  - iPhone 真机（局域网 HTTP）跑完整流程，排查「识别没成功 / fetch failed」。
- 已做：
  - 服务端日志定位到 `recognize failed { bytes:137509, ms:10518, reason:'fetch failed' }`：是 Node 请求火山方舟时网络失败，同一时刻抠图成功，排除 Key 与前端问题。
  - 本机 DNS 实测不稳（`nslookup` 出现 `connection timed out; no servers could be reached`），确认是解析偶发超时。
  - `server/index.js` 识别改为：单次 12s 超时 + 最多 2 次尝试，仅对网络类错误重试（新增 `isTransientNetworkError` / `describeNetworkError`）；失败返回 `AI_NETWORK` + 中文提示，不再把 `fetch failed` 直接透给用户。
  - `web/assets/js/recognize.js` 前端识别超时 20s → 30s。
  - 版本升到 `v0.5.3`，同步 `README.md`、`plan/RPD_需求文档.md`（v0.9.7）、`.trae/rules/project_rules.md`。
- 关键结论/决定：
  - iPhone 走局域网 HTTP 时定位与系统分享不可用（iOS 要求 HTTPS），定位走手动填写；要全功能需另配本机 HTTPS。
  - Cloudflare 临时隧道在当前网络不可用（DNS SRV 查询超时 + 边缘不可达），本次未采用。
- 产出物（文件/链接）：
  - `server/index.js`、`web/assets/js/recognize.js`、`package.json`、`web/index.html`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - iPhone 重新打开 `http://192.168.1.3:8830`（硬刷新）复测识别与抠图。
  - 如需真机测定位 / 系统分享，配置本机 HTTPS（自签证书 + iPhone 安装根证书）。
- 风险/注意事项：
  - 重试会让失败路径最长约 25s，正常路径仍是 1–2s。
  - 若本机 DNS 长期不稳，建议改用 223.5.5.5 / 119.29.29.29。

## 2026-10-22 会话条目：v0.5.4 确认卡当场出抠图效果

- 目标：
  - 用户要求「传图之后就要当场出这个抠图效果」，即确认卡阶段就能看到透明贴纸，而不是保存后在贴纸册里才看到。
- 已做：
  - `web/index.html`：确认卡预览容器加 `id="mtl-confirm-preview"`，新增 `#mtl-confirm-cutout`（「抠图中…」角标）。
  - `web/assets/js/app.js`：新增 `renderConfirmPhoto()`——有 `stickerBlob` 就换成贴纸 URL 并切到深色卡形态，没有则显示原图；抠图成功 / 失败 / 确认卡渲染时都调用它；`pending` 增加 `stickerUrl` / `cutoutState`，`clearPending` 里回收 Blob URL 并复位样式。
  - `web/assets/css/style.css`：新增 `.mtl-stamp-preview.is-sticker`（152px 深色圆角卡、白边更明显）与 `.mtl-cutout-badge`。
  - 版本升到 `v0.5.4`，同步 `README.md`、`plan/RPD_需求文档.md`（v0.9.9）、`.trae/rules/project_rules.md`。
- 关键结论/决定：
  - 保持「先出确认卡、后补贴纸」的节奏：识别约 1–2s 就出卡，抠图约 10s 到位后原地替换，不把保存前等待拉长到 10s+。
- 产出物（文件/链接）：
  - `web/index.html`、`web/assets/js/app.js`、`web/assets/css/style.css`、`package.json`、`README.md`、`plan/RPD_需求文档.md`
- 待办：
  - 真机复测：确认卡预览是否在约 10s 后自动变深色贴纸卡；「重拍 / 收起」后状态是否复位。
- 风险/注意事项：
  - 贴纸替换时容器由 128px 圆形变为 152px 方形，会出现一次轻微布局跳动，属预期。

## 2026-10-27 会话条目：v0.5.5 历史照片按拍摄地 / 拍摄时间自动填

- 目标：
  - 用户反馈「历史相册照片要自己填地址太麻烦」，要求尽量自动获取。原实现一律用「此刻定位」，对历史照片会把拍摄地错标成当前位置。
- 已做：
  - `web/assets/js/app.js`：新增本机 JPEG EXIF 解析（`readExif` / `parseExifBuffer`，只读文件头 512KB，支持大小端、GPS 经纬度、`DateTimeOriginal`），照片与元数据不外传；`pending` 增加 `geoSource` / `takenAt`；三级回退：EXIF 拍摄地 → 浏览器定位 → 手填。
  - `runGeo` 区分来源：有 EXIF 时跳过定位权限，直接 `/api/geocode` 反查；状态新增 `geoState="exif"`。
  - 记录 `date` 改用 EXIF 拍摄时间（缺失才用保存当天）；确认卡提示区分「按照片拍摄地 / 按当前位置」并显示「拍摄于 …」。
  - `web/index.html` + CSS：新增「最近去过」城市 / 区 chips（取自历史记录，一键填充）；补 `.mtl-recent[hidden]` 修正 `hidden` 被 `display:grid` 覆盖的问题。
  - 版本升到 `v0.5.5`，同步 `README.md`、`plan/RPD_需求文档.md`（v0.10.0）、`.trae/rules/project_rules.md`。
- 关键结论/决定：
  - 定位口径改为「拍摄地优先」：照片自带 GPS 比「此刻在哪」更符合存档语义；无 GPS 时仍退回当前定位，并明确标注来源。
  - 不引入 EXIF 三方库，自己解析 JPEG（项目零依赖 / 零构建）；HEIC 直接跳过走定位兜底。
- 产出物（文件/链接）：
  - `web/assets/js/app.js`、`web/index.html`、`web/assets/css/style.css`、`package.json`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 真机验证 iOS 相册传图是否保留 GPS（用一张相机原图测试，确认提示是「按照片拍摄地」）。
  - 确认 EXIF 拍摄时间落到正确月份，历史照片不会挤进当月印章。
- 风险/注意事项：
  - 微信 / 飞书转过、截图、网页保存的图通常无 GPS（实测 `inbox/` 内 26 张均只有拍摄时间、无坐标），这类只能靠「最近去过」或手填。
  - 图片若是 HEIC 或 EXIF 超出文件头 512KB，解析返回 null，自动退回当前定位。





