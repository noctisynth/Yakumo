# 自动更新验证

文档编号：CHECK-011。状态：实现与云端预览通过，正式更新启用待配置。更新：2026-10-16。
规范：SPEC-010；清单：TASK-004。本记录不继承其他功能的用户验收。

## 依赖证据

通过指定公开远端分支核对提交 eed469a618e169af19a2aa28759841bc73e469ed，
Rust Cargo.lock 固定该 revision。JS 从同提交 plugins/updater/guest-js/index.ts 原样复制，
SHA-256 为 ba9c640e3e755237178e2ec7898f7bfa87d03883e872b21210560eb25547d3ad，
许可证与来源元数据保留；自动测试校验摘要及两端 revision 一致。
初次记录曾使用 Windows 检出后的 CRLF 字节摘要，导致首轮云端前端质量检查失败；现改为
Git 原始 blob 摘要，修复后已重跑通过。不将换行转换差异误认为 fork 源文件发生修改。
指定 fork 精确提交的 Android 构建与 APK 策略测试成功记录：
https://github.com/fu050409/plugins-workspace/actions/runs/38901909326 。
这是插件自己的云端证据，不能替代 Yakumo 集成构建或设备更新安装验收。

默认 zip 功能遇到 crates.io zip 4 全系列已撤回，已关闭该功能并使用原生安装格式。
本地读取源码发现安装包 HTTP 仅警告，Yakumo 原生检查额外配置 HTTPS-only，重定向限 8 次；
限制本仓库版本固定 URL、无认证或查询参数，平台映射匹配文件名，签名受信注释匹配文件名。
此注释预检查只用于拒绝，真正信任建立于 fork 对字节和全局签名的强制验证。

## 网络探测（执行网络，不是大陆或校园网实测）

一手说明：https://ghfast.top/ 的首页描述 Release/Raw 支持，公开 JS 提供前缀转换；
https://gh-proxy.com/docs/github-accelerator/ 提供 Release/Raw 前缀说明。
前者没有可据以保证的统一大文件上限；后者声称流式传输，本项目仍设置超时和官方备用。
这些服务不保证永久可用，不向它们发送任何私有认证。

2026-10-16 手动流式探测公开 README、0.1.2 Release 校验附件与真实 AppImage：

| 资源 | ghfast.top | gh-proxy.com | 官方 |
|---|---|---|---|
| README，3,873 字节 | 200，摘要一致 | 200，摘要一致 | 200 |
| Release SHA-256 附件，95 字节 | 200，摘要一致 | 200，摘要一致 | 本轮连接失败 |
| AppImage，85,436,920 字节 | 200，65.2 秒 | 200，57.2 秒 | 200，71.8 秒，重定向到 release-assets.githubusercontent.com |

AppImage 三路完整 SHA-256 均为 c5d7b3a03e4bd3e81e42f368a43b946da66c62103caf0fb0d26d3438543501b9。
以上为探测样本，真实 latest.json 在尚未正式发布更新通道前不存在；不把缺失清单说成无更新。
镜像缓存返回有效旧版本时 fork 结束检查，已明确提示同步延迟；发布只推进核验成功的版本。

## 本地验证

- Biome、应用/脚本类型检查、生产前端构建、版本一致性及锁文件冻结安装通过。
- 35 项前端/脚本测试通过，包含新增更新状态、取消竞态、无更新、配置缺失、安装重试、URL 边界与更新说明。
- Rust 全套：64 个库测试与 1 个发布验签测试通过；1 个原有系统密钥库测试按原约定忽略。
- 固定 fork 的 35 个单元/loopback 测试通过，覆盖 A 失败 B 成功、无更新权威语义、超时、
  中断、取消、签名与版本失败、旧配置兼容。使用与应用相同的非 zip 功能组合。
- Rust fmt 与 Clippy（所有目标、警告视为错误）通过。
- 合成发布链路验证通过：明确生成一次性测试密钥，为全部平台的不可安装夹具签名，生成正式格式
  清单，原生逐个验签成功；错误公钥和篡改文件均被拒绝。测试私钥在签名后删除，不用于真实构建或发布。
  此验证已加入 Windows 云端质量工作流；不替代长期密钥配置或真实安装。
- 一次普通沙箱执行的 loopback 测试被网络边界阻断；允许本地模拟服务后完整重跑通过。
  不将该环境限制当作协议回归。Windows 并发测试占用可执行文件后改为串行运行。

## 发布与剩余边界

云端跨平台预览运行 https://github.com/noctisynth/Yakumo/actions/runs/38907427254
在 ece2883 提交上全部通过：Windows x64、Linux x64、macOS arm64/x64 打包与附件收集；
Android 两种 ABI 编译、固定 fork 的 APK 身份策略测试、品牌资源检查，以及 API 35 模拟器安装、
冷启动、既有 UI 回归和同包覆盖安装。该预览不持有正式签名 Secrets，Android 是 debug 包。
四个桌面安装包和两种 macOS app.tar.gz 更新归档均已生成。

修复来源摘要后的质量运行 https://github.com/noctisynth/Yakumo/actions/runs/38907531083
在 38569f9 上全部通过前端、Linux/macOS/Windows fmt、Clippy、Rust 测试、原生构建，以及 Windows
对精确 fork 的 35 项测试。

最终代码提交 1630a55 的质量运行 https://github.com/noctisynth/Yakumo/actions/runs/38908534924
全部成功：35 项前端/脚本测试、三桌面系统 fmt/Clippy/Rust 测试与原生构建，Windows 合成签名
发布链路及精确 fork 的 35 项测试。前一阶段合成发布质量运行
https://github.com/noctisynth/Yakumo/actions/runs/38908172854 亦全部通过。
此后仅补录验证文档，不改变执行代码。Semifold status 保留 4 个 changeset，计划 0.1.2 → 0.2.0，
没有消费变更集或手动修改版本。

原会话核实现有 Secrets 只有 ANDROID_KEY_ALIAS、ANDROID_KEY_BASE64、ANDROID_KEY_PASSWORD；
没有已建立的 updater 长期密钥或公钥。未生成、替换或打印长期密钥。
正式发布门禁要求 TAURI_SIGNING_PRIVATE_KEY、TAURI_SIGNING_PRIVATE_KEY_PASSWORD（可为空密码）
以及公开变量 UPDATER_PUBLIC_KEY。缺失时客户端显示尚未配置，发布失败。

本轮未合并、未发布、不覆盖已有 Release，不创建或推进 update-channel。
Android 真正系统更新安装（含权限拒绝、取消、
跨版本升级）及 macOS/Linux 安装后的重启仍需对应环境/长期签名基线验证。
Minisign 校验不等于系统代码签名或 Apple 公证；Android 不支持静默、分包或签名密钥轮换。
