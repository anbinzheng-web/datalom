# Facebook 协议经验

历史研究来自 2026-09 的 Comet GraphQL 样本。当前实现见 `../src/native.ts` 及 `../src/api/`，研究和独立验证入口见 `tools/`。doc ID 与部署版本会变化，不在文档维护静态接口清单。

- `/api/graphql/` 使用表单、fb_dtsg、lsd、doc ID 和嵌套 variables。替换业务参数时保留原样本的对象、地域和分类上下文。
- 响应可能是换行分隔的增量 JSON。先合并 Relay `$stream$` 数组追加和 `$defer$` 补丁，再验证；拒绝数组空洞、缺失路径、业务错误及不完整分页。
- 游标和 section token 绑定对象，主页、评论和 Marketplace 不可互换。验证回复时核对父节点，分页时核对唯一节点及真实推进。
- Marketplace 搜索和推荐返回不同节点分支，不能复用未经验证的解析。一次搜索错误 `1357038` 后恢复的根因未确认，不能把重开窗口当作通用修复。
- HTTP 200 中仍可能有 `field_exception`；不能将部分数据标为完整成功。输出投影公开业务字段，剔除 viewer、订单和消息状态。

历史独立验证涉及 Reel、评论/回复、主页信息/照片及部分 Marketplace 查询；不外推为地域、排序、分类、卖家后续分页全部可用。`verify-browserless.ts` 会关闭并恢复 Profile，须按授权执行；独立请求通过只证明当次会话与线路成立。
