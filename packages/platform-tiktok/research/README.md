# TikTok 协议经验

历史研究基线为 2026-09，签名布局曾验证 `5.3.2 / webmssdk 2.0.0.561`；不代表后续版本兼容。实现入口在 `../src/signature-codec.ts`、`../src/signer.ts`、`../src/native.ts`，研究工具在 `tools/`。

- X-Dynosaur 对未加入 msToken/签名的原始 query 摘要；X-Gnarly 对加入 X-Dynosaur 与 msToken 后的 query 摘要。签名后不能再次规范化 URLSearchParams。
- 字段 8 曾观测为稳定环境值，不能擅自替换成当前时间；字段 53 保留二进制，不做有损转码。每次请求生成新时间、随机数与计数，不重放旧签名。
- 先验证捕获请求的摘要与签名布局，再实现生成；不认识的版本返回研究错误。其他开源实现可交叉参考，不能代替原站样本。
- 搜索续页可能依赖 offset、cursor、search_id；双游标、section 和动作上下文必须成对捕获，不猜测。去重不能掩盖游标停滞。
- 直播推荐曾在 HTTP 200/业务码成功时缺少 `has_more`；缺失保留未知，不造一个终止状态。私密列表与无权限不算空成功。
- TikHub 等第三方目录数量不等于原站已实现接口数；Web、App、Shop、Ads 和 Creator 后台需分别取证。

`native-run.ts` 用成功捕获证据执行受限操作；`native-regression.ts` 接收本机回归清单；`native-inventory.ts` 汇总本机结果。新增能力先对照真实页面，再验证关闭浏览器后的独立请求和分页。历史视频/评论成功不能外推到搜索连续分页或全平台能力。

## 来源与许可证

生产实现位于 `packages/platform-tiktok/src/signature-codec.ts` 和 `signer.ts`，通过真实页面签名解码、字节往返、输入摘要匹配和独立请求验证。使用的公开算法说明包括：

- [carcabot/tiktok-xgnarly-decoded](https://github.com/carcabot/tiktok-xgnarly-decoded)，commit `95dd1aceaa429b6163d8f3e8c56cbe4cab8df00e`，MIT。用于核对自定义 ChaCha 轮次、TLV 和内嵌密钥规则。
- [DudeGeorgesTG/tiktok-web-signer](https://github.com/DudeGeorgesTG/tiktok-web-signer)，README 声明 MIT。用于研究 X-Dynosaur 字段编码及 hash。没有把其 Python 文件作为生产依赖；Datalom 以实际采集的 5.3.2 结构验证，不采用仓库 5.3.0 的固定环境值。
- [justbeluga/tiktok-web-reverse-engineering](https://github.com/justbeluga/tiktok-web-reverse-engineering)，commit `cdf104fd011bc0d07ef22c954eae949014c349b8`，MIT Copyright (c) 2025 Pandora。其 xgnarly.mjs 原样保留在 `packages/platform-tiktok/src/vendor/tiktok-signatures`，仅作独立实现的解码交叉测试，附原 LICENSE。生产代码不引用该旧版编码器。
