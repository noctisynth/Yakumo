# 版本管理与自动化验证

文档编号：CHECK-002。状态：Local verification complete。更新：2026-10-14。
对应规范：SPEC-003。真实远端运行结果另行核对，不以本地语法检查替代托管环境构建。

## 本地结果

- Semifold 0.3.4 官方 init 成功；config sync 检查未发现工作区漂移。
- 首个 changeset 记录应用初始化和发布自动化；status 计划 yakumo 从 0.1.0 进入 0.1.0-alpha.0。
- version dry-run 成功，所有 post-version 命令均未启用预演执行。
- 在隔离副本中实际执行 version，完成共享版本修改、前端同步、Cargo 锁文件更新、Bun 锁文件检查和 changeset 消费。
- 隔离副本的冻结依赖安装通过，原工作区版本仍为 0.1.0，changeset 保留待 release PR 消费。
- 三项 Bun 测试及十二个断言通过，覆盖版本来源、同步幂等性、过期锁文件、Tauri 版本引用及发布前置条件。
- 四个平台的合成附件夹具成功生成九个输出文件，覆盖平台命名、扩展名选择和 SHA-256 文件；这不是实际安装包验证。
- actionlint 1.7.12 工作流语法检查通过，校验工具归档的 SHA-256 与上游清单一致。
- 前端格式、类型和生产构建，以及 stable Rust workspace 格式、Clippy 和测试入口通过。

## 发布边界

版本计划和 changeset 不代表已经发布软件。主工作区本次不执行实际 version 或 publish。
桌面安装包只在准备好的版本合入 main、没有待处理 changeset 且不存在对应 Release 时构建。
四个平台的附件全部成功后才进入 Semifold 发布，registry 命令和凭据均未配置。
首次推送会运行质量检查并准备 release PR，不自动合并发布 PR。
私有会话、原始抓包、临时副本、测试附件、依赖和编译产物不进入公开提交。
