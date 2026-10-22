# 私人服务端模式

默认 BYOK 不需要本文件。只有你希望长期私人使用、避免每次输入 Key 时才启用 server 模式。

## 1. 先建立 Access 保护

在 Cloudflare Zero Trust 的 Access Applications 中建立保护应用，允许指定邮箱/身份登录；不要使用 Everyone 或 Bypass。覆盖正式域名、workers.dev 和所有预览入口。对于无法可靠保护的额外入口，应在平台禁用，而不是留一个公开备用地址。

workers.dev 的 Access 管理可按 [Workers Access 说明](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) 设置；自定义域名按 Access 自托管应用流程配置。界面名称可能变化，以官方平台实际显示为准。部署按钮不会代替这些步骤。

从 Access 应用复制 **Application Audience (AUD)**；从团队设置取得类似 `your-team.cloudflareaccess.com` 的 team domain。不要把登录 Cookie、JWT 或 Cloudflare 管理 API Token 填到这些位置。

## 2. 将非敏感配置放入仓库

修改 wrangler.jsonc 的 vars，保留已有其他配置：

```json
{
  "KEY_MODE": "server",
  "SUMMARY_MODEL": "deepseek-flash",
  "CF_ACCESS_TEAM_DOMAIN": "your-team.cloudflareaccess.com",
  "CF_ACCESS_AUD": "从你的 Access 应用复制的 AUD"
}
```

上面是占位示例，不能直接作为有效身份配置。非敏感配置以仓库为唯一来源；控制台修改可能被后续源码部署覆盖。`SUMMARY_MODEL` 不会自动切换到更贵的模型。

## 3. 添加运行时 Secret

在 Cloudflare Worker Settings → Variables and Secrets 中添加类型为 **Secret** 的 `DEEPSEEK_API_KEY`，或在自己的终端使用交互式命令：

```bash
npx wrangler secret put DEEPSEEK_API_KEY
npm run deploy
```

按提示粘贴 Key，不把值放在 shell 参数、源文件、GitHub、wrangler vars、VITE_*、构建变量或 URL 中。首次建立 Worker 可能需要先部署没有 Secret 的版本；此时 server API 会拒绝服务，直到 Secret 生效。运行时 Secret 与构建环境变量不同。

## 4. 验收全部入口

- 新的未登录窗口访问每个入口，确认 Access 拦截。已禁用的入口应不可访问。
- 已登录后完成一次经你授权的搜索和问号回答。
- 直接请求付费 API，没有 JWT、伪造 JWT、过期、错误 issuer/audience/签名都不能触发付费上游。看到登录页不能代替后端验证。
- 浏览器配置接口、JS 包、页面、响应均不能读回 Secret；设置中仅显示“由部署者配置”。
- server 模式忽略客户端 DeepSeek Key，且配置/认证缺失一律失败关闭。

Static Assets 的内部路由不保证 ctx.access 可用。实现使用 jose 校验 `Cf-Access-Jwt-Assertion` 的签名、issuer、audience、exp 和 subject；JWKS 地址来自受信任 team domain。没有生产跳过身份验证的开关。

## 轮换和回滚

在 DeepSeek 平台撤销旧 Key，用新 Key 更新同名运行时 Secret，并确认部署生效。撤销 Access 用户权限在身份提供商/Access 中操作。回滚源码后仍需检查 Secret 与 Access 策略；它们不是 Git 提交的一部分。

自动化测试使用测试签名和合成凭证。真实 Access/账号联通仍需在你的部署环境验证，见 verification.md。
