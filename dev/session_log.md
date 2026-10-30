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

## 2026-10-27 会话条目：v0.5.6 真机测试诊断日志

- 目标：
  - 用户手机拍了一杯，要求「抓日志判断是否识别 / 定位 / 保存正确」。现有服务端日志只有字节数、耗时、成功与否，缺饮品名、城市 / 区、保存结果，无法判断对错。
- 已做：
  - 新增 `web/assets/js/log.js`（`window.MtlLog`）：本机 localStorage 留最近 300 条，按批上报 `/api/log`，切后台 / 关页用 `sendBeacon` 兜底，并自动捕获 `error` / `unhandledrejection`。
  - `web/assets/js/app.js` 埋点：`photo.picked`、`exif.parsed`、`photo.compressed`、`ai.ok / ai.failed`、`geo.ok / geo.failed / geo.skipped`、`cutout.ok / cutout.skipped`、`confirm.shown`、`record.saved / record.save_failed`。
  - 新增 `server/log.js`：服务端事件写 `logs/server-YYYY-MM-DD.jsonl`，前端上报写 `logs/client-YYYY-MM-DD.jsonl`（单条 data 限 1500 字符）。
  - `server/index.js`：新增 `POST /api/log`（120 次/分钟限流）；识别 / 定位 / 抠图的 console 日志统一改走 `logEvent`，并补上饮品名、置信度、城市 / 区。
  - 版本升到 `v0.5.6`，同步 `README.md`、`plan/RPD_需求文档.md`（v0.10.1）、`usage/Running.md`（§9.5.1）、`web/privacy.html`、`.trae/rules/project_rules.md`、`.gitignore`（`logs/`）。
- 关键结论/决定：
  - 日志按天分文件、只记流程与结果，不记图片内容与 Key；`logs/` 不入库。
  - 判断口径：`photo.picked → exif.parsed → photo.compressed → ai.ok / geo.ok → confirm.shown → record.saved`，缺哪步看对应 `*.failed / *.skipped`。
  - 本次手机测试（线上 18:23–18:26 三条）服务端只看到 geocode → recognize → cutout 均成功，具体饮品名 / 城市 / 是否保存无从判断，正是新增日志要补的缺口。
- 产出物（文件/链接）：
  - `web/assets/js/log.js`、`web/assets/js/app.js`、`web/index.html`、`server/log.js`、`server/index.js`、`.gitignore`、`README.md`、`usage/Running.md`、`plan/RPD_需求文档.md`、`web/privacy.html`
- 待办：
  - 线上部署 v0.5.6 后，用手机再拍一杯，核对 `logs/client-*.jsonl` 的识别名 / 城市 / 保存结果是否正确。
- 风险/注意事项：
  - `/api/log` 是公开写接口，已有频率与单条长度限制；验证期用完可考虑关闭或加 Key。
  - 日志含饮品名与城市 / 区（不含照片、不含 Key），隐私政策已同步说明。

## 2026-10-27 会话条目：v0.6.0 地图换引擎（Leaflet → 高德 JS API 深色）

- 目标：
  - 用户贴线上截图反馈「地图根本没办法看」。要求全面分析原因、给出更清晰的方案、判断是否要换地图服务、说明费用。
- 已做：
  - 定位「看不清」的 5 个成因：①CSS 反相把路网压成深灰、贴近底色；②文字来自 1 倍注记瓦片（`webst`），Retina 放大发虚；③z6–7 本身信息稀；④桌面端地图仅 480px 宽；⑤深黑底 + 米白 UI 反差过大，像「没加载出来」。
  - 实测第三方瓦片可用性：CARTO Dark Matter 8s 超时（不可用）；Mapbox demo token 403；`tiles.openfreemap.org` 200/0.36s；`demotiles.maplibre.org` 200/0.55s；`webapi.amap.com` 200/0.08s。
  - 给出方案与费用对比（A 高德 JS API 深色 / B MapLibre + OpenFreeMap / C Mapbox、MapTiler / D 天地图 / E CARTO / F 只调滤镜），用户选定**高德 JS API 深色**；商用与否暂未定，先按非商用做。
  - `server/index.js`：新增 `AMAP_JS_KEY` / `AMAP_JS_SECURITY` 读取、`GET /api/map-config`（`Cache-Control: no-store`）、`/api/health` 增加 `mapConfigured`、启动日志增加「地图（JS API）：已配置 / 未配置」。
  - `web/assets/js/app.js`：删除 Leaflet 初始化与瓦片图层，改为 `loadAmap()`（先取 `/api/map-config`，设置 `window._AMapSecurityConfig`，再注入 `webapi.amap.com/maps?v=2.0`）+ `async ensureMap()`（`mapStyle: "amap://styles/dark"`）；`renderMap` 改为 AMap Marker（印章缩略图 / 聚合数字）+ InfoWindow + `setFitView`；保留 WGS-84 → GCJ-02 转换与约 100 米聚合。
  - `web/assets/css/style.css`：移除全部 Leaflet / 滤镜 / 蒙层样式，新增 AMap 版权条、Logo、InfoWindow 深色适配；桌面端 `body.is-map-view` 放宽到 760px。
  - `web/index.html` 移除 Leaflet css/js 引用；版本升 `v0.6.0`（`package.json`、页脚、README、RPD、规则同步）。
  - 无 Key 降级验证（`PORT=8831`）：`/api/map-config` 返回空 Key、`mapConfigured:false`、桌面 `mapWidth 696`、空态文案「地图暂不可用（还没配置高德 JS API Key）。」、页面无 `.leaflet-container`、移动端无 console error。
