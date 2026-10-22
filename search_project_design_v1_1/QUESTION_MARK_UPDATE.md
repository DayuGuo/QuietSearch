# v1.1：只有末尾问号才调用 AI

日期：2026-10-22。
状态：产品设计及 Codex 增量实现说明；不是已上线功能。
命名：最终名称待用户确认。推荐候选 WenSeek（问寻）；原文件中的 QuietSearch 仅作为工作名，不自动改名。

## 核心行为

**默认网页搜索。只有主动提交的有效输入在去除尾部空白后，以英文 `?` 或中文 `？` 结尾，才进行“网页搜索 + 基于来源的 AI 回答”。**

这是 AI 调用的唯一产品触发方式，取代 v1.0 的“AI 默认开启、用户手动关闭”。普通搜索不能后台调用模型再隐藏结果，也不能调用模型进行意图识别、关键词改写、重排或预生成。不得添加另一种绕过问号条件的 AI 开关/按钮。

只输入或删除问号不执行任何付费请求；必须按回车或点击搜索。普通模式隐藏 AI 容器，不保留加载占位。问号模式先显示结果，再生成回答；无有效来源、搜索失败、输入无效均不调用模型。

## 输入解析与保留

前后端共用一个纯函数（推荐 `shared/query-intent.ts`），而非各写一套判断。

- `submittedQuery`：提交时的输入快照，去除两端空白，保留末尾问号；前端继续显示它，后端用于检查触发条件。
- `query`：只有进入问答模式时，移除末尾连续的英文/中文问号，再去除尾部空白；发送给 Search 的检索词。句中问号、URL 中的查询符号保持原样。
- `mode`：`search` 或 `answer`，只能从输入推导，不能由任意布尔值覆盖。

只有空白/问号（包括中英文混合、问号间夹空格）的输入全部拒绝。检索词上限使用经官方核对的共享配置，按 Unicode code point 计数；原始 HTTP 请求另外限制字节数。不得通过移除无穷多个尾随问号绕过请求体限制。

以下是便于审查的 JavaScript 参考逻辑；实际项目请用 TypeScript 判别联合类型，并接入已有错误模型。它不替代鉴权、原始请求体大小校验或 URL 校验。`maxQueryCodePoints` 从共享配置传入，不在组件中硬编码。

```javascript
function parseSearchInput(rawInput, maxQueryCodePoints) {
  if (!Number.isInteger(maxQueryCodePoints) || maxQueryCodePoints < 1) {
    throw new RangeError("Invalid query-length configuration");
  }
  if (typeof rawInput !== "string") {
    return { ok: false, code: "INVALID_INPUT" };
  }

  const submittedQuery = rawInput.trim();
  const wantsAnswer = /[?？]$/u.test(submittedQuery);
  const query = wantsAnswer
    ? submittedQuery.replace(/[?？]+$/u, "").trimEnd()
    : submittedQuery;

  if (!/[^\s?？]/u.test(query)) {
    return { ok: false, code: "EMPTY_QUERY" };
  }
  if (Array.from(query).length > maxQueryCodePoints) {
    return { ok: false, code: "QUERY_TOO_LONG" };
  }
  return {
    ok: true,
    submittedQuery,
    query,
    mode: wantsAnswer ? "answer" : "search",
  };
}
```

严格检查最后非空白字符：`问题？。`、`"问题？"` 均不触发；`https://example.org/?q=test` 不触发，但真的以裸问号结尾的 URL 仍按统一规则触发。不引入难以解释的语义例外。仅在末尾添加一组问号是推荐用法；不要删除正文里的问号。

## 请求与状态流程

`POST /api/search` 接收 `{rawQuery, count}`。后端校验并解析，Search 使用规范化 `query`，返回 `{submittedQuery, query, mode, results, requestId}`。

前端仅在本次提交为 `answer`、搜索成功且有有效来源时，自动请求一次 `/api/summary`。本次 Search 与本次 Chat 分别最多执行一次；双击、React StrictMode、重新挂载不得额外触发。

`POST /api/summary` 接收 `{rawQuery, results}`：rawQuery 必须是原始提交快照，保留触发问号。后端重新解析并拒绝 mode=search 的请求（建议 HTTP 400，错误码 `AI_NOT_REQUESTED`），不信任客户端传入的 `ai=true` 或 `mode=answer`。输入无效或 sources 为空也不调用模型。

问号仅是产品交互规则，不是身份认证。调用者完全可以自己填写问号；原有 BYOK/Access 验证、固定上游、请求与输出上限、限流继续生效。此版不增加数据库或搜索会话签名系统。

摘要基于本次已返回的来源，回答问题而非机械逐条复述结果。保留真实编号引用、证据不足提示、不阅读全文声明。不能让模型补造搜索来源。

