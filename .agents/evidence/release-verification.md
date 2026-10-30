# 版本管理与自动化验证

文档编号：CHECK-002。状态：Local verification complete。更新：2026-10-15。
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
- 首次托管检查发现 Semifold 0.3.4 的 status 会把非 PR 事件也解析为 PR；通用检查只对 status 子进程移除该事件环境提示，PR 状态评论由独立的同仓库 PR 工作流处理。

## 发布边界

版本计划和 changeset 不代表已经发布软件。主工作区本次不执行实际 version 或 publish。
桌面安装包只在准备好的版本合入 main、没有待处理 changeset 且不存在对应 Release 时构建。
四个平台的附件全部成功后才进入 Semifold 发布，registry 命令和凭据均未配置。
首次推送会运行质量检查并准备 release PR，不自动合并发布 PR。
私有会话、原始抓包、临时副本、测试附件、依赖和编译产物不进入公开提交。


系统产品名修订（2026-10-15）：产品名改为 Yakumo，stable Rust Windows x64 Release/NSIS 构建成功。
生成的安装脚本中产品名、默认安装目录末级、快捷方式和卸载显示名均引用 Yakumo；
可执行文件版本资源 ProductName=Yakumo、ProductVersion/FileVersion=0.1.0。
Biome、版本一致性和前端生产构建通过，应用标识保持稳定。未操作用户已有安装或发布分支。


## 首次正式版发布验收定位

2026-10-15：发布分支合并后的版本为 0.1.0，preserve 配置保留，变更集由自动化消费。
正式打包运行 38742139568 的四个平台桌面附件完成，Android 编译、签名及对齐检查通过；
安装后的 UI 验收在软键盘断言失败，故未创建 Release。
诊断确认登录输入框的正面积可访问边界被固定底部导航遮挡，脚本点击未命中输入框；
修复为先滚动至内容可视范围，再点击并轮询键盘状态，失败时补存界面和输入法诊断。
此修复仅涉及云端验收脚本，不更改应用或首次正式版本。

运行 38744640135 在提交 be100da 上完整通过：前端与 Rust 质量检查、四个桌面构建目标、
Android 签名及对齐检查、模拟器安装、冷启动、底部导航、登录输入框软键盘、系统返回及同签名覆盖安装。
验收使用空表单，未登录真实账号或提交运动数据，不替代移动业务与真机验收。
Semifold 已创建正式 Release yakumo-v0.1.0，非草稿、非预发布；12 个安装包及校验附件
和 1 个 Android 签名验证记录均上传完成。发布地址：
https://github.com/noctisynth/Yakumo/releases/tag/yakumo-v0.1.0

用户明确授权本次合并发布分支；发布 PR #1 已合并。稳定版本为 0.1.0，
channel-bump=preserve 保留，45 个 changeset 由版本自动化消费，未手工消费或改写其级别。
Windows 产物未配置代码签名，macOS 使用临时签名；本次发布不代表通过系统公证。


## Android 云端初始化组件阻挡发布（2026-10-30）

运行 41037904171 的 Android job 124005876043 在安装后界面验收失败；APK/AAB 编译、
签名、对齐、品牌资源和 updater APK 策略测试均通过，四个平台桌面包也已通过。
运行对应发布提交 14e83c0，版本 0.2.1。

诊断附件的 launch.xml、ui.xml 和截图一致显示 com.google.android.googlesdksetup 的
无响应系统窗口；应用进程及 MainActivity 正常，底栏“我的”存在但被系统窗口遮挡。
错误发生在首次导航定位，不是本轮文案修改导致控件改名。公开记录只保存结论，原始云端
诊断附件不纳入源码。失败任务地址：
https://github.com/noctisynth/Yakumo/actions/runs/41037904171/job/124005876043

按 SPEC-009 在 smoke 前增加云端模拟器准备：限定 Actions 和 qemu 环境，存在该初始化包
时仅停止并禁用该包，复核禁用结果；不存在时正常继续，错误时终止。不关闭 ANR 检测，
不跳过应用检查，不修改应用与发布签名。smoke 的任意失败阶段补存截图、界面树、
窗口、活动及崩溃日志，诊断失败不覆盖原始退出码。

本地验证：7 项 Python 合成命令/诊断测试、5 项 Android 配置测试、3 项发布元数据测试
通过；Bash 语法、工作流 YAML 及测试接入、Biome、脚本类型、版本同步和差异检查通过。
未在本机安装 SDK/NDK 或连接 Android 设备。新的准备脚本尚未在云端模拟器上执行，
不以合成命令测试代替新脚本云端验证。原失败任务第 2 次尝试的 Android job 124013709364 已成功，覆盖签名、安装、
导航、键盘、返回及覆盖安装。此重跑仍使用原发布提交，未包含新的准备脚本；
验证了临时环境故障恢复，不能作为新脚本的云端执行证据。后续签名清单核验、Semifold 发布及更新通道推进均成功。
运行第 2 次尝试最终为 success；正式 Release yakumo-v0.2.1 为非草稿、非预发布，
共 22 个附件，update-channel 的 latest.json 版本已为 0.2.1。
发布地址：https://github.com/noctisynth/Yakumo/releases/tag/yakumo-v0.2.1