- 关键结论/决定：
  - 栅格瓦片 + CSS 滤镜有清晰度天花板，继续调只能「没那么难看」；矢量底图才能根治文字发虚。
  - JS API Key 必须下发前端（高德机制），靠控制台域名白名单限制来源；识别 / 定位 / 抠图的 Key 仍只在服务端。
  - 先按非商用配置；若后续明确商用，再走高德「商用授权 / 技术服务许可」询价。
- 产出物（文件/链接）：
  - `server/index.js`、`web/index.html`、`web/assets/js/app.js`、`web/assets/css/style.css`、`.env.example`、`package.json`、`README.md`、`usage/Running.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 在高德控制台建「Web端(JS API)」Key（白名单 `localhost` + `mtl.chesterlee.cn`），把 Key 与安全密钥填进本地与线上 `.env`，重启服务后做一次真实深色矢量地图的视觉验收（z4 全国 + z14 近景 + 印章 / 弹层）。
  - 线上部署 v0.6.0；部署后确认线上地图已不是 Leaflet 版本。
- 风险/注意事项：
  - 未配 Key 时地图区只显示「地图暂不可用」，属预期降级。
  - 高德 JS API 免费额度按「个人认证 / 企业认证」区分，商用需另行授权；用量与计费口径以控制台为准。
  - `web/assets/vendor/leaflet/`（184K）已无引用，已删除。

## 2026-10-28 会话条目：高德 JS API 真实 Key 验证（地图打通 + Referrer-Policy 修复）

- 目标：
  - 用真实 Key 端到端验证「高德 JS API 深色」能把地图显示清楚，并确认上线需要的配置步骤。
- 已做：
  - 在 Chrome 手动登录高德控制台，在应用「奶茶应用」下新建 Key「奶茶地图」（服务平台「Web端(JS API)」），白名单只填 `mtl.chesterlee.cn`。
  - 本地 `.env` 写入 `AMAP_JS_KEY` / `AMAP_JS_SECURITY`，`PORT=8832 node server/index.js` 启动日志显示「地图（JS API）：已配置」。
  - 定位关键故障：`webapi.amap.com/maps` 只返回 217 字节 `{"info":"INVALID_USER_DOMAIN","infocode":"10006"}`，前端报 `Cannot read properties of undefined (reading 'Map')`；抓请求头发现 `Referer` 为空。
  - 根因：`server/index.js` 的静态托管头写了 `Referrer-Policy: no-referrer`，浏览器跨域请求不带来源，高德域名白名单校验直接失败；改为 `strict-origin-when-cross-origin`（只发域名、不发完整路径）。
  - 修复后复测：脚本 968,605 字节、`window.AMap` 为 object、`.amap-container` 存在、canvas 1、版权 `© 2026 AutoNavi`，深色矢量地图省市名清晰可读。
  - 注入 4 条 IndexedDB 种子记录（上海 / 北京 / 广州 / 成都）：印章点、`4 枚` 计数、`setFitView` 自动缩放、点击弹层均正常。
- 关键结论/决定：
  - 深色样式保留 `amap://styles/dark`；对比用的 `amap://styles/normal` 已回滚。
  - **上线必须带上 Referrer-Policy 这行修复**，否则线上同样会 `INVALID_USER_DOMAIN`、地图完全不显示。
  - 高德控制台不接受 `localhost` 作为白名单条目（提示「有不符合规范的域名」）；本地调试地图需用 `--host-resolver-rules="MAP mtl.chesterlee.cn 127.0.0.1"` 伪造域名访问。
- 产出物（文件/链接）：
  - `server/index.js`、`web/assets/js/app.js`、`.env`（本地，不入库）、`usage/Running.md`（白名单与 `INVALID_USER_DOMAIN` 排查项）
- 待办：
  - 线上 `.env` 加 `AMAP_JS_KEY` / `AMAP_JS_SECURITY` → 部署含 Referrer-Policy 修复的版本 → `pm2 restart mtl`。
  - 部署后用手机 + 桌面各看一次线上地图，确认印章与弹层正常。
- 风险/注意事项：
  - 没有 EXIF 定位、也没手动填城市/区的记录不会出现在地图上，属预期。
  - JS API Key 会下发到前端，安全性依赖白名单；新增域名（含测试域名）都要回控制台补白名单。








## 2026-10-28 会话条目：v0.15.0 这一杯的心情（6 个卡通表情直接点选）

- 目标：
  - 给每条记录加「心情」，用可爱卡通脸直接点选，不让用户打字填写。
- 已做：
  - `app.js` 新增 `MOODS` 与手绘 SVG 脸（`moodSvg`）：开心 / 治愈 / 上头 / 困困 / emo / 平静，每张脸有独立底色、眼睛、嘴与腮红。
  - 确认卡在「最近去过」下方加心情条：点一下选中（弹跳一下）、再点一下取消；组件在 `init()` 里渲染，新拍一张时自动清空。
  - 心情入库为 `mood` 枚举（选填，不拦截保存）；详情弹层同一套点选可改；印章卡右上角挂小表情；清单视图把心情拼进规格行。
  - 备份导入只接受 6 个合法枚举值，其余丢弃；备注字段标题从「备注 / 心情」改为「备注（选填）」。
  - `style.css` 追加 v0.15.0 心情样式（虚线贴纸感外框、6 列表情、选中态与弹跳动画、印章角标），窄屏 ≤359px 自动两行 3 列，`prefers-reduced-motion` 关闭动画。
- 关键结论/决定：
  - 只做「点选」，不提供文字输入；心情不参与统计口径与分享卡，避免改动既有数据与分享卡版式。
  - 版本从 v0.14.0 升到 v0.15.0（`package.json`、关于页版本号、README、RPD、项目规则同步）。
- 产出物（文件/链接）：
  - `web/assets/js/app.js`、`web/index.html`、`web/assets/css/style.css`、`package.json`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 真机看一次表情条的实际大小与点按手感（尤其小屏 320px），必要时把 6 列改成 3 列。
