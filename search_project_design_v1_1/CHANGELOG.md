# 设计包变更记录

## v1.1 · 2026-10-22

本包是设计与实施引导，不包含已经完成的搜索网站。

已同步修改 PROJECT_SPEC.md、CODEX_PROMPTS.md、AGENTS.md、README_TEMPLATE.md；新增 QUESTION_MARK_UPDATE.md、NAMING.md。

核心变更：取消“AI 默认开启 + 独立开关”。现在只有主动提交的内容在去除尾部空白后以 ? 或 ？ 结尾，才进入搜索加 AI 回答模式；普通搜索不调用模型。

补充原始提交文本与规范化检索词的区分、前后端共享解析、后端独立校验、无效输入、连续问号、输入不即请求、新旧请求隔离、旧偏好迁移和请求计数测试。

名称未确认，文件保留 QuietSearch 旧工作名；推荐候选 WenSeek（问寻），没有改动任何外部仓库或部署。

原 v1.0 文件没有被覆盖。本次未重新核对 DeepSeek/Cloudflare API 契约；保留原文档依据，要求 Codex 实施时重新核验。没有使用真实密钥，没有发付费请求，没有云端部署。

QUESTION_MARK_UPDATE.md 中参考解析函数的本地测试结果见 DESIGN_CHECKS.md。这不等于整个应用、真实 API 或云端部署已验证。
