# API 契约核对

核对日期：2026-10-22。官方文档支持本实现；没有使用真实凭证验证账号权限或费用。

| 用途 | 固定地址                                       | 实施约束                                                                                  |
| ---- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 搜索 | POST https://api.deepseek.com/v1/tools/search  | query 1–128 Unicode code points；网页请求 count=50，API 兼容 10/20/50；need_content=false |
| 摘要 | POST https://api.deepseek.com/chat/completions | deepseek-flash 默认；stream=true；reasoning_effort=none；max_tokens=800                   |
| 连接 | GET https://api.deepseek.com/models            | 仅验证此次请求成功，不代表搜索权限或余额验证                                              |

三个地址集中在 worker/deepseek.ts。仅发送必要鉴权与内容头；Worker 使用 redirect=manual，并将所有非成功状态（包括重定向）作为错误返回，不跟随凭证重定向。workerd 不支持 redirect=error；浏览器端请求仍可使用该选项。浏览器不直接访问 DeepSeek，不把访客 Cookie、IP 或 UA 加入 localization 或模型内容。

搜索读取 results，规范化 title、url、site_name、snippet、summary、date。校验 rerank_score（0–3 的有限数字）和 authority（0–4 整数，-1 为未知）；无效/缺失值归为 null，不表示准确率。忽略 site_icon/content。清理危险 URL、账号密码 URL 和重复 URL 后按顺序编号。未知日期不编造。summary 缺失时使用 snippet；缺少两者不送摘要。

网页每次只搜索一次，请求 50 条，在本地按 10/20 条分批展示。返回 requestedCount、receivedCount、discardedCount（已检查的前 50 条中无效或重复的数量）；实际返回可能少于请求。没有分页参数，不通过重复请求假装下一页。本地排序只重排原快照，默认供应商顺序，另支持综合评分、来源等级、日期优先，未知值靠后，同值按原编号稳定排序。引用 ID 不变，不重新搜索或摘要。

Chat 仅发送固定 system prompt 和 JSON 编码的 query/sources；没有 tools、自定义 messages 或客户端模型控制。只消费 delta.content，忽略 reasoning_content。处理 UTF-8、跨 chunk 行、CRLF、心跳、[DONE] 和最终内容 chunk 中的 usage；无正确终止视为断流。输出限制触发时显示错误；finish_reason=length 显示长度提示。

应用 API：

- GET /api/config → keyMode、maxQueryLength，不含 Secret。
- POST /api/check-key，{} → ok。BYOK Key 只在 Authorization。
- POST /api/search，{rawQuery,count} → submittedQuery、query、mode、results、requestId、requestedCount、receivedCount、discardedCount。
- POST /api/summary，{rawQuery,results:[{id,title,url,summary}]} → SSE delta / done / error。重新验证问号、字段、URL、编号和来源上限。不会再次搜索。

POST 必须为同源 application/json。Origin 是来源检查，不是身份验证。BYOK 不回退站长 Key；server 路由验证 Access JWT。失败统一固定错误码和随机 requestId，不返回上游原文。

集中上限：Search body 2 KiB，summary body 64 KiB，上游响应 1 MiB，来源 6 条、每条摘要 1200 Unicode 字符、标题 300、URL 2048 字符；读取请求体 10 秒，Search/连接 20 秒，摘要 60 秒，答案 800 tokens 和 12000 字符。读取请求流时计字节，不依赖 Content-Length。限流每来源每路由每 Cloudflare 位置约 30 次/分钟，不是硬预算。

官方依据：

- [Search](https://api-docs.deepseek.com/api/search/)
- [Search & Fetch](https://api-docs.deepseek.com/guides/search/)
- [Chat](https://api-docs.deepseek.com/api/create-chat-completion/)
- [Models](https://api-docs.deepseek.com/api/list-models/)
- [Cloudflare React/Vite](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
- [Static Assets 与 Access 限制](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [JWT 验证](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [限流](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

与设计包差异：增加本地历史和用量；Node 24；已安装运行时的兼容日期 2026-10-19。依赖实际版本由 package-lock.json 锁定。
