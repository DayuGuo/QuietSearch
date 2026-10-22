# 交给 Codex 的引导词

版本：1.1（问号触发版）；名称尚未确定，QuietSearch 只保留为工作名。

使用方式：把 PROJECT_SPEC.md、AGENTS.md、README_TEMPLATE.md 和 QUESTION_MARK_UPDATE.md 放在项目根目录；把下面的“总引导词”发给 Codex。后面的阶段提示用于分阶段检查或另开上下文继续工作，不必一次全部粘贴。

## 一、总引导词：实现整个首版

```text
请在当前仓库实现 QuietSearch，一个私人优先、可自行部署的轻量网页搜索网站。

先读取 AGENTS.md、PROJECT_SPEC.md 和 README_TEMPLATE.md，检查已有文件与 git 状态，不覆盖已有工作。项目规格是需求依据；官方最新 API 文档是接口依据。先简述实施计划，再直接进行本地实现，不停留在架构讨论或只交付静态原型。

产品只做三件事：DeepSeek 网页搜索、简洁真实结果列表、仅在已提交查询末尾为 ? 或 ？ 时，位于列表上方的带来源 AI 回答。风格参考 ChatGPT 的中性色、留白、圆角和文字层级，不复制品牌或专有资产。使用本地打包的 Lucide 图标、系统字体，桌面和手机、浅色和深色均可用。

技术采用 React + TypeScript strict + Vite + Cloudflare 官方 Vite 插件 + 单个 Worker 和 Static Assets + 普通 CSS + 原生 fetch。单仓库，不需要数据库、SSR、Docker、Agent、多模型平台或全套组件库。必要的请求校验和 JWT 验证可以使用维护良好的小型依赖，禁止自己写密码学。

密钥默认采用 BYOK 页面内存模式：设置里粘贴、遮挡、测试、替换、移除；刷新后清空，不写 localStorage/sessionStorage/IndexedDB/Cookie/URL/日志。明确说明请求经本实例 Worker 发送到 DeepSeek。服务端长期保存是单独的私人模式：Worker Secret + Cloudflare Access + 后端完整 JWT 校验，认证失败拒绝付费调用。byok 模式不能自动回退服务器 Key。不要实现裸露的共享站长 Key，也不要用 Base64 或前端固定密码假装加密。

先核实 DeepSeek Search、Chat Completions、Models 和 Cloudflare 当前部署文档；在 docs/api-contract.md 记录核对结果。所有上游地址固定，校验在服务端做；摘要用本次结果中的 summary，首版不抓全文。列表先显示，摘要流式生成且可取消、独立重试；无末尾问号或无有效结果不调用模型；不得后台生成后隐藏。移除旧 AI toggle，使用前后端共享纯函数解析 rawQuery，/api/summary 再次核验。详情按 QUESTION_MARK_UPDATE.md。引用只映射本次真实结果，不伪造来源。避免双击、StrictMode 和自动重试造成重复付费。

隐私默认：不存搜索历史，搜索词不进入地址栏，API no-store，不加载第三方 favicon/字体/图片/统计，不记录密钥、完整请求和搜索内容。搜索内容和模型输出当作不可信文本，不执行 HTML。不要将“没有应用日志”描述成供应商零日志。

实现简洁的设置、清晰的错误状态、输入上限、响应字节上限、限流和取消。注意 Static Assets 下 ctx.access 的官方限制：不能用它替代本项目所需的 JWT 认证测试。

将 README_TEMPLATE.md 改写为真实 README：首先讲普通用户如何通过 Deploy to Cloudflare、自己的账号、网页添加 Key 完成安装；其次讲 Secret + Access 的长期私人模式；最后才写开发命令。仓库地址未知就明确标注，不伪造一键部署链接或成功记录。部署按钮不等于自动设置 Access。

添加类型检查、lint、单元测试、Worker 测试、mock E2E 和生产构建；测试真实覆盖普通查询零 Chat、末尾中英文问号、尾随空白、连续问号、空查询、后端拒绝无问号摘要请求、密钥存储边界、认证失败、引用、XSS、SSE 跨块解析、超长输入和重复请求。截图用合成内容，不包含真实 Key。API 未获凭证时可用 mock 完成开发，但生产运行不能显示假结果。

请实际修改文件并执行可运行的检查。没有外部账号或授权时，仍完成本地实现、mock 测试和可部署构建；不得声称真实 DeepSeek 请求或 Cloudflare 发布已经成功。未经授权不创建付费资源、不使用真实 Key 发起付费调用、不推送外部仓库。

结束时报告：已实现内容、目录和关键设计、实际执行命令及结果、仍未验证的真实 API/云部署项目，以及用户完成部署所需的最少步骤。把验证记录写入 docs/verification.md。
```

## 二、阶段提示 A：需求落地与接口核验

```text
继续 QuietSearch。先只处理实施准备和项目骨架：阅读规格、检查已有改动、核实官方 API 和 Cloudflare React/Vite 部署方式，记录 docs/api-contract.md。确定问号触发、rawQuery 与规范化 query 的区别、密钥模式、固定上游、Unicode 长度、搜索响应、摘要流格式、非思考模式参数和配置来源。

初始化可构建的单仓库、共享类型、基础页面和测试框架。不要搭建数据库或多供应商框架。重点核对默认 BYOK 不需要部署时提供站长 Key，以及 Static Assets 不能仅靠 ctx.access 的认证兼容点。

运行安装、类型检查和构建，记录实际结果。只用无效测试 Key，尚未接通真实服务时明确说明。
```

## 三、阶段提示 B：界面完成度

