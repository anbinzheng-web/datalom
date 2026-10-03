# 用户账号存储

个人账号使用统一 PostgreSQL 数据库，与采集平台 `platform_accounts` 独立。当前仅完成表结构和旧存储适配，尚未实现开放注册、邮件验证、密码找回、用户 API Key 签发及鉴权。第三方身份表预留 Google / GitHub 等提供方关联，已有第三方代码不代表完成配置或上线验收。

## 数据关系

`users` 保存个人资料、角色、禁用状态及邮箱验证时间；邮箱写入前去除首尾空白并转小写，唯一约束避免重复。数据库额外检查 `lower(btrim(email))` 一致性，完整 Unicode 规范化仍由写入方负责。`emailVerifiedAt` 为空表示没有已验证记录。

用户关联三张子表，外键均启用级联删除：

- `user_identities`：以区分大小写的 `(provider, subject)` 标识第三方身份，不存第三方访问令牌。一个用户可以关联多个身份。
- `user_email_tokens`：预留 `verify_email`、`reset_password` 两种用途，记录目标邮箱、唯一令牌摘要、期限与消费时间。后续服务需原子消费令牌并核验邮箱与用途。
- `user_api_keys`：预留用户多个 Key，保存唯一摘要、名称、展示前缀与末四位，以及期限、撤销和最近使用时间。未来签发时只返回一次原始 Key；当前公开 API 仍使用环境变量 Key。

时间统一为 UTC 毫秒整数；可选时间为 NULL。除第三方身份的组合主键外，新增记录使用 UUID。摘要字段的唯一约束不会代替签发服务的安全生成和哈希处理。

## 表结构管理

Prisma 模型 位于 `packages/shared/prisma`，使用 `pnpm db:push` 部署，不在应用启动时动态建表。管理员初始化与登录行为保持兼容，邮箱白名单仍服务于旧第三方逻辑；未来开放注册不使用白名单准入。

团队、套餐计费、多邮箱、手机号、权限组及 Key 权限范围尚未设计。接口定义继续由 server 拥有；本次没有新增公开 API。

## 密码与登录凭证

`users.passwordHash` 保存可空的带盐 scrypt 摘要；无密码的第三方用户为 NULL。结构升级原样搬运已有摘要，不重新计算密码。认证体系保留 users、user_identities、user_email_tokens、user_api_keys 四张表；钱包与账务模型见 [钱包与调用费用](wallet-billing.md)；email_whitelist 独立保留供旧准入逻辑使用。

登录签发 HS256 JWT，包含 sub、authVersion、iat、exp、jti，并限定 issuer、audience 和算法。签名密钥从 Vault 主密钥按独立用途派生，重启保持有效；不把密码或个人资料放入 JWT。有效期为 14 天，无刷新令牌，到期重新登录。接口仍返回 sessionId，但其值现在是 JWT。

每次认证读取用户，检查禁用状态与 authVersion，角色以数据库当前值为准。普通退出清除当前浏览器 Cookie，已复制的 JWT 在过期前仍可用。内部 revokeUserTokens 方法递增 authVersion，可撤销全部登录；尚无退出全部设备公开接口。未来修改密码或找回密码流程必须在同一事务中更新密码并递增 authVersion。暂不支持按设备撤销。


存储加密已取消：账号 payload、代理密码及本地诊断记录使用明文 JSON/文本；历史密文仅保留兼容解码，不再产生新密文。用户登录密码继续使用随机 16 字节盐的 scrypt（32 字节派生值），JWT 签名和验证令牌/API Key 摘要保持不变。签名密钥仍保存在系统凭据库。本地历史诊断兼容读取不等于已全部转写。
