# 第三方与研究来源

## 运行依赖

依赖版本由 `pnpm-lock.yaml` 固定。RoxyBrowser OpenAPI 3.2.0、Playwright 用于研究与提取；impit 0.14.5 用于生产请求。GOST 安装器固定 v3.3.0，下载官方 release 并校验 checksums.txt 中的 SHA-256。

- [impit](https://github.com/apify/impit)：Rust 原生 HTTP 请求模块。实测固定 chrome151 preset。
- [GOST](https://github.com/go-gost/gost)：MIT，官方双跳链配置。
- [RoxyBrowser OpenAPI](https://roxybrowser.cn/docs/api-documentation/api-endpoint.html)：Profile、代理、连接信息。

## 签名研究

生产实现位于 `packages/platform-tiktok/src/signature-codec.ts` 和 `signer.ts`，通过真实页面签名解码、字节往返、输入摘要匹配和独立请求验证。使用的公开算法说明包括：

- [carcabot/tiktok-xgnarly-decoded](https://github.com/carcabot/tiktok-xgnarly-decoded)，commit `95dd1aceaa429b6163d8f3e8c56cbe4cab8df00e`，MIT。用于核对自定义 ChaCha 轮次、TLV 和内嵌密钥规则。
- [DudeGeorgesTG/tiktok-web-signer](https://github.com/DudeGeorgesTG/tiktok-web-signer)，README 声明 MIT。用于研究 X-Dynosaur 字段编码及 hash。没有把其 Python 文件作为生产依赖；Datalom 以实际采集的 5.3.2 结构验证，不采用仓库 5.3.0 的固定环境值。
- [justbeluga/tiktok-web-reverse-engineering](https://github.com/justbeluga/tiktok-web-reverse-engineering)，commit `cdf104fd011bc0d07ef22c954eae949014c349b8`，MIT Copyright (c) 2025 Pandora。其 xgnarly.mjs 原样保留在 `packages/platform-tiktok/src/vendor/tiktok-signatures`，仅作独立实现的解码交叉测试，附原 LICENSE。生产代码不引用该旧版编码器。

公开仓库的功能声明不算实测证据。项目只对 `docs/validation.md` 明确记录的接口、版本与场景报告成功。

## X transaction ID

- [Lqm1/x-client-transaction-id](https://github.com/Lqm1/x-client-transaction-id)，npm `0.3.1`，MIT Copyright (c) 2025 Lami。`packages/platform-x/src/transaction.ts` 改写其独立动画插值与 transaction ID 算法；许可证保留于 `packages/platform-x/src/vendor/LICENSE-x-client-transaction-id`。没有引用其默认直连下载器或访客授权工具。
- `linkedom` 0.18.12：仅离线解析页面 HTML/SVG，下载脚本不执行。
- X 的运行时主脚本/ondemand 素材来自同账号代理线路，原文与 hash 存于加密诊断证据。独立请求结果与当前阻塞见 `docs/x-native-interface-map.md`。

## 豆包 Node 签名运行时

- 官方公开脚本：`https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/doubao/chat/static/js/async/bdms-sdk.f36aabd9.js`。SHA-256：`ceac08af90a0ad7690473b42c421433756f112bfb8a28f611718e0c32446387c`。首次下载后加密缓存于本机，不把官方混淆源码作为项目源码分发。
- `signer.ts` 在 Node `vm` 内执行该固定版本；`linkedom` 提供 DOM 兼容对象，并截获 SDK 的网络和计时器。它不同于 X 的只解析 HTML 用法。项目未宣称拥有该官方脚本版权或已经逐行重写其算法。
- HTTP 由 Node 内置 `fetch` 发出。Node 运行、新鲜签名、新建对话与续聊已实测，初始身份来源和冷启动限制见 `doubao-node.md`。
