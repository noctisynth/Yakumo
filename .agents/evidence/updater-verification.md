# 自动更新验证

文档编号：CHECK-011。状态：长期密钥配置完成，真实跨版本验证进行中。更新：2026-10-16。
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

## 长期签名与真实升级（后续授权）

2026-10-16 用户明确授权生成、备份长期更新密钥并配置 GitHub，指定将本机备份保留在当前工程。
已建立被 Git 忽略且由 Windows ACL 限制为当前用户和 SYSTEM 的备份目录，私钥加密保存，密码由
CurrentUser DPAPI 保护。通过实际解密恢复签名、全部平台夹具验签和错误密码拒绝验证；没有打印
私钥或密码，也没有把秘密放入命令行参数。仅公开公钥进入源码。

公开公钥文本 SHA-256：a2bbe162bd755059fe0d00246243e6ca56790fb4b5ee18dd7e02e92793827d24。
GitHub 已配置 TAURI_SIGNING_PRIVATE_KEY、TAURI_SIGNING_PRIVATE_KEY_PASSWORD 及公开变量
UPDATER_PUBLIC_KEY；已核验变量与源码和备份公钥相同。Android 原有发布密钥未改变。
前述“缺少 updater 密钥”是初次集成阶段的历史状态，在本次授权后已解决。
备份仍依赖原 Windows 用户配置，不能视为异机或离线灾备；用户尚未提供此类介质。

生产构建默认信任源码登记的公钥。隔离验证包使用专用 feature、独立包标识及 99.0.1 → 99.0.2，
测试版本仅通过构建配置覆层设置，未修改 Cargo workspace 版本或消费 changeset。
检查和下载域名在专用构建内解析到 loopback，本地 HTTPS 使用独立 CA 和服务器证书，保持 HTTPS-only
及证书校验；结果仅写测试应用本地文件。原生 HTTPS fixture 实测验证了 HTTP 拒绝、TLS 证书链及
503/200 候选响应。一次独立测试遗漏 Rustls provider 初始化的失败已修正；实际插件检查本身会初始化。
早期测试证书改为独立 CA/叶子证书后重跑；不以关闭证书校验修复。

真实升级运行：https://github.com/noctisynth/Yakumo/actions/runs/38913278243 ，代码 4fc3bed。

| 平台 | 当前实证 |
|---|---|
| macOS arm64 | 真实安装与重启到 99.0.2；无更新、版本拒绝、篡改拒绝、下载取消和镜像回退通过 |
| Linux x64 AppImage | 真实安装与重启到 99.0.2；相同拒绝、取消、无更新和回退场景通过 |
| Windows x64 NSIS | 真实安装与重启到 99.0.2；相同拒绝、取消、无更新和回退场景通过 |
| macOS x64 | 临时 CA 生成受 OpenSSL 1.1 系统配置影响出现重复扩展；隔离配置修复后重跑 |
| Android API 35 x86_64 | 两版签名 APK 已构建；独立运行补充设备验证 |

Android 首轮驱动曾假设 Tauri 数据目录为 files 子目录；核对 PathPlugin.getDataDir 后修正为应用
dataDir，只调整测试证据读取和取消标记位置，不修改生产存储。补充运行：
https://github.com/noctisynth/Yakumo/actions/runs/38915138163 。
系统安装按钮兼容 Install/Update 两种平台文案。未创建测试 Release、标签或推进正式更新通道。

公钥接入后的常规质量运行 https://github.com/noctisynth/Yakumo/actions/runs/38912690735 全部成功。
以上真实安装来自隔离云端环境，镜像回退由本地 HTTPS 模拟，不冒充大陆/校园网真实网络或 Android arm64 真机实测。

第二轮 Android 证据读取正确，但检查阶段尚未发出 HTTP 请求即失败。静态核对 reqwest 0.13.5
与 rustls-platform-verifier 0.7.1：Android 不支持合并额外 CA；默认验证器还需要 JVM 初始化及
Android AAR，而固定 updater fork 未集成该路径。生产 Android 更新传输改用维护的 Mozilla DER
根证书集合与严格 WebPKI 校验；桌面生产验证器不改变。专用验证夹具则只信任临时 CA，仍校验
完整链与主机名。Android 云端额外读取已发布的公开校验文件并核对已知摘要以验证生产 TLS 配置。
macOS Intel 运行 https://github.com/noctisynth/Yakumo/actions/runs/38917139779 的原生证书预检
报告缺少 CT SCT，但此信息不能单独解释链失败。后续
https://github.com/noctisynth/Yakumo/actions/runs/38918924710 证书诊断确认 OpenSSL 1.1.1w 把系统
配置与 -addext 的扩展叠加，CA 出现重复 Basic Constraints 和 Subject Key Identifier，链校验失败。
改用独立最小 OpenSSL 配置防止重复扩展，生成后立即核对链与主机名；不关闭证书验证。
Vite 直连与 /@fs 访问备份目录的 canary 测试均返回 403，前端/脚本测试现为 36 项。

Android HTTPS 修复后的运行 https://github.com/noctisynth/Yakumo/actions/runs/38918512514 已完成
两版双 ABI APK 构建、相同发布证书与版本递增检查，并在设备执行至验签成功及来源权限拒绝后的
重试。失败点为驱动未识别 API 35 设置页的 Compose 可勾选 View；设备 XML 显示唯一未勾选、
可点击的来源授权行。驱动增加该语义兼容，不绕过系统安装确认；完成案例在失败时也保留本地证据。
此时尚不能标记 Android 升级成功。