- 风险/注意事项：
  - 心情是纯前端枚举，旧记录没有该字段时各视图照常显示，不需要迁移。

## 2026-10-28 会话条目：v0.16.0 品牌识别与品牌墙

- 目标：
  - 拍完照除饮品名外，还要认出「这是哪家」，并把「某个品牌喝了几杯」变成一眼能看的数据。
- 已做：
  - 新增 `web/assets/js/brands.js`（`window.MtlBrands`）：30 个主流品牌字典 + 别名归一化（去门店后缀 / 括号 / 大小写 / 空格）+ 未收录品牌首字兜底 + 品牌色徽章渲染。
  - `server/index.js`：识别 Prompt 加 30 个候选品牌、允许按杯型 / 杯套 / logo 剪影做视觉推断，输出新增 `brandConfidence`（0–1），解析层做 clamp 与兜底；MOCK 与日志同步。
  - 确认卡把品牌从「更多信息」提到主区：品牌 chip（AI 猜的排最前并标「AI」→ 当前值 → 最近喝过 → 热门兜底，最多 8 个）+「手填」入口；详情弹层同样给 chip，手填时选中态实时同步。
  - 入库 `brand` + `brandId`（读取老记录时现算，不做迁移）。
  - 印章卡照片左上角、贴纸卡左上角、清单行饮品名前挂小徽章；「我的」页新增品牌墙（喝过按杯数在前、没喝过灰度在后，右上角「已收集 X / 总数」）；统计「最爱品牌」改徽章 + 进度条 + 杯数；分享卡加圆形品牌章 + 「第 N 杯 · 共 N 杯」。
  - `style.css` 追加品牌样式块（徽章 sm / lg、chip、角标绝对定位、3 列品牌墙、灰度未喝态、进度条），并对「暖棕展台」主题单独适配。
- 关键结论/决定：
  - 不用各品牌官方 logo 图片，统一用「品牌主色圆章 + 短名」：规避商标与联名暗示，也免去 30 张图在 4 套主题下的适配成本。
  - 品牌仍是选填，识别不到 / 判断不了都允许直接保存；文案只说「AI 猜的」，不承诺准确。
  - 版本从 v0.15.0 升到 v0.16.0（`package.json`、关于页版本号、README、RPD 同步）。
- 产出物（文件/链接）：
  - `web/assets/js/brands.js`、`web/assets/js/app.js`、`web/index.html`、`web/assets/css/style.css`、`server/index.js`、`package.json`、`README.md`、`plan/RPD_需求文档.md`
- 待办：
  - 真机验证：品牌 chip 一行是否换行过多、品牌墙 3 列在小屏（320–360px）是否挤、分享卡品牌章与「第 N 杯」的对齐。
  - 真实照片回归：让 AI 在无清晰 logo 的杯子上推断品牌，确认不会乱猜（必要时收紧 Prompt 里「七八成把握」的措辞）。
- 风险/注意事项：
  - 品牌推断依赖视觉线索，准确率天然有限；`brandConfidence` 目前只入库到日志，不参与 UI 判断，后续若要「低置信度不预选」需要前端接入。
  - 未收录品牌会生成 `custom:` 兜底 ID，统计与品牌墙会把它们算进「已收集」，属预期行为。

## 2026-10-28 会话条目：v0.17.0 地图照参考图重做（城市 / 地点两级视角）

- 目标：
  - 用户提供 `inbox/地图/` 11 张参考截图，要求「一开始是全国全貌 → 点具体城市 → 看到这城喝过的奶茶」，并说明现有深色地图观感差很多。
- 已做：
  - `web/assets/js/app.js`：底图 `amap://styles/dark` → `amap://styles/whitesmoke`；新增 `MAP_CITY_MAX_ZOOM = 9`、`mapMode` / `mapCityGroups` / `mapPointGroups` / `mapActiveCityKey`；`buildCityGroups()` 按 `record.city` 聚合、杯数加权算中心点；`drawMapMarkers(fit)` 在 z<9 出 32px 数字圆徽、z≥9 出 26px 小图钉（单杯缩略图 / 多杯数字）；`zoomend` 比对 `mapMode` 才重绘（防死循环）；`focusCity()` 放大到 z11.5 并弹卡片；`fitMapView()` 改为 `setFitView(markers, false, 56, 5)`；WGS-84→GCJ-02 提前到 `groupLocated()`，落点直接存 `position`。
  - 底部卡片替代 InfoWindow：`openMapSheet / closeMapSheet / openCitySheet / openPointSheet`，城市卡标题「在上海市喝了 3 杯」+「3 处地点 · 最近 2026-10-21」+ 最近 3 条；`map.on("click", closeMapSheet)` 点空白收起。
  - `web/index.html`：`#view-map` 去掉区块标题，改成 stage 容器 + 顶部统计胶囊 + 底部滑出卡 + 空态。
  - `web/assets/css/style.css`：地图段整段重写（`whitesmoke` + `.amap-layers canvas { filter: sepia(0.16) }`、城市徽章 / 小图钉 / 卡片 / 统计胶囊），删除旧聚合标签与 `.amap-info-*`；**地图内配色全部硬编码**。
- 关键结论/决定：
  - 参考图好看的核心不是「深色」，而是底图干净（浅米色 + 细线）+ 标记轻（纯色数字、无白描边缩略图）+ 信息收在底部卡片；照此三点复刻，而不是继续调深色滤镜。
  - 层级由缩放自动切换、不加手动开关：一进地图就是「去过几座城市」的全貌，符合「先看全局再看细节」。
  - 地图内不能复用 `--mtl-primary`：暖棕展台主题下它是 `#ffffff`，会让徽章变白不可见（已实测踩坑后改硬编码）。
  - 版本从 v0.16.0 升到 v0.17.0（`package.json`、关于页、README、RPD、项目规则同步）。
