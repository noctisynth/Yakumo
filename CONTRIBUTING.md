# 贡献者指南

文档编号：CONTRIB-001。状态：Active。更新：2026-10-16。

这里介绍八云爱的开发、验证与发布流程。产品介绍、下载和使用说明见 README-001；开始修改前，请阅读 GOV-001，并从 DESIGN-001 进入设计与事实文档。

## 开发环境

- Rust stable，安装 rustfmt 和 Clippy。
- Node.js 22.12 或更新版本；CI 固定使用 22.22.3。
- Bun 1.4.2，使用仓库中的前端及 Rust 锁文件。
- 当前平台所需的 Tauri 原生构建依赖：Windows 的 MSVC 构建工具和 WebView2，macOS 的 Xcode 命令行工具，Linux 的 WebKitGTK 4.1 等系统库。

Linux 的完整构建依赖由桌面工具链安装步骤维护；本地运行需要可用且已解锁的 Secret Service。Windows 使用 Credential Manager，macOS 使用 Keychain，Android 使用 Keystore 保护会话主密钥。安全存储不可用时明确报错，不降级到明文存储。

Android SDK、NDK、编译、签名与模拟器验收均在 GitHub Actions 执行，本地无需安装 Android 工具链。iOS 安全存储和安装包尚未实现。

```sh
bun install --frozen-lockfile
bun run tauri dev
```

首次原生构建需要下载依赖并建立编译缓存。只预览前端可运行 `bun run dev`；浏览器预览不能替代 Tauri 原生功能和会话验证。

## 本地地图配置

从环境示例创建 `.env.local`，填入项目自己的天地图浏览器端 Key：

```dotenv
VITE_TIANDITU_KEY=your_project_browser_key
```

Key 未配置时使用 OpenStreetMap；配置后使用天地图底图与注记，失败时可手动切换备用服务。不要提交真实 Key、账号凭据或本地环境文件，也不要借用第三方演示 Key。

CI 通过仓库 Actions Variable `TIANDITU_WEB_KEY` 注入地图配置。它是客户端公开访问标识，不用于存放账号令牌或服务端秘密。地图仅请求当前视野，保留服务提供方署名；网络可达性需在目标环境另行验证。

## 工程结构与约束

| 范围 | 技术与职责 |
|---|---|
| 原生边界 | Rust stable、Tauri；网络、协议、会话和系统安全存储 |
| 页面与组件 | React、TypeScript、shadcn/ui、Tailwind CSS |
| 状态与路由 | Zustand、React Router |
| 构建与检查 | Vite、Bun、Biome、rustfmt、Clippy |

前端使用 kebab-case 文件名，按 models、components、pages、stores、hooks、services、lib 等职责组织。样式优先使用 Tailwind 工具类；原生 CSS 仅用于主题与必要基础规则。Biome 使用两空格缩进和 JavaScript/TypeScript 单引号。

Rust 按应用装配、账号、头像、运动接口、工作室和存储组织；入口仅负责装配，领域内部区分命令、服务、协议与校验。I/O、网络、配置、解析和用户输入错误使用结构化返回，生产代码不使用可能 panic 的 `unwrap`。

事实文档记录观察，规范记录设计，两者不能互相代替。涉及新设计时先更新设计索引和相关规范，再同步实施清单，最后修改代码。普通实现细节与已明确的要求可直接推进。

## 常用命令

| 命令 | 用途 |
|---|---|
| `bun run check` | Biome 格式与 lint 检查 |
| `bun run check:write` | 应用 Biome 自动修复 |
| `bun run typecheck` | 应用与构建配置的 TypeScript 类型检查 |
| `bun run typecheck:scripts` | 工程脚本类型检查 |
| `bun run build` | 类型检查和前端生产构建 |
| `bun run check:rust` | Rust 格式与 Clippy 检查 |
| `bun run test:rust` | 原生账号、协议、存储与工作室离线测试 |
| `bun run test:accounts` | 账号状态、并发防护和错误恢复测试 |
| `bun run test:dashboard` | 大盘账号隔离、请求顺序和数值解析测试 |
| `bun run test:studio` | 生成参数、路线及预设回归测试 |
| `bun run test:map` | 地图服务配置与加载状态测试 |
| `bun run test:android-config` | Android 构建覆层与签名配置测试 |
| `bun run check:versions` | Rust、前端和锁文件版本一致性检查 |
| `bun run test:release` | 发布元数据与版本同步测试 |
| `bun run test:updater` | 更新状态、镜像路由、依赖 revision 和清单测试 |
| `bun run verify` | 完整前端及 Rust 质量检查 |
| `bun run tauri build --debug --no-bundle` | 构建当前平台应用，不制作安装包 |

验证范围应与改动对应。文档改动检查编号、引用、事实时效、敏感信息与路径泄漏；平台交互应在相应平台验证，手机尺寸浏览器截图不能替代 Android 真机或模拟器验收。

## 提交与评审

提交前运行相关检查，说明改动、验证结果和剩余限制。常规测试使用合成夹具及本地模拟服务；真实账号请求需符合当次授权范围，不能在自动测试中上传运动数据。

公开文档、夹具、日志及截图不得包含真实账号、密码、令牌、个人记录标识、精确私人坐标、原始抓包正文或本机绝对目录。工程事实引用文档编号、逻辑证据编号和公开符号，不依赖其他工作区。

服务端接收、入库、有效判定、有效列表与统计计入需要分别核对。提交结果不确定时先查记录，不自动盲重传；客户端防重机制不代表服务端已提供幂等保证。

