# 安全问题

不要在公开 Issue、PR、截图或 HAR 中包含真实 API Key、JWT、Cookie、查询或用户记录。需要复现时，使用无效测试 Key 和合成内容，提供固定错误码、操作步骤、版本与脱敏环境说明。

开源仓库为 [DayuGuo/QuietSearch](https://github.com/DayuGuo/QuietSearch)。涉及可利用漏洞时，请通过仓库 Security 页的私密漏洞报告功能联系维护者；若该入口暂不可用，请先私下联系实例维护者，不要在公开 Issue 中披露利用细节或凭证。

密钥疑似泄露时先到 DeepSeek 平台撤销旧 Key。清除输入框或删除源码中的字符串不会撤销凭证。

边界：BYOK Key 会经实例后端转发；历史是当前浏览器的未加密本地数据；模型只依据摘要，引用不等于事实核查。私人 Secret 模式依赖正确的 Access 策略及 JWT 校验。限流不是预算上限。