- 产出物（文件/链接）：
  - `web/assets/js/app.js`、`web/index.html`、`web/assets/css/style.css`、`package.json`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 部署到 `mtl.chesterlee.cn`（`rsync web/ server/` + `systemctl restart mtl`）后真机验收全貌 / 下钻 / 卡片 / 空态。
- 风险/注意事项：
  - `whitesmoke` 在 z11+ 仍会出现「上海西站 / 外滩」等 POI 文字，比参考图杂；参考图疑似自定义矢量底图，标准样式无法完全复刻。
  - 城市聚合依赖 `record.city`，没填城市但坐标存在的手填记录只会在地点级出现，不进城市徽章。

## 2026-10-29 会话条目：v0.17.1 底图换 GeoHUB 自定义样式（去 POI 文字）

- 目标：
  - 解决 v0.17.0 遗留问题：内置 `whitesmoke` 在城市级仍冒出「上海西站 / 外滩」等 POI 文字，达不到参考图的干净度。在四条路线（A 高德自定义样式 / B MapLibre 自建瓦片 / C Three.js 自绘 / D Mapbox GL）中，用户选 **A**：不换技术栈。
- 已做：
  - 找出 GeoHUB 私有 API（从 `g.alicdn.com/amap-web/lbs-studio-mapstyle/2.0.8/umi.js` 里翻）：`get-style-id` / `update-style` / `publish-style` / `get-temp-style`；写接口必须带 `X-CSRF-Token`（取 cookie 里的 `csrfToken`）+ `application/json` + `X-Requested-With`，否则 403。
  - 以 `normal` 模板为基底，全自动配置并发布样式 `f96fb1b8aee1fbc65cad5e7f45a2cbcb`（GeoHUB「我的地图样式_1」）：陆地 `fff5f0e6`、水系 `ffdfeaef`、路面 `fffffdf7` + 描边 `ffe6dcc9`、绿地 `ffe4ecdd`、楼块 `ffefe9de`；`labels` 全部 `visible:false` + `showIcon:false`；`borders.provincial/foreign` 隐藏。
  - `web/assets/js/app.js` `ensureMap()`：`mapStyle` 换 `amap://styles/f96fb1b8aee1fbc65cad5e7f45a2cbcb`，加 `showLabel:false` + `features:["bg","road"]` 作样式失效时的双保险。
  - `web/assets/css/style.css`：canvas 滤镜 `sepia(0.16) saturate(0.94)` → `sepia(0.08) saturate(0.4) brightness(1.02)`（压掉国界那根红线 `ffEE1C25`）。
  - 版本 v0.17.0 → v0.17.1：`package.json`、`index.html` 页脚、`README.md`（功能描述 + 更新日志）、`plan/RPD_需求文档.md`（第 34/52/520/629 四处）、`.trae/rules/project_rules.md`（第 15/23/55 三处）。
- 关键结论/决定：
  - 「干净」靠三件事：①注记全关 ②低饱和三色底图 ③CSS 压饱和；**A 路线做不到全貌球体**（高德 2.0 无球体投影），这是已向用户说明的效果上限。
  - 样式 JSON 结构坑：`{version, mapStyle:{…}, extData:{template:"normal",isTemplate:false}}`——`extData` 必须在 `mapStyle` **外层**；把 `background` 与 `water` 同时放进 `mapStyle` 会让 `getMergedStyleData` 返 400、地图整块只剩背景色。
  - 改样式必须 `update-style` **再** `publish-style`（否则只改了草稿）；验证看 `jsapi.amap.com/web/map/sytles` 返回的 `cus_style` 时间戳与 `getMergedStyleData&publishtime=` 一致，测试前要 `Network.clearBrowserCache` + `localStorage.clear()`。
  - 省界线试过 `borders.visible:false` 与逐级 `visible:false` 页面都不变（渲染端仍画），最终改用 CSS `saturate(0.4)` 把红线压成淡粉。
  - 实测截图：z4 全国 = 米白陆地 / 浅蓝海 / 细灰省界 / 零文字；z12 城级 = 奶油底 + 细路网 + 浅蓝水系、无一个 POI 文字。
- 产出物（文件/链接）：
  - `web/assets/js/app.js`、`web/assets/css/style.css`、`package.json`、`web/index.html`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`；GeoHUB 样式 `f96fb1b8aee1fbc65cad5e7f45a2cbcb`
- 待办：
  - 部署到 `mtl.chesterlee.cn`（`rsync web/ server/` + `systemctl restart mtl`）后真机验收 z4 全貌 / 城级 / 底部卡片 / 空态。
- 风险/注意事项：
  - 自定义样式存在高德云上，不在仓库里：日后改配色需再进 GeoHUB 或复用这套私有 API 脚本；样式被删 / 配额异常时会回落到 `showLabel:false + features:["bg","road"]` 的极简底图（仍然干净，只是没配色）。
  - GeoHUB 免费版配额「已发布样式 1/1」——新增第二个样式需先删或升级。

## 2026-10-29 会话条目：v0.17.2 首次打开弹「添加到桌面」提示

- 目标：
  - 第一次打开站点 / 产品时，首页弹一个小弹层，简单说明如何把网页绑定到手机桌面；文字少、不复杂。
- 已做：
  - `web/index.html`：新增 `#mtl-install-tip` 底部弹层（复用 `.mtl-modal` + `.mtl-sheet`）——标题「把『拍一杯』放到桌面」+ 一句「下次点图标就能直接打开」+ iPhone / 安卓两行步骤 + 一行微信内转浏览器提示 + 「知道了」按钮；支持 × / 点遮罩关闭。
  - `web/assets/css/style.css`：新增 `.mtl-install-tip` 少量样式（间距收窄、步骤行沿用 `.mtl-install-item` 皮肤）。
  - `web/assets/js/app.js`：新增 `maybeShowInstallTip()` / `openInstallTip()` / `closeInstallTip()`；首访 600ms 后弹出，关闭时写 `installTipSeen: true` 到 `mtl:settings:v1`，只弹一次；`display-mode: standalone` 或 iOS `navigator.standalone` 时不弹；Esc 优先关闭该弹层。
  - 版本 v0.17.1 → v0.17.2：`package.json`、`package-lock.json`、`index.html` 页脚、`README.md`（功能描述 + 更新日志）、`plan/RPD_需求文档.md`（§3.10 新增一条）、`.trae/rules/project_rules.md`（第 15/55 两处）。
