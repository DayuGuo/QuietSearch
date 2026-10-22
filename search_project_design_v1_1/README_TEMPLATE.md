# QuietSearch

> README 模板：软件尚未在本设计包中实现。Codex 应根据实际代码、真实仓库和测试结果改写本文件为 README.md，发布时删除这段模板说明，不保留未验证的功能承诺。

一个简洁、可自行部署的网页搜索网站：查看 DeepSeek 网页搜索结果，在搜索末尾加 `?` 或 `？`，才生成带来源编号的 AI 回答。

界面使用简洁中性色和本地图标，支持手机、浅色/深色以及中文/英文。没有聊天记录、广告或分析脚本。默认不长期保存 API Key 和搜索记录。

## 普通用户：通过浏览器部署

### 准备

需要一个 GitHub 账号、一个 Cloudflare 账号，以及你自己的 DeepSeek API Key。无需先租服务器、安装 Docker 或购买域名。DeepSeek 搜索与 AI 生成可能产生费用，Cloudflare 也受其套餐限制。

[Codex：在此加入官方获取 DeepSeek Key 的入口，并核对链接；不要放第三方售卖密钥服务。]

### 1. 创建你自己的站点

点击本仓库的 **Deploy to Cloudflare**。按提示登录、授权 GitHub，并创建或连接你的项目。保持默认 BYOK 模式：访问者使用自己的密钥。

