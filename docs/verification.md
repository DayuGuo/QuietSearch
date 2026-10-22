# 验证记录

日期：2026-10-22。此记录针对当前实现。已发布到 Cloudflare，验证期间没有调用真实 DeepSeek 付费 API。

## 实际执行与结果

### 页脚链接补记

根据维护者要求，在页面底部增加“个人博客”和“GitHub 开源仓库”，分别指向 `https://anotherdayu.com/` 与 `https://github.com/DayuGuo/QuietSearch`。首页和结果页共用页脚，支持中英文，链接在新标签页打开并设置 noopener/noreferrer。桌面浅色与手机深色截图已检查，类型/lint、101 项测试、32 项浏览器回归（含自动无障碍检查）、5 项真实 Worker 运行时回归、构建与部署 dry run 均通过。

### 公开开源发布补记

已创建并上传至公开仓库 [DayuGuo/QuietSearch](https://github.com/DayuGuo/QuietSearch)，首次源码提交为 `b8ccaa7`，采用 MIT 许可证。67 个文件包含完整源码、测试和原始设计文档；密钥文件、日志、本地依赖、构建和浏览器测试产物不在提交中。提交使用 GitHub 隐私邮箱，已启用私密漏洞报告。

首次 [GitHub Actions 运行](https://github.com/DayuGuo/QuietSearch/actions/runs/39782275779) 已全部成功，包括全新依赖安装、类型/lint/101 项测试/生产构建、5 项真实 Worker 运行时回归、浏览器 E2E 和部署 dry run。该工作流不调用真实付费 API，不发布 Worker。

### Cloudflare 首次部署补记

用户首次构建 `db2c3c81` 因 Build command=None，直接运行 `npx wrangler deploy`，缺少 Vite 生成的资源目录与部署配置而失败。已在现有 quietsearch Worker 的构建设置中保存 `npm run build`，保留部署命令 `npx wrangler deploy` 与根目录 `/`，并重试原部署。

重试构建 `7c2d5479` 已成功，生产版本 `f793f243-e450-41c6-8320-76e3d5cf5c40`，地址为 [QuietSearch](https://quietsearch.zhaoyuguo.workers.dev)。浏览器已确认首页加载、搜索框和 Key 配置引导正常渲染；未使用真实 Key 执行线上搜索或摘要。默认仍为 BYOK，ASSETS、限流和摘要模型绑定已在成功部署日志中确认。本地构建与部署 dry run 也已再次通过。

### 更多结果与排序补记

网页每次提交请求最多 50 条结果，默认每批展示 10 条，可在设置切换为 20 条。新增“显示更多结果”和默认顺序、综合评分、来源等级、发布时间四种排序；展示上游评分和请求/返回/清理/保留数量。接口没有分页参数，展开仅展示已获取内容，最多 50 条，上游可能返回更少。

新增测试覆盖评分有效范围、未知值、稳定排序、去重计数、50 条编号，以及浏览器逐批展开、八条结果时不出现虚假下一页、切换排序不增加搜索/摘要/用量、引用编号保持原始来源、新提交重置排序和展示批次。桌面和手机深色截图已检查，新增 `more-results-desktop.png` 与 `more-results-mobile-dark.png`。真实 workerd 回归验证 50 条请求与数量元数据。

### 连接失败修复补记

用户报告真实使用时“测试连接”返回 UPSTREAM_ERROR。定位到 Worker 出站 fetch 使用了不支持的 redirect=error，在请求发出前抛 TypeError；此前 Node fetch spy 和浏览器的上游拦截没有覆盖此运行时差异。

已改为 redirect=manual，所有 3xx 按错误拒绝，不跟随或转发凭证。新增 `npm run test:runtime`，直接在 Cloudflare 插件安装的真实 workerd 中加载生产 Worker 包，拦截全部出站网络。5 项回归覆盖成功连接、无效密钥、拒绝重定向、搜索与摘要流；已通过，并加入 CI。

在正在运行的本机开发服务使用**无效诊断密钥**请求 /api/check-key：修复前为 502/UPSTREAM_ERROR，修复后得到 DeepSeek 的 401/INVALID_KEY，证明连接请求可以到达官方接口。不读取或使用用户真实 Key，未发起搜索或生成。这不代表用户真实密钥、余额或搜索权限已验证。

依据：[Cloudflare Request 文档](https://developers.cloudflare.com/workers/runtime-apis/request/)明确只支持 follow/manual，error 会在发送前抛异常。

环境：macOS arm64；基准 Node **24.22.1**，另在系统 Node 26.8.2 检查开发与浏览器流程。Cloudflare compatibility date 为已安装运行时支持的 **2026-10-19**。直接依赖精确固定，package-lock.json 已核对一致。

| 命令/操作                                                  | 实际结果                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 原设计包 `node checks/query-intent-reference.test.cjs`     | 34 个参考用例通过；不是应用验收                                                         |
| 全新临时目录、Node 24 下 `npm ci --no-fund --no-audit`     | 成功；不复制 node_modules、dist、.wrangler、.git、运行时环境文件或测试产物              |
| `npm run typecheck`                                        | 通过，TypeScript strict                                                                 |
| `npm run lint`                                             | 通过                                                                                    |
| `npm test`                                                 | **6 个文件、101 个测试通过**                                                            |
| `npm run build`                                            | Worker + client 生产构建通过                                                            |
| 干净安装目录、Node 24 下 `npm run check`                   | 初次基线类型、lint、91 测试、生产构建全部通过；本次当前目录 Node 24 检查含 101 测试通过 |
| `npm run test:e2e`                                         | **32 个测试通过**，桌面与手机深色两组 Chromium 环境                                     |
| `npm run format:check`                                     | 通过；原始设计包未被格式化覆盖                                                          |
| `npm run deploy:check`                                     | Cloudflare dry run 成功，没有发布或创建资源                                             |
| 最终构建 `npm exec --offline -- wrangler deploy --dry-run` | 再次打包预检成功；ASSETS、API_LIMITER、BYOK 和摘要模型绑定正确                          |
| `npm audit --omit=dev --json`                              | 检查时生产依赖已知漏洞为 0，不代表不存在未知漏洞                                        |
| 浏览器人工视觉检查                                         | 查看首页、Kagi 官方参考、结果、用量和手机设置截图；修复手机连接引导挤压问题             |
| Git                                                        | 完整源码已提交并上传公开仓库 DayuGuo/QuietSearch 的 main 分支                           |

## 测试能证明什么

单元/Worker 逻辑测试直接导入生产模块，使用 fetch 替身和合成数据：

- 问号、空白、URL、Unicode 长度、原始 body 字节边界；普通搜索只有一次 Search、没有 Chat。
- 问号模式可分别调用一次 Search 和 Chat；后端拒绝无问号摘要、空来源、危险 URL、未知控制字段和不支持的数量。
- 连接测试仅访问 models；BYOK 不回退服务器 Secret；server 模式全部三个服务路由在认证缺失时均零上游调用。
- 真实测试 RSA 签名算法与受控 JWKS：合法、伪造、过期、未来生效、错误 issuer/audience/签名、缺 exp、错误配置均按预期处理。测试密钥不是生产凭证。
- SSE 按单字节拆分的中文/emoji、CRLF、心跳、多行数据、最终 usage、非答案推理过滤、提前断流、坏 JSON、输出上限和取消传递。
- 无 Content-Length 的超大流、不会结束的请求体超时、上游响应大小、原始错误脱敏、限流及其配置缺失。
- 本地记录开关、200 条上限、大容量有效记录刷新、过期/异常存储数据、存储拒绝和独立清除。

浏览器测试运行生产构建与真实本地 workerd：

- 网页搜索和摘要响应被测试拦截为可识别的合成内容；请求计数证明普通查询无摘要应用请求。上游调用计数另由 Worker 逻辑测试验证。
- 初次设置、只测试连接不搜索、不自动补交待搜索内容、Key 不进入持久存储/URL/标题、刷新清空 Key。
- 引用链接、失败保留结果、重试原快照且不重搜、新普通查询隔离旧回答、无结果不生成。
- XSS 文字仅作为文字显示，未加载外部图片/字体/统计；模拟输入法组合事件与双击防重。
- 历史暂停/填入/清除、每日结果数和 tokens、语言切换、深色、Esc 与焦点恢复、手机不横向溢出。
- **真实 workerd HTTP** 检查静态 HTML 的严格 CSP、不含 unsafe-inline，以及无问号摘要请求的 400/no-store。
- axe 对首页、设置、结果、历史、用量进行 WCAG A/AA 自动检查；两种浏览器配置均无已报告违规。这不是完整无障碍认证。

截图位于被 Git 忽略的 `artifacts/`，包括 home/results/history/usage/settings 的 desktop 和 mobile-dark。仅有合成查询和无效测试 Key，没有真实凭证或用户检索内容。

## 尚未执行

- 真实 DeepSeek models/Search/Chat 账号权限、余额、费用、延迟、取消后的计费行为。
- 私人模式的 Access 邮箱策略、JWKS 与所有域名/预览入口保护；本次上线为 BYOK 模式。
- 真机、Safari/Firefox、完整屏幕阅读器人工测试；手机测试为 Chromium 模拟。
- 从公开仓库 Fork、导入 Cloudflare 并完成部署的完整账号授权流程。

## 维护者上线时的最少步骤

1. 将源码放入自己的 GitHub 仓库，在 Cloudflare 导入或用 Wrangler 登录部署；默认 BYOK 无需站长 Secret。
2. 在网页设置中填写自己的 Key，明确自行承担请求费用后分别验证普通搜索和问号回答；检查实际来源、错误提示和摘要重试。
3. 如启用 server 模式，先完成 private-deployment.md 的 Access 与运行时 Secret 配置，再验证未认证请求确实被拒绝及全部入口受到保护。
4. 把真实结果、日期、域名和未通过事项补到本文件。不要把以上 mock 或 dry run 标记成线上成功。

## 已知限制

本地历史不加密、不跨设备同步；关闭页面时无法执行到期清理。每日计数是应用观察值，跨标签页非原子，断流可能缺 tokens，不是账单或硬预算。摘要接受客户端来源，不做服务端搜索会话证明；来源编号有效不等于事实核查。取消和限流均不保证没有上游费用。平台日志政策不由本应用控制。