- 关键结论/决定：
  - 不做「安装后不再提示」的复杂判定，只认 `installTipSeen` 与 standalone；用户清站点数据后会再看到一次，可接受。
  - 不做文字教程页，内容压到 3 行 + 1 个按钮；详细信息仍留在「我的 → 添加到手机桌面」。
- 产出物（文件/链接）：
  - `web/index.html`、`web/assets/css/style.css`、`web/assets/js/app.js`、`package.json`、`package-lock.json`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 部署到 `mtl.chesterlee.cn` 后真机验收：首次打开弹出、按钮 / 遮罩 / Esc 关闭、刷新后不再弹、从桌面图标打开不弹。
- 风险/注意事项：
  - 弹层在首访 600ms 后出现，首页极简快门先渲染；若用户已抢先点进全屏相机（`z-index: 90`），弹层会被相机盖住，退出相机后仍在，不影响使用。
  - 微信内置浏览器没有「添加到主屏幕」，文案已提示先转浏览器打开。

## 2026-10-29 会话条目：v0.19.1 城市改成「滑动挑 + 一键定位」

- 目标：
  - 确认卡 / 详情里的「城市」不再手打，改成像选日期一样滑着挑；并且能自己定位到用户当前所在地。
- 已做：
  - `server/index.js`：新增 `GET /api/cities`——代理高德行政区划 `restapi.amap.com/v3/config/district`（`keywords=中国`、`subdistrict=2`），按省分组、组内拼音排序；直辖市 / 特别行政区直接用省名当城市（接口给的是「北京城区 / 重庆郊县」这类名字）；服务端内存缓存 7 天，失败返回 502 + 「城市列表暂时拿不到，可以直接手填城市」。
  - `web/index.html`：确认卡与详情弹层的「城市」改成只读输入框 + 右侧下箭头（`.mtl-pick-field` / `.mtl-pick-caret`），占位改成「自动定位 / 点我选」；新增 `#mtl-city-sheet` 底部弹层（用当前位置自动填 / 搜索框 / 常去城市 chip / 可滑动城市列表 / 手填入口 / 状态行）。
  - `web/assets/js/app.js`：新增 `openCityPicker` / `closeCityPicker` / `renderCityList` / `renderHotCities` / `chooseCity` / `locateCity` / `loadCities` 与 `localStorage` 缓存 `mtl:cities:v1`（7 天）；城市空着时打开弹层先自动定位一次（Geolocation + `/api/geocode`）；换城市时清空旧的区；Esc / 遮罩 / × 关闭，`[data-close]` 分流加 `#mtl-city-sheet`。
  - `web/assets/css/style.css`：新增城市选择器与弹层样式（只读框光标 / 下箭头 / 列表行城市名 + 省名 / 当前值高亮 / 手填行）。
  - 版本 v0.19.0 → v0.19.1：`package.json`、`package-lock.json`、`index.html` 页脚、`README.md`（功能描述 + 更新日志）、`plan/RPD_需求文档.md`（§3.4 字段说明 + 新增 §3.4.3）、`.trae/rules/project_rules.md`（当前阶段）。
- 关键结论/决定：
  - 城市列表不硬编码在仓库里，走服务端代理高德行政区划（准确、随行政区划更新），两端各缓存 7 天，接口挂了也能用「手填城市」兜底。
  - 「城市」改成只读点选，但仍保留弹层内的手填入口（县级市如义乌、境外城市搜不到时可手填），不把用户堵死。
  - 打开弹层时仅在城市为空的情况下自动定位一次，避免每次打开都触发定位权限提示。
- 产出物（文件/链接）：
  - `server/index.js`、`web/index.html`、`web/assets/js/app.js`、`web/assets/css/style.css`、`package.json`、`package-lock.json`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 重启本地 `node server/index.js`（8830 上的旧进程没有 `/api/cities`）；线上 `mtl.chesterlee.cn` 部署后真机验收：点城市 → 滑动挑 / 搜索 / 一键定位 / 换城市清空区。
- 风险/注意事项：
  - 高德行政区划接口有频控，服务端只在缓存过期（7 天）时才请求；前端缓存过期且接口不可用时会退回「手填城市」。
  - 本次改动期间工作区有另一路会话在同时改同一批文件（语音备注 v0.19.0），版本号已按递增约定统一到 v0.19.1。

## 2026-10-29 会话条目：v0.21.0 品牌菜单库 + 饮品名搜索 + 口味档案

- 目标：
  - 饮品名是品牌固定菜单项，不该每次手打：AI 认得出最好，认不出时给「这家可能是什么」的候选，并能跨品牌搜名字；同时把已有记录变成口味档案，只分析、不增加填写负担。
