# API 契约核对

核对日期：2026-10-22。官方文档支持本实现；没有使用真实凭证验证账号权限或费用。

| 用途      | 固定地址                                       | 实施约束                                                                                  |
| --------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 搜索      | POST https://api.deepseek.com/v1/tools/search  | query 1–128 Unicode code points；网页请求 count=50，API 兼容 10/20/50；need_content=false |
| Kagi 搜索 | POST https://kagi.com/api/v1/search            | Bearer Key；query、workflow=search、limit=10/20/50；不请求 extract、下一页或自动重试      |
| 摘要      | POST https://api.deepseek.com/chat/completions | deepseek-flash 默认；stream=true；reasoning_effort=none；max_tokens=800                   |
| 连接      | GET https://api.deepseek.com/models            | 仅验证此次请求成功，不代表搜索权限或余额验证                                              |

DeepSeek 地址集中在 worker/deepseek.ts，Kagi 地址在 worker/kagi.ts。仅发送必要鉴权与内容头；Worker 使用 redirect=manual，并将所有非成功状态（包括重定向）作为错误返回，不跟随凭证重定向。workerd 不支持 redirect=error；浏览器端请求仍可使用该选项。浏览器不直接访问服务商，不把访客 Cookie、IP 或 UA 加入 localization 或模型内容。

搜索读取 results，规范化 title、url、site_name、snippet、summary、date。校验 rerank_score（0–3 的有限数字）和 authority（0–4 整数，-1 为未知）；无效/缺失值归为 null，不表示准确率。忽略 site_icon/content。清理危险 URL、账号密码 URL 和重复 URL 后按顺序编号。未知日期不编造。summary 缺失时使用 snippet；缺少两者不送摘要。

网页每次只搜索一次，请求 50 条，在本地按 10/20 条分批展示。返回 requestedCount、receivedCount、discardedCount（已检查的前 50 条中无效或重复的数量）；实际返回可能少于请求。DeepSeek 没有分页参数；Kagi 支持 page=1–10，本次只接入单批搜索，不请求额外页。不会通过重复请求假装下一页。本地排序只重排原快照，默认供应商顺序，另支持综合评分、来源等级、日期优先，未知值靠后，同值按原编号稳定排序。引用 ID 不变，不重新搜索或摘要。

Chat 仅发送固定 system prompt 和 JSON 编码的 query/sources；没有 tools、自定义 messages 或客户端模型控制。只消费 delta.content，忽略 reasoning_content。处理 UTF-8、跨 chunk 行、CRLF、心跳、[DONE] 和最终内容 chunk 中的 usage；无正确终止视为断流。输出限制触发时显示错误；finish_reason=length 显示长度提示。

Kagi v1 读取 data.search，规范化 url、title、snippet 和 time；不展示 news、related_search、direct_answer 等其他类别。snippet 用作摘要来源。没有 search 字段的有效 data 对象视为空结果；错误/非对象数据拒绝。没有公开的兼容评分字段，因此评分/等级为 null。只处理前 50 条，使用与 DeepSeek 相同的 URL、长度和稳定编号约束。Kagi 403 显示权限/IP 限制提示，429 显示频率或用量限制提示，不返回上游错误原文。Kagi 不提供无搜索验证入口，设置页只保存，不发起测试搜索。

应用 API：

- GET /api/config → keyMode、maxQueryLength、searchProviders、summaryAvailable，不含 Secret。
- POST /api/check-key，{} → ok。只验证 DeepSeek models，不接受 provider。BYOK Key 只在 Authorization。
- POST /api/search，{rawQuery,count,provider?} → provider、submittedQuery、query、mode、results、requestId、requestedCount、receivedCount、discardedCount。
- POST /api/summary，{rawQuery,results:[{id,title,url,summary}]} → SSE delta / done / error。重新验证问号、字段、URL、编号和来源上限。不会再次搜索。

provider 只允许 deepseek/kagi，省略时兼容原 DeepSeek 客户端；未知值在鉴权/付费请求前拒绝。搜索与摘要分开传各自 Key，摘要接口不接受引擎字段，始终使用 DeepSeek。server 模式按引擎选相应 Secret，缺失时不回退另一服务商。

POST 必须为同源 application/json。Origin 是来源检查，不是身份验证。BYOK 不回退站长 Key；server 路由验证 Access JWT。失败统一固定错误码和随机 requestId，不返回上游原文。

集中上限：Search body 2 KiB，summary body 64 KiB，上游响应 1 MiB，来源 6 条、每条摘要 1200 Unicode 字符、标题 300、URL 2048 字符；读取请求体 10 秒，Search/连接 20 秒，摘要 60 秒，答案 800 tokens 和 12000 字符。读取请求流时计字节，不依赖 Content-Length。限流每来源每路由每 Cloudflare 位置约 30 次/分钟，不是硬预算。

官方依据：

- [Kagi v1 OpenAPI](https://kagi.com/api/docs/_spec/openapi.yaml?download)
- [Kagi API 平台](https://help.kagi.com/kagi/api/overview.html)
- [Search](https://api-docs.deepseek.com/api/search/)
- [Search & Fetch](https://api-docs.deepseek.com/guides/search/)
- [Chat](https://api-docs.deepseek.com/api/create-chat-completion/)
- [Models](https://api-docs.deepseek.com/api/list-models/)
- [Cloudflare React/Vite](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
- [Static Assets 与 Access 限制](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [JWT 验证](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [限流](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

与设计包差异：增加本地历史和用量；Node 24；已安装运行时的兼容日期 2026-10-19。依赖实际版本由 package-lock.json 锁定。
