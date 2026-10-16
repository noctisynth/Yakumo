# 镜像自动更新

文档编号：SPEC-010。状态：Active。更新：2026-10-16。
来源：用户指定 fork 分支与本次集成授权；发布基线 SPEC-003，Android 身份 SPEC-009。

支持 Windows x64 NSIS、macOS arm64/x64 app tar、Linux x64 AppImage/deb，以及 Android
arm64/x64 通用 APK。iOS 不支持。旧客户端必须手动安装一次带更新能力的版本。
启动后自动检查一次，设置页可手动检查；下载、安装分别确认，Android 仍需系统来源权限和安装确认。
界面展示当前版本、候选版本、纯文本说明、累计下载量与取消，不把跨镜像累计字节误当百分比。
取消后重新检查获取新资源；下载完成仅代表验签通过，安装失败保留可操作提示。
安装成功后桌面提供重启，Android 可能直接结束旧进程，下一次启动显示实际运行版本。

Rust 固定使用 fu050409/plugins-workspace 的 feat/updater-mirrors-android 分支提交
eed469a618e169af19a2aa28759841bc73e469ed。JS 绑定以同提交原文件纳入 vendor 包，保留许可证、
来源与 SHA-256；更换 revision 时同步更新两端并验证。不得修改相邻插件工作区。
原生检查使用 fork 的端点列表和下载模板；额外强制 HTTPS（包括重定向）、不携带学校会话，
只接受本仓库相同 release tag 下的公开安装包 URL。签名错误终止，不启用 verification retry。
签名必须绑定版本，不允许降级；Android 额外检查包名、versionName、递增 versionCode 和证书连续性。
Android 更新 HTTPS 显式使用随应用依赖维护的 Mozilla DER 根证书集合与 WebPKI 完整证书链、
主机名验证；固定 fork 未提供 reqwest 平台验证器所需的 Android JVM/AAR 初始化。
该边界不继承 Android 用户安装的 CA，证书集合更新随依赖和应用更新推进；桌面沿用系统验证器。

候选服务为 ghfast.top 与 gh-proxy.com，其公开首页/服务文档说明 URL 前缀和 Release 代理支持；
官方 GitHub 为最后备用。服务可变，不保证大陆或校园网可用。仅对公开资源发送无认证请求。
配置统一在 Tauri updater 配置中维护，检查限时每端点 15 秒，下载每候选 10 分钟，失败由插件回退。
有效旧清单或 204 为权威无更新，不越过它继续寻找版本；缓存可能延迟发现但不允许错误安装。

检查指向公开 update-channel 分支的 latest.json。发布先完成全部签名安装包和云端检查，再生成、
验证清单并交给 Semifold 创建新 Release。后置发布核验确认正式 Release 及全部资产可读，
才原子更新清单分支。不覆盖任何既有 Release；失败只报告，禁止自动重发。不可变 tag 和版本文件名防止缓存混用。
更新清单内平台签名必须来自同版本同字节，客户端安装前再次验签。

长期更新私钥不得未经授权生成或提交。2026-10-16 用户明确授权生成、加密备份及配置 GitHub，
并指定在当前工程目录保存本机备份。备份目录整体忽略且限制 Windows ACL，密码由当前用户 DPAPI
保护；恢复签名验证后才上传 Secrets。该备份不能覆盖整机或 Windows 用户配置丢失，异机灾备待用户提供位置。
使用 TAURI_SIGNING_PRIVATE_KEY、TAURI_SIGNING_PRIVATE_KEY_PASSWORD
Secrets 和公开 Repository Variable UPDATER_PUBLIC_KEY。源码登记公开公钥作为默认信任，编译时
YAKUMO_UPDATER_PUBLIC_KEY 可显式设置；正式发布缺少 Secrets 或公钥变量必须失败。
APK 发布密钥与更新签名密钥独立。
此前密钥与隔离验证授权不包含合并或正式发布。后续使用者已授权合并功能并准备新版，当前边界
见 SPEC-003；隔离云端构建与模拟器验证始终独立于正式通道。

真实跨版本验证使用单独 Cargo feature 与编译期测试配置，只在手动云端验证构建中启用。
隔离版本为 99.0.1 → 99.0.2，不修改版本权威文件或 Semifold 状态，不创建 GitHub Release 或推进通道。
测试安装包使用长期 updater 签名；Android 沿用既有 APK 发布证书。测试结果仅写应用本地文件，
由云端脚本读取，不进行网络上报。独立本地 HTTPS 服务模拟检查和
镜像下载，TLS 仍强制校验；仅验证构建以 WebPKI 严格限定该次临时测试 CA，并将指定更新域名解析到 loopback。
Android 另用生产 HTTPS 配置读取一次既有公开 Release 校验文件并核对已知摘要，无认证或账号数据，
以验证真实公网证书链；此探测不下载或安装正式更新，不代表大陆或校园网连通性。
生产构建不能通过运行时环境启用这些入口，也不包含测试 CA。安装、拒绝、取消和版本变化以设备证据记录。

fork 默认 zip 功能依赖的 zip 4 系列在本轮解析时已全部撤回；关闭默认功能，只启用 rustls-tls
和 system-proxy。发布使用原生 EXE、AppImage、deb 与 macOS app tar，不生成旧版 Windows zip
或压缩 AppImage。macOS 的 tar/flate2 不受该可选功能影响。