- 已做：
  - 新增 `web/assets/js/menu.js`（`window.MtlMenu`）：30 个品牌的内置常见单品（别名 + 常见价 + 热度），归一化去掉括号 / 标点 / 杯型冰量糖度等规格词；提供 `matchName`（品牌池 → 全品牌池 + 用户历史）、`search`（按完全 / 前缀 / 包含 / 反向包含打分，历史次数加权，搜品牌名带出该品牌常见款）、`suggest`、`popular`。
  - `web/assets/js/app.js`：新增 `brandNameById` / `readMenuAdd` / `learnMenuItem` / `menuExtras` / `repeatCombo`；`runAi()` 加菜单对齐（corrections → 菜单标准名 → 原名，未识别品牌时按菜单反推品牌）；`finishPending()` 改调 `renderSuggestions()` 并补「已对齐成菜单里的写法 / 下面是 XX 常见款」提示；`handleSubmit()` 保存时把不在内置菜单的名字记进 `menuAdd`；新增 `renderSuggestions` / `applySuggestion` / `renderMenuRow` / `renderMenuGroup` / `renderMenuSearch` / `openMenuSearch` / `closeMenuSearch`；新增 `renderTasteProfile` / `tasteTip`（我的页口味档案 + 7 天没点提示）。
  - `web/index.html`：饮品名改「字段头 + 输入框」（右侧「搜饮品名」）、新增候选区 `#mtl-recent-wrap`、我的页新增「口味档案」区块、新增 `#mtl-menu-search` 弹层，并加载 `menu.js`。
  - `web/assets/css/style.css`：补 `.mtl-field-head` / `.mtl-suggest-chip.is-best` / `.mtl-menu-results` / `.mtl-menu-row` / `.mtl-menu-group` / `.mtl-taste-grid` 等样式（复用主题变量，四套主题不另写皮肤；展台主题单独压一条高亮 chip 底色）。
  - 版本 v0.20.1 → v0.21.0：`package.json`、`index.html` 页脚、`README.md`（功能描述 + 更新日志）、`plan/RPD_需求文档.md`（新增 §3.4.5）、`.trae/rules/project_rules.md`（当前阶段 / 版本 / 全局命名空间）。
- 关键结论/决定：
  - 不硬猜：菜单只收常驻、认知度高的单品；搜不到、认不出都允许手写并保存。
  - 「你的名字」双来源：内置菜单 + 本机历史 / 手填补充（`menuAdd`），在 `menuExtras()` 合并，一套数据同时服务候选与搜索。
  - 「老样子」门槛设同组合 ≥2 次，避免第一次就误判。
  - 口味档案全部由既有字段派生（品牌 / 名字 / 糖冰杯 / 价 / 时段 / 心情），不新增字段。
- 产出物（文件/链接）：
  - `web/assets/js/menu.js`、`web/index.html`、`web/assets/js/app.js`、`web/assets/css/style.css`、`package.json`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 部署后真机验收：AI 认名对齐、只认出品牌时的常见款候选、搜饮品名（跨品牌 / 搜品牌名）、「老样子」回填、手填新名字下次能搜到、我的页口味档案。
- 风险/注意事项：
  - 菜单价格是常见价估价，只作「约 ¥」提示；菜单随季节调整，以门店实际为准。
  - `menuAdd` 记在 `localStorage` 的 `mtl:settings:v1`，清站点数据会丢；导出备份暂不含它。



## 2026-10-29 会话条目：v0.21.2 接入统一账户中心（可选登录）

- 目标：
  - 让「拍一杯」认统一账户中心的身份（一处登录、各作品通用），但只认 uid，不引入自有账号体系、不做云同步，记录仍只存本机。
- 已做：
  - 复制账户中心 SDK：`account-center/sdk/ps-auth.js` → `web/assets/js/ps-auth.js`（整文件同源，不手改）。
  - 新增 `web/assets/js/account.js`：`productId = milk-tea-log`、`apiBase = https://account.chesterlee.cn`；页面加载**不**初始化 SDK（避开静默登录跳转），只有本机有 `ps_token` 或地址栏带回 `ps_ticket` 时才加载 SDK 读身份；其余情况只渲染一枚普通登录链接。
  - `web/index.html`：「我的」页顶部新增账户入口 `#mtl-account`（徽章 + 昵称/提示 + 箭头，默认 `hidden`，由 JS 决定显示文案），并在 `app.js` 之后加载 `account.js`。
  - `web/assets/css/style.css`：新增 `.mtl-account*` 样式，全部走主题变量（四套主题自适应）。
  - 本机登记作品（account-center 本地 store）：`milk-tea-log` / 「拍一杯」/ `http://localhost:8830` / `light` / `#b9794f`。
  - 版本 v0.21.1 → v0.21.2：`package.json`、`index.html` 页脚、`privacy.html`（账号相关表述 + 页脚版本）、`README.md`（功能描述 + 更新日志）、`plan/RPD_需求文档.md`（新增 §3.4.6 + 变更行）、`.trae/rules/project_rules.md`（当前阶段 / 数据隐私边界 / 版本）、`usage/Running.md`（改哪里 + 排查表）。
- 关键结论/决定：
  - 账户只提供身份：记录 / 照片 / 语音 / 第三方 Key 不传、不搬；退出 / 注销都在账户中心做。
  - 不做「进来先静默登录」：SDK 的 `init` 会触发 12 小时一次的静默跳转，对没账号的人是打断；改成「有 Token 或刚登录回跳才读身份」。
  - 本机（localhost）不挂入口：账户中心页面在本机另起端口，中转页没托管，避免本机调试被跳走。
  - 登录页配色用品牌焦糖 `#b9794f` + `light`，跟随拍一杯视觉。
- 产出物（文件/链接）：
  - `web/assets/js/ps-auth.js`、`web/assets/js/account.js`、`web/index.html`、`web/assets/css/style.css`、`web/privacy.html`、`package.json`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`、`usage/Running.md`
- 待办：
  - 线上登记作品（服务器上，`DATA_FILE=/var/lib/account-center/store.json node tools/register-product.js milk-tea-log "拍一杯" https://mtl.chesterlee.cn light '#b9794f'`）并重启 account-center。
  - 服务器 `ALLOWED_ORIGINS` 增加 `https://mtl.chesterlee.cn` 并重启。
  - 部署本站后真机验收：未登录点登录 → 登录 → 回跳无 `ps_ticket`、显示昵称；刷新仍登录；退出后刷新不被拉回；断网 / 账户服务不可用时记录照常。