输入框正在编辑的内容只用于本地模式预览；已显示的结果和摘要绑定最近一次提交快照。重试绑定原提交快照和相同来源，不使用正在编辑的新文本、不重新搜索。用户重新提交时取消旧任务并清除旧摘要，通过 generation ID 防止迟到结果写入新页面。取消不保证上游已执行的部分免费。

## 界面与 README

搜索框提示：**搜索网页；末尾加 ? 或 ？ 获取 AI 回答。**

普通输入的本地预览为“仅搜索”；末尾问号预览为“搜索 + AI 回答”，旁边说明“将额外使用模型 tokens”。这只是提示，不是额外开关；不能只靠颜色区分。

首页、结果页和设置里移除旧 AI toggle。设置保留只读触发说明，不存 AI 常开偏好；已有版本的旧偏好读取要删除，仅清理本应用的已知旧键，不清空无关存储。旧 `aiSummary=true` 不能恢复自动摘要。

README 用一对例子说明：`肝纤维化 超声` 只搜索；`肝纤维化有哪些超声表现？` 搜索并回答。写清空结果不回答、摘要失败保留搜索结果、只有问号模式能重试摘要、普通搜索仍可能有搜索 API 费用。

## 最低验收矩阵

下表的 Chat 次数假设密钥/认证有效，输入有效，搜索成功且有有效来源；“0 次请求”包括前端不发应用请求、后端收到无效输入也不发上游请求。

| 输入或操作 | 预期 |
|---|---|
| `肝纤维化 超声` | Search 1、Chat 0 |
| `为什么天空是蓝色的` | Search 1、Chat 0，不猜语义 |
| `肝纤维化有哪些超声表现？` | Search 1、Chat 1 |
| `What is fibrosis?` | Search 1、Chat 1 |
| `问题？   ` / `问题?\n` / 末尾全角空格 | 去空白后识别，Search 1、Chat 1 |
| `问题??` / `问题？？` / `问题?？` | 一次触发，不重复生成 |
| `甲？乙` / `https://example.org/?q=test` | Search 1、Chat 0 |
| `问题？。` / `"问题？"` | 最后字符不是问号，Chat 0 |
| 空白 / `?` / `？？` / `? ？` | 0 次请求，提示有效关键词 |
| 超长 query / 超大原始 body | 拒绝；0 次上游请求 |
| 正在输入末尾问号，但没有提交 | 0 次 Search/Chat |
| 问号查询无结果/搜索失败 | Chat 0 |
| 摘要失败后手动重试 | 仅一次新的 Chat，Search 不增加 |
| 问号查询后立即提交普通查询 | 取消旧任务，普通结果不出现旧 AI 回答 |
| 普通查询但 localStorage 留有旧 ai=true | Chat 0 |
| 直接调用 /api/summary，rawQuery 无末尾问号 | 400，Chat 0，即使伪造 ai=true |
| 无效/缺失 Access 身份、缺失 Key | 继续按原安全规则拒绝，不调用付费服务 |

至少添加解析单元测试、Worker 级上游 fetch spy 测试和 mock E2E 请求计数测试。不能只测摘要面板“看不见”；要验证普通查询根本没有模型调用。

## 交给已有 Codex 项目的增量提示

```text
请更新当前搜索项目，不从零重建，不覆盖已有用户改动。先读取 AGENTS.md、PROJECT_SPEC.md、QUESTION_MARK_UPDATE.md，并检查 git diff。

AI 总结/回答改为唯一触发规则：用户主动提交的有效输入，在去除尾部空白后以英文 ? 或中文 ？ 结尾，才先搜索再基于结果回答。没有末尾问号只搜索，不能调用任何模型，不能后台生成后隐藏，也不能用模型猜意图或改写搜索词。

移除旧 AI toggle 和 AI 常开偏好。前后端共享确定性解析函数：保留原提交文本；只移除末尾连续问号作为上游检索词；保留句中问号与 URL 参数；拒绝空白/纯问号。只有显式提交执行请求，输入变化只做本地模式预览。

/api/summary 必须重新验证原提交文本的末尾问号，不能信任 ai=true。搜索失败或无有效来源不调用模型。一次有效提交最多一次搜索和一次自动摘要；新提交取消并隔离旧任务，摘要重试不重新搜索，重试绑定原提交和原来源。

同步界面提示、README、测试与 verification.md；保持原有 BYOK、Access、密钥不持久化、固定上游和限流边界。不擅自改项目名称，WenSeek（问寻）只是候选。

实际运行类型检查、lint、单元测试、Worker 测试、mock E2E 和构建，明确报告没能执行的项目。特别证明无问号输入的模型调用数为零。不要把 mock 或参考函数测试当成真实 API/云部署已验证。
```