```text
继续 QuietSearch，把界面做到可实际使用，不扩功能。参考 PROJECT_SPEC.md 的视觉变量与布局，实现首页、结果页、仅问号模式可见的 AI 回答容器和设置 dialog；搜索框提示“末尾加 ? 或 ？ 获取 AI 回答”，普通模式不出现 AI 占位，不添加 AI toggle。

ChatGPT 风格只取留白、中性色、圆角与文字层级；不要复制 logo，不要加入聊天侧栏、渐变宣传页和厚重卡片。全部图标本地 Lucide，全部字体本地系统字体。结果站点图标也用本地占位。

完善手机宽度、浅/深色、长标题、空态、失败、加载、键盘焦点、中文输入法 Enter、屏幕阅读器状态。用明确标识的测试 fixture 截图检查；测试假结果不得进入生产搜索逻辑。

检查初始、结果、设置三个场景，修复溢出、对比度和布局跳动，并记录所用视口和未能运行的视觉检查。
```

## 四、阶段提示 C：搜索、摘要与费用控制

```text
继续 QuietSearch，完成固定 DeepSeek 适配层及 /api/check-key、/api/search、/api/summary。

一次有效提交只请求一次 Search；只有已提交输入去除空白后以 ? 或 ？ 结尾且有有效结果，才在显示列表后针对同批结果生成短回答。普通查询只 Search、零 Chat；无结果不 Chat；测试连接不 Search/Chat。输入变化只更新本地模式预览。使用提交快照，前后端共用解析规则，后端不接受前端布尔值作为问号依据。摘要失败保留结果，重试只重试摘要。禁止未经用户操作的自动重试、自动再次搜索或流式自动重连。

实现服务器校验、上限、统一错误、超时、AbortSignal、UTF-8 和跨 chunk SSE、最后一块 usage、结束与提前断流。新搜索取消旧请求并隔离旧响应。

模型只获得 query 与 sources，不获得任何 Key/JWT/Cookie。默认关闭长推理，不启用工具；仅展示纯文本和安全引用。实际测试恶意来源文本、无效引用、上游 401/402/429/5xx 与取消情形。
```

## 五、阶段提示 D：独立安全审查并修复

```text
请把 QuietSearch 当成接收真实付费 API Key 的软件审查，不接受“前端有密码遮挡，所以安全”的结论。先列具体发现、严重度、文件位置和可重现方式，然后修复并添加回归测试。

重点检查：
1. Key 是否进入浏览器持久存储、URL、日志、打包产物、截图、错误或 prompt；API 响应是否可缓存。
2. byok 模式是否会回退站长 Secret；server 模式是否对所有付费路由完整验证 Access JWT 的签名、issuer、audience、有效期；伪造/过期/缺配置是否失败关闭。
3. Static Assets 下是否误用 ctx.access；是否只保护主页却遗漏 API、workers.dev 或预览地址。
4. 自定义上游、重定向、任意 headers、模型参数能否导致密钥外送或费用放大。
5. 标题、snippet、summary、引用和 URL 是否导致 XSS 或危险协议；模型能否触发任意工具/网络访问。
6. 超大分块请求、缺 Content-Length、Unicode 长度、SSE 边界、重复点击、StrictMode、取消和流重连。
7. 远程 favicon/字体/图片/分析脚本、Referer、应用日志和平台观测设置是否与隐私说明一致。
8. 限流是否被误称为硬预算；Origin 是否被误称为身份认证。
9. 无问号输入是否仍偷偷调用 LLM（意图识别/改写/预生成）；伪造 ai=true 能否绕过后端问号校验；旧摘要能否覆盖新普通搜索。

不要宣称所有风险都已消除；在 docs/verification.md 写清测试覆盖和残余风险。禁止用真实 Key 生成 HAR 或录屏。
```

## 六、阶段提示 E：新手部署和发布验收

```text
请按“第一次使用 GitHub/Cloudflare 的普通用户”的视角走查 QuietSearch 文档。

默认路径应是：准备账号 → 从真实仓库点击 Deploy to Cloudflare → 完成平台授权/构建 → 打开网址 → 网页添加自己的 Key → 测试并搜索。不要让默认 BYOK 要求设置服务器 Secret。解释刷新要重新添加密钥，以及只有搜索末尾的 ? / ？ 才开启 AI 回答；展示两种输入例子和额外模型用量说明。

长期私人模式单独写：运行时 Secret、Access 指定邮箱、全部域名/预览保护、JWT 配置、未登录请求拒绝验证。说明这些不是部署按钮自动完成的。普通变量和 Secret 的持久配置来源要清楚，后续 GitHub 部署不能默默覆盖所需配置。

核对 README 每条命令、环境变量、仓库链接、部署按钮和截图。未知信息明确标记，不能伪造。加上费用边界、更新/回滚、撤销 Key、常见错误和简短隐私说明。

在干净环境中运行 npm ci、typecheck、lint、测试、E2E、build 和可行的部署 dry run。真实 API 与云发布需要授权；缺少时记录未测，不冒充完成。最后交付一个可维护且诚实说明验证状态的版本。
```

## 七、上下文重开后的继续提示

```text
请先读 AGENTS.md、PROJECT_SPEC.md、docs/api-contract.md、docs/verification.md，并查看 git diff 和现有测试。不要从零重建，也不要覆盖已有用户修改。

总结当前实际完成状态和最重要的未完成项，然后继续下一项高优先级工作。保持末尾问号才触发 AI、默认 BYOK、单 Worker、轻量界面、不持久保存 Key/查询、服务端模式失败关闭这些边界。完成后更新验证记录。
```
