# QuietSearch

搜索网页，加个问号问 AI。一个可以自己部署的轻量搜索工具，支持浏览器本地检索记录和每日用量。

**[在线示例 · Try QuietSearch](https://quietsearch.anotherdayu.com)**

示例网站需要使用你自己的 DeepSeek API Key。Key 仅保存在当前页面内存中，刷新或关闭页面后需重新填写；搜索和 AI 回答的费用由对应的 API 账户承担。

- `城市散步 路线规划`：只搜索网页。
- `为什么树叶会在秋天变色？`：先显示搜索结果，再根据来源摘要回答。
- 输入时不会发起搜索；按 Enter 或点击箭头才执行。AI 不会因为“为什么”等词自动开启。

界面参考 Kagi 的清晰搜索体验，使用自己的品牌与本地资产。支持中文/English、手机、浅色/深色和键盘操作。

开源仓库：[DayuGuo/QuietSearch](https://github.com/DayuGuo/QuietSearch)。采用 [MIT 许可证](LICENSE)。

## 第一次使用

1. 打开你自己部署或信任的实例，点击 **添加 API Key**。
2. 在设置中点击 **打开官方平台**，到 [DeepSeek 官方平台](https://platform.deepseek.com/api_keys) 创建 API Key。
3. 复制 Key，粘贴到设置中的 **DeepSeek API Key**。这是 API 密钥，不是账户密码。
4. 可点击 **测试连接**；它只请求模型列表，不执行搜索或生成，也不验证搜索权限和余额。
5. 点击 **使用此密钥**，关闭设置，再提交搜索。

默认 Key 仅在当前页面内存中，刷新或关闭页面后需重新添加。不写入浏览器本地存储或 URL。请求经本站 Cloudflare Worker 转发给 DeepSeek，所以请只在自己或可信的实例填写。**保存或测试 Key 不会自动执行待搜索内容。**

普通搜索也可能有搜索 API 费用。问号回答和手动重试会额外使用模型 tokens；停止不保证已处理部分免费。查看 [DeepSeek 官方价格](https://api-docs.deepseek.com/quick_start/pricing/) 和 [Cloudflare 官方价格](https://developers.cloudflare.com/workers/platform/pricing/)，不要把本地统计当作账单。

## 更多结果与排序

每次提交向 DeepSeek 请求最多 **50 条**，默认先展示 **10 条**。在列表底部点击 **显示更多结果**，逐批展开已经取得的内容，不会再次搜索、生成回答或重复累计用量。设置中的“每批展示条数”可改为 20。

50 是上限，不是保证返回数。若上游只返回 8 条，或某些条目无效、重复，最终结果会更少。“排序与结果数量说明”可查看本次请求、上游返回、无效/重复和保留数量；应用不会伪造下一页。当前官方接口没有 offset/cursor 等分页参数，因此最多展示本次得到的 50 条，不能像通用搜索网页那样无限翻页。

默认保持 DeepSeek 返回顺序。官方描述的综合评分结合相关性、权威性和时效性，没有公开具体权重；它不代表事实准确率，也不保证与你的具体需求最直接相关。来源等级是供应商给出的 0–4 档信息，缺失或未知时不编造。可以在“列表排序”中选择综合评分、来源等级或发布时间优先；这些操作仅重排本次结果，引用编号保持不变，AI 回答仍沿用最初选取的最多 6 条来源。

希望结果更直接，可以用 `"精确短语"`、`site:example.org` 或 `-site:example.org` 限定/排除来源后重新提交。依据：[Search 接口](https://api-docs.deepseek.com/api/search/)、[查询语法与计费说明](https://api-docs.deepseek.com/guides/search/)。

## 记录和每日用量

**检索记录**只保存在当前浏览器，默认开启，最多 200 条、保留 30 天。保存检索词、时间、模式和结果数，不保存网页结果、AI 回答或 Key。设置中可以暂停新增、删除记录或清除全部。共享设备上请关闭并清除记录。

**每日用量**显示搜索请求、成功搜索、返回结果条数、AI 请求、已报告 tokens；支持最近 7 天图和每日明细，保留 90 天。结果数统计本次已获取并去重后的全部条目，不只统计第一批，展开不会重复累加。按每次请求开始时的浏览器本地日期记录，包括失败/取消的请求。取消、断流、其他设备和并发标签页会使它与供应商计费不同；不是跨设备用量或额度控制。

选择历史记录只填入搜索框，自己再次提交才重新请求。清除历史不会清除数字统计；清除全部会移除 Key、当前内容、偏好、记录和统计，但不会撤销 DeepSeek 账户上的密钥。

## 部署到 Cloudflare

需要 GitHub、Cloudflare 账号。可以从 workers.dev 地址起步，无需购买域名、服务器或数据库。默认 BYOK **不用在 Cloudflare 填写 DEEPSEEK_API_KEY**。

### 通过网页部署

先 [Fork 本仓库](https://github.com/DayuGuo/QuietSearch/fork) 到自己的 GitHub 账号，然后：

1. 在 Cloudflare 控制台进入 **Workers & Pages → Create application → Import a repository**（界面文字可能随平台更新）。
2. 授权 GitHub，选择包含本项目的仓库；应用根目录保持仓库根目录。
3. 在构建设置中填写下表。如配置 Node 版本，使用 `NODE_VERSION=24`。非敏感运行配置以仓库的 `wrangler.jsonc` 为准。
4. 完成构建，打开平台提供的地址，在网页设置添加自己的 DeepSeek Key。
5. 分别验证普通搜索和末尾问号搜索。默认部署只使用访问者提供的 Key。

| Cloudflare 构建设置 | 填写内容                               |
| ------------------- | -------------------------------------- |
| Build command       | `npm run build`（必填，不能留为 None） |
| Deploy command      | `npx wrangler deploy`                  |
| Root directory      | `/`                                    |
| Build variables     | 默认无需填写 API Key                   |

构建会生成前端资源和部署配置。如果出现 `assets ... missing ... directory`，先检查 Build command 是否为空；保存 `npm run build` 后点击 **Retry build**。只运行 `npx wrangler deploy` 无法替代 Vite 构建。

也可按 [Deploy to Cloudflare 官方说明](https://developers.cloudflare.com/workers/platform/deploy-buttons/) 从本仓库配置部署按钮。按钮不代替账号授权、充值或 Access 配置。

### 开发者命令

使用 Node 24（见 `.nvmrc`）。首次下载和启动：

```bash
git clone https://github.com/DayuGuo/QuietSearch.git
cd QuietSearch
npm ci
npm run dev
```

打开终端显示的本机地址（默认 `http://127.0.0.1:5173`）。开发模式仍是真实接口实现，不会显示假结果。自动化测试的合成结果只存在测试文件中。没有 Key 也可以检查首页、设置、空历史和用量页面。

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

端到端测试使用合成内容和无效测试 Key，拦截搜索/摘要网络请求，不访问真实付费服务：

```bash
npx playwright install chromium
npm run test:e2e
```

实际 Worker 运行时的兼容性回归测试（所有上游响应仍为合成数据，不产生 API 费用）：

```bash
npm run test:runtime
```

本地部署预检与实际部署：

```bash
npm run deploy:check
npx wrangler login
npm run deploy
```

预检只打包，不发布。`deploy` 会真正发布到你登录的 Cloudflare 账户。CI 不部署、不配置生产密钥、不执行付费 API。

## 长期私人使用，不想重复输入 Key

可启用 **Worker Secret + Cloudflare Access** 私人模式。应先按 [私人部署说明](docs/private-deployment.md) 配置允许邮箱、所有入口和后端 JWT 校验配置，再添加服务器密钥。不能只放一个 Secret 就公开使用。

网页不提供读回、修改或导出服务器 Key 的入口。BYOK 缺少用户 Key 时不会回退使用服务器 Secret。

## 常见问题

- **为什么没有 AI 回答？** 只有提交末尾是 `?` / `？`、搜索成功且存在有效摘要来源时才生成。句中问号、末尾引号或句号都不触发。
- **摘要失败但结果还在？** 可以继续查看结果；重试摘要沿用原问题和来源，不重新搜索。
- **Key 验证失败？** 到设置检查并替换。若余额不足，到官方平台处理；若限流，等待后手动重试。应用不会自动重试付费请求。
- **私人实例提示需要登录？** 通过 Cloudflare Access 重新登录。配置错误请检查 team domain、AUD、Secret；不要关闭认证来排错。
- **历史消失或不同设备不一致？** 记录仅在当前浏览器。隐私窗口、清理网站数据、浏览器存储限制和保留期限都会影响记录。
- **网址打不开？** 检查部署日志、账号权限、网络和 workers.dev 域名可达性；这与 DeepSeek 接口错误是不同问题。
- **本地运行出现日志目录权限错误？** 可以在终端临时设置 `WRANGLER_LOG_PATH` 指向有写权限的位置；不要上传含真实 Key 或查询内容的日志/HAR。

## 更新、回滚与密钥撤销

更新前保留自己的非敏感 `wrangler.jsonc` 配置，运行检查后通过已连接的仓库部署，或执行 `npm run deploy`。在 Cloudflare 的部署/版本页面选择已发布版本回滚；Secret、Access 策略等需要单独核对，代码回滚不会恢复全部配置。历史数据格式有版本号，当前没有服务器数据库迁移。

怀疑密钥泄露时，到 DeepSeek 平台撤销旧 Key，再添加新 Key。仅清除网页输入或从源码删除字符串并不能撤销凭证。不要在 Issue、截图、Git 历史或公开聊天中粘贴真实密钥。

## 开发与验证

主要模块：`src/` 界面与流程；`worker/` 固定上游、鉴权和校验；`shared/` 类型、解析与 SSE；`tests/` 单元/Worker 和 mock 浏览器测试。没有数据库、Agent、搜索缓存或多供应商插件系统。

- [验证记录](docs/verification.md)
- [API 契约](docs/api-contract.md)
- [隐私说明](docs/privacy.md)
- [实施决策及与旧设计的差异](docs/product-decisions.md)
- [设计依据](DESIGN.md)
- [安全问题](SECURITY.md)

真实 API 和线上部署的状态以验证记录为准，mock 通过不代表真实账号联通。许可证为 MIT，图标及依赖许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。独立项目，非 Kagi 或 DeepSeek 官方产品。