- 风险/注意事项：
  - 本地 store 里登记的是 `http://localhost:8830`，线上必须单独登记成 `https://mtl.chesterlee.cn`（`returnUrl` 白名单按登记地址校验）。
  - 登录态存在本域 `localStorage` 的 `ps_token`；换域名 / 清站点数据后需重新登录。

## 2026-10-29 会话条目：v0.21.3 首页补「最近一杯 + 本周小结」

- 目标：
  - 首页除了问候和大快门太空，补一点点内容，不抢主按钮、不加引导文案。
- 已做：
  - `web/index.html`：快门下方新增 `.mtl-hero-foot`——「最近一杯」按钮（缩略图 + 名字 + 品牌 · 今天 / 昨天 / 日期 + 箭头，默认 `hidden`）+ 一行 `#mtl-hero-week`。
  - `web/assets/js/app.js`：`renderHero()` 末尾调 `renderHeroLast()` / `renderHeroWeek()`；新增 `heroThumbOf()`（`thumbBlob` 优先、`photoBlob` 兜底，object URL 复用、换记录先撤销）、`dayLabel()`（今天 / 昨天 / 日期）、`weekStartKey()`（周一起算）；点击最近一杯用 `openDetail(id)` 打开详情。
  - `web/assets/css/style.css`：新增 `.mtl-hero-foot` / `.mtl-hero-last*` / `.mtl-hero-week`，全部走主题变量，四套主题自适应。
  - 版本 v0.21.2 → v0.21.3：`package.json`、`index.html` 页脚、`privacy.html` 页脚、`README.md`（功能描述 + 更新日志）、`plan/RPD_需求文档.md`（§3.1 + 变更行）、`.trae/rules/project_rules.md`（当前阶段 / 版本）。
- 关键结论/决定：
  - 只加「最近一杯」和「本周小结」两块，够填空、又不喧宾夺主；没有记录时两块都不显示（新用户首页保持极简）。
  - 本周按周一算起；「最常」按本周记录里的品牌杯数取第一，没有品牌就只显示杯数。
- 产出物（文件/链接）：
  - `web/index.html`、`web/assets/js/app.js`、`web/assets/css/style.css`、`web/privacy.html`、`package.json`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 真机看四套主题下的间距（尤其展台主题的卡片底色）与底部导航是否挤。
- 风险/注意事项：
  - 首页每次 `renderHero()` 都会跑，缩略图 URL 已做复用 + 撤销，避免泄漏；删除最后一条记录时会自动隐藏并释放 URL。


## 2026-10-29 会话条目：v0.21.3 账户中心线上登记 + 部署

- 目标：
  - 把接入能力真正跑起来：账户中心线上登记作品、放行跨域、本站上线。
- 已做：
  - 服务器 `/etc/account-center.env` 的 `ALLOWED_ORIGINS` 追加 `https://mtl.chesterlee.cn`（备份 `account-center.env.bak.20261029-2358`）。
  - 线上登记作品：`milk-tea-log` / 拍一杯 / `https://mtl.chesterlee.cn` / `light` / `#b9794f`，重启 `account-center`。
  - `rsync` `web/`、`server/` 到 `/srv/chesterlee/mtl/{web,server}` + `scp package.json` → `sudo systemctl restart mtl`。
  - 台账 `部署上线备案/README.md` §六 补一条操作记录。
- 关键结论/决定：
  - 本机登记（localhost:8830）只服务本地联调；线上票据回跳白名单以线上登记为准，两者互不影响。
- 产出物（文件/链接）：
  - 线上 `https://mtl.chesterlee.cn`（v0.21.3）；`/etc/account-center.env`；`/var/lib/account-center/store.json`
- 待办：
  - 本人手机验收：点登录 → 登完回跳无 `ps_ticket` 且显示昵称 / 刷新仍登录 / 退出后刷新不被拉回 / 断网时记录照常。
- 风险/注意事项：
  - 账户中心只认 uid；退出 / 注销在账户中心操作；换域名或清站点数据后需重新登录。

## 2026-10-29 会话条目：v0.21.4 桌面提示弹层改居中

- 目标：
  - 用户反馈「把『拍一杯』放到桌面」首访弹层贴在屏幕底部，要求改成居中。
- 已做：
  - `web/assets/css/style.css`：新增 `#mtl-install-tip { align-items: center; padding: 20px; }`（只作用于这一枚弹层，不影响详情 / 分享弹层）与 `#mtl-install-tip .mtl-sheet { border-radius: 22px; }`（四角圆角，去掉贴底 sheet 的下圆角）。
  - 版本 v0.21.3 → v0.21.4：`package.json`、`index.html` 页脚、`privacy.html` 页脚、`README.md`（功能描述 + 更新日志）、`plan/RPD_需求文档.md`（变更行 + §3.10）、`.trae/rules/project_rules.md`（当前阶段 / 版本）。
- 关键结论/决定：
  - 只改容器的对齐方式与圆角，内容、只弹一次（`installTipSeen`）、standalone 不弹的逻辑都不动。
- 产出物（文件/链接）：
  - `web/assets/css/style.css`、`package.json`、`web/index.html`、`web/privacy.html`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 真机 / 桌面各看一眼居中效果；部署时同步 `web/`。
- 风险/注意事项：
  - 手机窄屏下弹层四周留 20px，宽度自动变窄；内容短，不会撑出滚动。