[Codex：已知真实公开仓库 URL 后，按官方文档生成部署按钮；仓库未确定时明确标记“发布前补充”，不可使用假的 username/repo 造成可用错觉。官方说明：https://developers.cloudflare.com/workers/platform/deploy-buttons/ ]

### 2. 打开部署网址

平台构建并部署完成后，打开提供的网址，例如你自己的 workers.dev 地址。默认模式不需要在部署平台填写 DEEPSEEK_API_KEY。

“部署按钮”负责启动配置和部署，不代表已开通所有账号、已经充值，或自动完成私人登录保护。

### 3. 添加你的 API Key

点击网站右上角设置 → 粘贴 DeepSeek API Key → 测试连接 → 完成。测试连接不执行搜索或生成，但成功并不代表所有模型权限和余额都已验证。

默认只在当前页面内存中保留密钥；刷新或关闭页面后需要重新输入。不要将真实密钥粘贴到 GitHub Issue、截图、公开聊天或本仓库文件中。

### 4. 开始搜索

输入关键词，按回车或点击搜索。**默认只显示网页搜索结果。**

希望同时得到 AI 回答时，在输入末尾加英文问号 `?` 或中文问号 `？`，然后提交：

- `肝纤维化 超声` → 只搜索网页。
- `肝纤维化有哪些超声表现？` → 先显示网页结果，再在顶部生成带来源的 AI 回答。
- `How does ultrasound assess liver fibrosis?` → 同样触发 AI 回答。

问号后误带空格仍可识别；问号只在句中或网址参数里、但不在末尾时不会触发；连续多个末尾问号也只触发一次。只输入 `?` 或 `？？` 不执行搜索。输入框的模式提示仅是本地预览，未提交前不调用搜索或模型。

没有 AI 常开开关，也不依据“为什么”等词自动判断。即使输入是一个完整问题，没有末尾问号也只搜索。摘要仅依据这次返回的网页摘要整理，并不代表已逐页阅读全文。

只在你自己部署或信任的实例中输入密钥。请求会经过该实例的 Cloudflare Worker，之后发送给 DeepSeek。

## 想长期使用、不想重复填写密钥

使用可选的“私人服务端模式”。这种模式把密钥放在 Cloudflare Worker 运行时 Secret 内，浏览器不用保存，也不能读取这个 Secret。

不能只添加 Secret 就公开使用。先按照 docs/private-deployment.md 配置 Cloudflare Access，允许你指定的邮箱登录，保护正式域名、workers.dev 和预览入口。

然后配置：

| 项目 | 放在哪里 | 含义 |
|---|---|---|
| KEY_MODE=server | 版本控制的非敏感运行时配置 | 启用私人服务端模式 |
| CF_ACCESS_TEAM_DOMAIN | 非敏感运行时配置 | 已建立的 Access 团队域名 |
| CF_ACCESS_AUD | 非敏感运行时配置 | 当前 Access 应用的 audience |
| DEEPSEEK_API_KEY | Cloudflare Worker runtime Secret | 真实 DeepSeek Key，不写进源码 |
| SUMMARY_MODEL | 非敏感运行时配置 | 实现当天核实的摘要模型 |

[Codex：核对最终代码的变量名、实际控制台入口、允许邮箱设置、JWT 配置获取步骤。把真实步骤写入单独文档，并说明哪些非敏感配置由 wrangler.jsonc 管理，以免下次部署覆盖控制台设置。]

配置后，用未登录窗口确认访问被拦截；并确认未认证的 API 请求不能消耗你的额度。应用后端也必须验证 Access JWT，不能仅依靠网页上出现登录页面。

服务端 Secret 不填入 VITE_*、GitHub 源文件、公开构建参数或 URL。网页不提供读回服务器密钥的按钮。

## 隐私说明

应用默认不主动持久保存搜索记录，BYOK 密钥只在页面内存中。搜索词不会写进网站 URL。API 不缓存用户结果，页面不自动加载第三方 favicon、字体、图片、统计或会话录制脚本。

但这不是离线或匿名工具。搜索、密钥验证和摘要请求经本实例运行的 Cloudflare Worker 发往 DeepSeek；使用私人模式还涉及 Cloudflare Access。平台可能依自身政策处理运行数据，应用也无法控制浏览器扩展、设备入侵、剪贴板或目标网站的行为。

BYOK 密钥会在你的浏览器与本实例 Worker 之间传输，不能说部署者无法访问。自部署能让你控制应用代码，但不意味着 Cloudflare 或 DeepSeek 完全不处理数据。

详情见 docs/privacy.md。安全问题请按 SECURITY.md 联系维护者，不要公开提交真实密钥。

## 费用

一次普通搜索会请求一次 DeepSeek Search。在末尾加 ? 或 ？ 提交且检索到有效来源时，才额外调用模型生成回答，按输入与输出 tokens 计费；普通搜索不调用模型。手动重试或再次搜索可能产生新费用。停止生成不保证已经处理的部分不计费。

Cloudflare 限流是防滥用措施，不是精确账本或硬预算。请自行查看 DeepSeek 和 Cloudflare 账户用量。

DeepSeek 官方价格：https://api-docs.deepseek.com/quick_start/pricing/  
Cloudflare 官方价格：https://developers.cloudflare.com/workers/platform/pricing/

不在本说明承诺长期免费或固定的每次搜索价格。

## 更新、回滚与撤销密钥

[Codex：根据项目最终部署方式补全准确步骤。区别 Fork 同步与直接修改仓库，先检查自定义非敏感配置，再通过已连接的 Cloudflare Build 部署。说明如何选择已有版本回滚，并指出 Secret/Access 等配置可能需要单独核对，不保证代码回滚恢复一切。]

BYOK：在网站设置移除密钥；刷新也会清空页面内存。清理网站偏好不会撤销 DeepSeek Key，也不会清理系统剪贴板。

服务端模式：到 Cloudflare Secret 设置替换或删除 DEEPSEEK_API_KEY，并按实际平台要求部署/生效。怀疑泄露时，到 DeepSeek 平台撤销旧 Key、生成新 Key；不要只从 GitHub 文件里删掉字符串，因为历史记录可能仍存在。

## 常见问题

**刷新后为什么需要重新输入 Key？**

默认不长期保存密钥。个人长期使用可选择受 Access 保护的服务端 Secret 模式，而不是把 Key 明文保存在浏览器。

**能否只用 GitHub Pages？**

不能用 GitHub Pages 单独运行完整后端。本项目默认部署到 Cloudflare，GitHub 用于保存代码；不要将 API Key 烘焙进静态网页。

**为什么没有 AI 回答？**

只有提交的内容末尾是 `?` 或 `？` 才开启 AI 回答。请在末尾加问号并重新提交；没有有效检索结果时也不会生成。仅在搜索框中输入问号而不提交，不会触发请求。

**搜索结果有了，但摘要失败了？**

搜索和摘要是独立请求。可以继续查看结果，并按错误信息检查模型、余额、限流或网络；点击“重试摘要”不应该重新搜索。

**401、402 或 429 是什么？**

先区分本实例登录/鉴权错误与上游返回状态。上游 401 通常指密钥认证失败，402 指余额相关问题，429 指限流。不要反复自动重试；按实际友好错误说明处理。

[Codex：实施时核对官方错误码和最终映射，不复制与代码不符的解释。]

**打开网页就要求登录，或提示 Access 未配置？**

检查是否启用了私人模式和正确 Access 策略。不要为排错关闭后端身份校验后继续使用站长密钥。默认 BYOK 与私人服务端模式是两条不同路径。

**一键部署失败，或部署网址打不开？**

检查构建日志、仓库权限、平台额度与域名访问；不要把包含 Key 的日志或浏览器网络记录公开上传。必要时提供经过脱敏的错误码、构建步骤和时间。

## 开发者

[Codex：以下命令是目标接口。必须先实现对应脚本，实际执行后再写为正式说明。补充与你选定依赖兼容的 Node 版本与平台要求。]

```bash
npm ci
npm run dev
```

本地默认采用 BYOK，在页面设置中填写你自己的 Key。开发演示/测试使用显式 mock，不能作为生产默认结果。

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

部署命令由最终脚本提供，并说明需要事先登录 Cloudflare：

```bash
npm run deploy
```

不要提交 .dev.vars 或真实 .env。不要给客户端 VITE_* 变量设置 API Key。共享结构和后端配置必须分离。

## 测试状态

维护者在 docs/verification.md 记录：实际运行的命令、mock/单元测试、构建、真实 DeepSeek API 是否测试、Cloudflare 是否真实部署、尚存限制。

未提供真实凭证时，不能将 mock 测试通过标记为真实联通。生产 UI 不显示虚构搜索结果或“已通过官方验证”。

## 许可证与图标

[Codex：根据仓库实际 LICENSE 填写，建议 MIT；第三方许可见 THIRD_PARTY_NOTICES.md。Lucide 图标许可及继承声明必须保留。]