## 版本与发布

Semifold 0.3.4 管理整个应用。Rust workspace 的共享版本为唯一来源，钩子同步前端版本与锁文件，Tauri 读取同一版本；应用不发布到 npm 或 crates.io。

产品使用 stable 发布通道，与 Rust stable 工具链分别管理。版本按 changeset 自动提升；不要手工消费 changeset 或同步多处版本号。将来进入 alpha 等命名通道时，按当次发布计划确定基础版本。

功能或修复提交需要对应 changeset，例如修复使用：

```sh
semifold commit --name describe-the-change --package yakumo=patch --tag fix --summary "Describe the user-visible fix."
semifold status
```

提升等级应反映实际改动；修复使用 patch。main 的质量检查通过后，Semifold 自动维护 release PR；发布分支也必须通过对应提交的质量检查，再由维护者按发布授权合并。

合并后构建 Windows x64、Linux x64、macOS arm64／x64 及签名 Android 附件，全部成功才创建 GitHub Release。Windows 附件无商业代码签名，macOS 使用 ad-hoc 签名；Android 使用长期证书，检查签名身份、v2/v3、16 KB 对齐，并执行云端安装验收。

Android 签名凭据仅供可信 main 使用，不能替换既有发布身份或向外部 PR 暴露。手动预览流程只上传 Actions 附件，不创建正式 Release；已存在的 Release 不自动覆盖或补传。详细发布约定见 SPEC-003、SPEC-009。

自动更新使用指定 fork 的固定 Rust revision 与同提交原版 JS 源码包。来源及文件摘要登记在 vendor
包元数据中，`test:updater` 校验两端一致；更换依赖须同时复核原生与 JS API。镜像路由统一维护在
Tauri updater 配置，服务一手说明为 https://ghfast.top/ 和 https://gh-proxy.com/docs/github-accelerator/ 。
手动网络探测命令为 `bun scripts/probe-updater-mirrors.ts`，不属于自动测试，也不能替代大陆实测。

正式更新发布需要维护者准备长期保管的 Minisign/Tauri 更新密钥：私钥与密码分别配置为
`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub Secrets，公钥配置为
Repository Variable `UPDATER_PUBLIC_KEY`。不要在聊天、提交、日志或命令参数中暴露私钥和密码。
本地编译使用公开环境变量 `YAKUMO_UPDATER_PUBLIC_KEY`；更换公钥会破坏旧客户端更新信任链，
不能随意轮换。Android APK 签名证书继续沿用 SPEC-009，不能用它替代 updater 签名。

发布工作流对最终安装包使用 `--app-version` 签名，合并全部平台后生成 latest.json，由原生
`verify-update` 验证实际字节、签名和版本。Semifold 完成正式 Release 后，公开下载并核对每个
安装包的 SHA-256，最后原子更新公开 update-channel 分支的 latest.json；客户端只读取该分支。
镜像缓存可以延迟提示，不允许混用版本或在验签失败后切换签名。若发布后核验失败，保持旧通道，
维护者检查实际资产状态；不要盲目重发或覆盖 Release。本轮不执行正式发布或推进通道。
若仅后置通道推进失败，维护者可在 main 显式运行“Verify and recover updater channel”，重新下载
当前版本既有 Release、验签并核对远端字节，再推进通道；该流程不写入 Release 或重新上传资产。

长期 updater 公钥现已登记在公开源码中，普通构建默认使用该公钥，CI 的 `UPDATER_PUBLIC_KEY`
须与之保持一致。维护者明确授权后建立的本机备份位于 Git 忽略的 `.signing-backup` 下：
加密私钥、对应公钥、DPAPI 密码备份及恢复说明共同保留，目录 ACL 仅允许当前用户和 SYSTEM。
可在原 Windows 用户中运行 `pwsh -NoProfile -File scripts/provision-updater-key.ps1 -VerifyOnly`
恢复并实际签名验签；不打印秘密。已有公钥时脚本拒绝生成替代密钥，远端公钥不同时拒绝覆盖。
DPAPI 备份依赖原 Windows 用户配置，复制整个工程目录不能替代异机灾备；当前未配置离线恢复介质。

“Installed updater cross-version validation”使用独立 feature、临时本地 HTTPS CA 和隔离包标识，
以长期签名验证 99.0.1 → 99.0.2 的真实安装。测试只在手动云端运行，结果写测试应用本地文件；
不创建 Release、标签、通道清单或公开测试安装包。Android 编译和模拟器操作只在云端执行。

## 工程文档入口

工程上下文按编号定位，文档注册表与层间责任见 DESIGN-001。

| 编号 | 内容 |
|---|---|
| GOV-001 | 工程协作与隐私约定 |
| SPEC-001、SPEC-002 | 技术约束、应用骨架与工具配置 |
| SPEC-003 | Semifold 与 GitHub 发布自动化 |
| SPEC-004 | 多账号、会话存储及登录传输边界 |
| SPEC-005、SPEC-006 | 运动协议、学校只读接口与大盘 |
| SPEC-007、SPEC-008、SPEC-009 | 视觉、工作室、提交流程及移动交付 |
| FACT-001 至 FACT-006 | 逆向事实、字段、生命周期与头像证据 |
| EVIDENCE-001 | 脱敏证据登记 |
| CHECK 系列 | 分功能及平台的验证记录 |
| RFC-0000、RFC-0001 | 决策流程与待决实现选项 |
| TODO-001、TASK 系列 | 实施清单与验收差距 |
