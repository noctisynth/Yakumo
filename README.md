# 八云爱（yakumo）

一个以隐私和用户自主性为出发点的跨平台跑步数据客户端。

项目名“八云爱”，英文标识为 `yakumo`，命名灵感来自东方 Project 的《yakumo ai!》跑酷游戏。

## 项目目标

八云爱希望提供清晰、可控的跑步数据工作流：登录账号、读取运动配置、生成与预览跑步数据、
提交到服务器，并查看记录和统计结果。

- 在软件内生成跑步数据，检查距离、时间、速度和步数的一致性。
- 由用户明确发起提交，区分服务器接收、记录入库、有效判定与统计计入。
- 保留数据的合成来源，不将服务器有效判定等同于真实运动采集。
- 不内置广告或无关遥测，按实际功能需要申请权限。
- 在原生边界处理会话和协议材料，避免凭据进入前端持久状态或日志。

## 当前进度

应用骨架已初始化：包含首页、偏好设置、深浅主题、紧凑布局和未匹配路由页面。
界面设置使用内存状态；支持多个账号的登录、本地会话保存、切换和移除。
首期支持西南石油大学；账号会话由 Rust 管理，令牌不进入前端状态，密码不保存。
学校已验证入口使用 HTTP，每次登录需明确确认传输风险。过期会话要求重新登录。
运动配置、数据生成和上传仍未接入，切换账号不会触发运动操作。

已整理登录、请求签名、加密封包、表单编码、上传字段及状态流程的逆向事实，
并保留脱敏验证证据。已有测试样本完成了服务器接收、入库、有效判定和统计计入的链路验证。
这项结果覆盖特定学校、账号配置和样本，不代表所有学校或任意生成数据都已兼容。

已在 Windows 完成应用构建、启动与原生调用验证，并检查浏览器导航和窄屏布局。
骨架曾在 GitHub CI 通过 Windows、Linux、macOS 构建；新增账号功能的平台覆盖见 CHECK-003。
安装包和真实账号链路需独立验证。接下来推进运动协议移植、数据生成与预览和提交结果核对。

账号会话以 ChaCha20-Poly1305 加密保存，随机主密钥由 Windows Credential Manager、
macOS Keychain 或 Linux Secret Service 管理。Linux 需要可用且已解锁的 Secret Service；
密钥库不可用或密文损坏时会明确报错，不降级为明文。移除账号只清理本地会话，不撤销服务端令牌。

## 技术栈

| 范围 | 选择 |
|---|---|
| 原生与协议层 | Rust stable、Tauri |
| 界面与样式 | React、TypeScript、shadcn/ui、Tailwind CSS |
| 状态与路由 | Zustand、React Router |
| 格式与静态检查 | Biome；两空格缩进，JavaScript/TypeScript 单引号 |
| 前端构建与依赖 | Vite、Bun |

前端文件采用 kebab-case 命名，按 models、components、pages、stores、hooks、services、lib
等职责组织。页面及组件优先使用 Tailwind 工具类，原生 CSS 仅用于全局主题及必要基础规则。

## 本地开发

准备 stable Rust、Node.js 22.12 或更新版本、Bun 1.4.2 或更新版本，以及目标系统所需的 Tauri
原生构建依赖。工程工具链文件选择 stable 通道，前端和 Rust 锁文件均纳入版本控制。

```sh
bun install --frozen-lockfile
bun run tauri dev
```

仅预览前端可运行 `bun run dev`。浏览器预览会明确显示运行环境，不依赖原生会话或服务端请求。

| 命令 | 用途 |
|---|---|
| bun run check | Biome 格式、lint、命名和 import 检查 |
| bun run check:write | 应用 Biome 可自动修复的修改 |
| bun run typecheck | 检查应用代码和构建配置的 TypeScript 类型 |
| bun run build | 类型检查及前端生产构建 |
| bun run check:rust | stable 工具链的格式和 Clippy 检查 |
| bun run test:rust | 原生账号、登录协议和加密存储的离线测试 |
| bun run test:accounts | 账号状态、并发防护及错误恢复测试 |
| bun run verify | 前端与 Rust 的组合检查 |
| bun run tauri build --debug --no-bundle | 构建当前平台应用，不制作安装包 |

首次原生构建需要下载依赖并初始化编译缓存。当前验证覆盖 Windows x64，完整平台矩阵仍待确定。

## 版本与持续集成

Semifold 0.3.4 将八云爱作为一个发布单元管理。Rust workspace 的共享版本为唯一来源，
前端版本由钩子同步，Tauri 读取同一版本；应用不发布到 npm 或 crates.io。
当前采用 alpha 发布通道，与 stable Rust 工具链要求分别管理。

每项功能或修复随代码提交一个 changeset，例如：

```sh
semifold commit --name describe-the-change --package yakumo=patch --tag fix --summary "Describe the user-visible change."
semifold status
```

合入 main 后，质量检查通过再由 Semifold 自动维护 release PR。审查并合并该 PR 后，
流程构建 Windows x64、Linux x64、macOS arm64／x64 的应用附件与 SHA-256 校验文件，
全部成功后创建 GitHub Release。Windows 附件尚无商业代码签名，macOS 使用 ad-hoc 签名。
这里列出的是自动化目标，实际平台验证以对应 Actions 运行结果为准。

PR 检查包括前端格式、类型和构建，发布脚本测试、版本一致性，以及三个桌面系统上的 Rust 检查和应用构建。
自动生成的 release 分支通过显式派发 Quality 工作流执行相同检查。
本地可使用 `bun run verify`；单独检查发布逻辑可运行 `bun run check:versions` 和 `bun run test:release`。

## 工程上下文

工程文档通过编号检索，不依赖特定机器上的文件位置。

| 入口 | 内容 |
|---|---|
| GOV-001 | 工程协作约定 |
| DESIGN-001 | 设计索引与文档注册表 |
| SPEC-001 | 产品范围和技术约束 |
| SPEC-002 | 应用骨架和工具配置 |
| SPEC-003 | Semifold 及 GitHub 自动化 |
| SPEC-004 | 多账号、会话存储及登录传输边界 |
| FACT-001 至 FACT-005 | 逆向事实、协议、字段、生命周期与隐私证据 |
| EVIDENCE-001 | 脱敏证据登记 |
| CHECK-001 | 本次初始化的版本和验证结果 |
| RFC-0001 | 待决实现选项 |
| TASK-001 | 实施清单与验收基线 |

文档编号：README-001。