## 2026-10-30 会话条目：v0.21.5 官网介绍页 + 挂到 /site/

- 目标：
  - 给拍一杯做一个简单的官网介绍站（可爱 / 奶茶风），并把首屏的手机模型换成真实 App 截图；最后挂到 `mtl.chesterlee.cn/site/`。
- 已做：
  - 新增 `site/`（纯静态单页，零构建）：`index.html` + `assets/site.css` + `assets/site.js` + `assets/img/`（图标与 4 张真机截图）。配色沿用 App 的 CSS 变量（米白 `#f7efe6` + 暖棕 `#b9794f`），结构为 导航 → 首屏 → 滚动标语 → 三步 → 界面实拍 → 功能卡 → 印章地图 → 四套主题 → 隐私 → 疑问 → 收尾 → 页脚。
  - 真机截图：本机真实 Chrome + CDP（`Emulation.setDeviceMetricsOverride` 390×844 / DPR2），打开线上 App 后用 IndexedDB 灌入 10 条演示记录（奶茶杯用 Canvas 现画），截首页 / 印章 / 贴纸册 / 我的四屏 → `sips` 转 JPEG 86 存 `site/assets/img/shots/`。
  - 首屏 `.phone` 由 CSS 手绘 UI 换成 `<img class="phone__img" src="assets/img/shots/home.jpg">`，删掉 `.phone__notch` / `.m-*` 整段旧样式；新增 `#shots` 区块（桌面 4 列错位贴纸、≤860px 改横向滑动）、导航加「界面」。
  - `server/index.js`：新增 `SITE_DIR` 与 `app.use("/site", express.static(...))`（放在 `web/` 静态与 404 兜底之前），线上 `https://mtl.chesterlee.cn/site/` 已 200。
  - 页脚按部署台账 §2.3 修正：`© 2026 <a href="https://chesterlee.cn/">Chester</a> · 备案号`（Chester 也必须是超链接）。
  - 版本 v0.21.4 → v0.21.5：`package.json`、`web/index.html`、`web/privacy.html`、`README.md`（目录结构 + 功能描述 + 更新日志）、`plan/RPD_需求文档.md`（变更行）、`.trae/rules/project_rules.md`（当前阶段 / 版本）。
- 关键结论/决定：
  - 官网不复用 `web/`（避免影响 App 的 no-store / manifest 等静态头），独立 `site/` 目录整包上传即可替换。
  - AI 生图接口只返回占位图，演示照片改为 Canvas 现场绘制，避免外部依赖。
  - 地图视角截图不可用（放大后底图渲染异常），第 3 张改用「贴纸册」视图。
- 产出物（文件/链接）：
  - 线上：`https://mtl.chesterlee.cn/site/`
  - `site/index.html`、`site/assets/site.css`、`site/assets/site.js`、`site/assets/img/shots/{home,archive,sticker,me}.jpg`、`server/index.js`
- 待办：
  - 已完成：`me.jpg` 重截（截前把 `mtl:settings:v1` 的 `lastBackupAt` 写成 2 天前，避开「很久没备份了」toast），替换后 `rsync` 上线。可选：给 App 首页 / 我的页加入口链到官网。
- 风险/注意事项：
  - 部署方式：`rsync site/` + `scp server/index.js` → `sudo systemctl restart mtl`；台账 §2.1 与 §六 已回填。
  - 体检 `health.sh mtl.chesterlee.cn`：HTTP 200 / 备案号 ✅ / 版权 ✅ / 证书剩 86 天。

## 2026-10-30 会话条目：v0.21.6 「我的 → 关于」改成官网入口

- 目标：
  - 「我的 → 关于」里的个人网站入口（`chesterlee.cn`）改成拍一杯官网，并在旁边说明这个入口是干什么的。
- 已做：
  - `web/index.html`：`.mtl-site-link` 的 `href` 改为 `https://mtl.chesterlee.cn/site/`，文案「我的个人网站 · chesterlee.cn」→「拍一杯官网 · 介绍与真机截图」；下方补一句 `mtl-hint`：「官网是给还没用过的人看的：三步怎么用、能做什么、在手机里长什么样，都在那一页；想推荐给朋友，把链接发过去就行。」
  - 版本 v0.21.5 → v0.21.6：`package.json`、`web/index.html`、`web/privacy.html`、`README.md`（当前版本 + 更新日志）、`plan/RPD_需求文档.md`（变更行）、`.trae/rules/project_rules.md`（当前阶段 / 版本）。
  - 官网滚动标语改成无缝循环：`site/index.html` 从「2 段裸元素」改成 **6 个等宽 `.ticker__group`**（每组自带 `padding-right: 26px`，与组内 `gap: 26px` 一致），`@keyframes marquee` 位移由 `-50%` 改为 `-16.6667%`（正好一组宽）。原因：原来轨道总长 2 组 ≈ 1180px，宽屏（1920+）右侧会露白，且 `-50%` 与 gap 相加有半格误差。实测 1920 / 2560 / 390 三个宽度：`trackW - groupW` 均 ≥ 屏宽，循环无断点。仅官网静态文件，不改 App 版本。
- 关键结论/决定：
  - 只换入口指向与补一行说明，不新增模块、不改样式；`chesterlee.cn` 仍保留在「我的 → 关于」底部的 © 署名链接里（台账 §2.3 要求 Chester 链个人站）。
- 产出物（文件/链接）：
  - `web/index.html`、`web/privacy.html`、`package.json`、`README.md`、`plan/RPD_需求文档.md`、`.trae/rules/project_rules.md`
- 待办：
  - 线上验收：`我的 → 关于` 显示「拍一杯官网」，点开新窗口进 `/site/`。
- 风险/注意事项：
  - 官网是绝对地址（`https://mtl.chesterlee.cn/site/`），本地预览点击会跳到线上站点，属预期。
