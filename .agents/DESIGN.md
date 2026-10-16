# 八云爱（yakumo）工程设计索引

文档编号：DESIGN-001。状态：Active。更新：2026-10-14。

## 产品方向

项目名为“八云爱”，英文标识为 yakumo，命名灵感来自东方 Project 的《yakumo ai!》跑酷游戏。

建立跨平台的跑步数据客户端：用户可登录、读取配置和记录、查看统计，在软件内生成、
检查并提交跑步数据，查询服务端处理结果。采用 stable Rust 与 Tauri，以及 React、
Zustand、React Router、shadcn/ui、Tailwind CSS、Biome。前端优先使用 Tailwind 工具类，
原生 CSS 限于全局主题和必要基础规则。隐私最小化、无广告、无无关数据上报属于产品目标。

当前已完成应用骨架初始化：使用 Tauri 2、Vite、React TypeScript 和 Bun，Rust 固定 stable 通道。
已建立页面、导航、界面状态、基础组件及检查命令；当前增加多账号登录与会话管理，见 SPEC-004。
运动签名、封包、JSON 与双层表单已完成离线适配，见 SPEC-005。
当前学校的配置、记录、详情和统计已接入只读数据大盘，见 SPEC-006；资料页、合成工作室及受限提交流程见 SPEC-008。
历史 Android 真实定位和计步流程作为兼容性证据保存，不替代本轮“生成数据并上报”的目标。
是否增加真实运动采集能力及移动后台服务仍属后续范围，不作为当前目标的隐式前置条件。

## 文档注册表

文档以编号定位，文件名仅为检索辅助，不使用本地路径或文件链接。

| 编号 | 文件名 | 类型 | 责任 |
|---|---|---|---|
| README-001 | README.md | 项目介绍 | 名称、目标、当前进度与工程入口 |
| GOV-001 | AGENTS.md | Active 约定 | 协作、事实、隐私与验证纪律 |
| DESIGN-001 | DESIGN.md | Active 索引 | 方向、边界、阅读顺序 |
| SPEC-001 | product-baseline.md | Active Spec | 用户已确定范围及工程约束 |
| SPEC-002 | application-scaffold.md | Active Spec | 应用骨架、工具配置、职责与初始化验收 |
| SPEC-003 | release-automation.md | Active Spec | Semifold、版本同步、桌面 CI/CD 和公开仓库 |
| SPEC-004 | accounts.md | Active Spec | 多账号登录、切换、加密会话和传输边界 |
| SPEC-005 | exercise-protocol.md | Active Spec | 运动签名、JSON、封包和表单离线适配 |
| SPEC-006 | dashboard.md | Active Spec | 学校只读接口、数据大盘和账号隔离 |
| CHECK-008 | run-workflow-verification.md | 验证记录 | 账号资料、生成及提交分阶段验证 |
| SPEC-008 | run-workflow.md | Active Spec | 账号资料、合成生成与显式提交 |
| SPEC-009 | mobile.md | Active Spec | 移动导航、Android 原生交付及签名 |
| CHECK-009 | mobile-verification.md | 验证记录 | 移动布局、跨平台构建及 Android 签名安装 |
| SPEC-007 | visual-identity.md | Active Spec | 角色品牌、视觉与独立记录和配置页面 |
| CHECK-007 | visual-verification.md | 验证记录 | 角色图标、导航和响应式视觉验证 |
| CHECK-006 | dashboard-verification.md | 验证记录 | 学校接口模拟、大盘交互和平台构建 |
| CHECK-005 | exercise-protocol-verification.md | 验证记录 | 原生协议合成向量与封包回读 |
| CHECK-003 | accounts-verification.md | 验证记录 | 多账号隔离、协议、存储及交互验证 |
| CHECK-004 | avatars-verification.md | 验证记录 | 用户头像读取、账号隔离、图片边界与占位验证 |
| CHECK-001 | scaffold-verification.md | 验证记录 | 初始化版本、检查结果及平台覆盖 |
| CHECK-002 | release-verification.md | 验证记录 | Semifold 预演、发布脚本与工作流检查 |
| FACT-001 | evidence-baseline.md | Verified facts | 样本与验证成熟度、历史冲突消解 |
| FACT-002 | protocol.md | Verified facts | 身份、路由、签名、封包、编码 |
| FACT-003 | upload-fields.md | Verified facts | 38 个顶层字段和嵌套数据 |
| FACT-004 | lifecycle.md | Verified facts | 配置、状态、生成实验和结果核对 |
| FACT-005 | privacy.md | Verified facts | 权限、明文传输、第三方证据范围 |
| FACT-006 | avatars.md | Verified facts | 新版头像字段、空值及写入证据边界 |
| EVIDENCE-001 | evidence-register.md | Evidence register | 证据编号、摘要和来源哈希 |
| DATA-001 | evidence-snapshot.json | Sanitized evidence | 原始材料精选的类型及验证结果 |
| DATA-002 | upload-observation.schema.json | Observed schema | 客户端字段并集；非服务端校验规范 |
| RFC-0000 | README.md | Active 流程 | 提案状态与接受条件 |
| RFC-0001 | 0001-implementation-choices.md | Draft RFC | 平台、存储、生成及协议实现选项 |
| TODO-001 | TODO.md | Active 索引 | 路由当前实施清单 |
| TASK-001 | project.md | Active 清单 | 已确认目标与实现差距 |
| TASK-002 | accounts.md | 已完成清单 | 多账号实现与验收，平台限制见 CHECK-003 |
| TASK-003 | mobile.md | Active 清单 | 移动布局、Android 原生能力、云端产物和签名安装验收 |

## 责任边界

以下是后续实现的分层基线，具体命令签名、crate 拆分及存储方案仍待设计。

| 层 | 职责 | 边界 |
|---|---|---|
| React 页面和组件 | 登录流程、配置呈现、生成预览、提交反馈、历史记录 | 不持有服务端令牌，不实现密码学 |
| Zustand 与 React Router | 界面共享状态和导航 | 不把前端缓存当作服务端完成事实 |
| Tauri 应用边界 | 校验命令输入，协调会话、生成、上传及结果核对 | 使用最小权限，不开放任意网络代理 |
| Rust 领域逻辑 | 生成数据、单位和一致性检查、本地状态模型 | 不依赖视图；合成来源与服务端判定分开 |
| Rust 协议适配 | 学校配置、登录、签名、JSON、加密、HTTP、响应解释 | 精确保留协议类型与未知值 |
| 平台服务 | 凭据保护、可恢复状态和打包 | 不将单平台机制当跨平台保证 |

调用方向为界面到应用边界，再到领域逻辑、协议适配及平台服务。纯数据生成与请求构造可离线运行；
发送行为由应用流程显式发起。数据来源、提交状态和服务端有效判定是三种不同属性。

## 当前可复用基线

已恢复完整的两版 DEX 样本，验证新版登录、四个只读接口、原版 22 条 GET 签名、上传封包与
双层表单编码。已取得一条合成测试记录的接收、详情有效状态、有效列表及统计变化证据。
这些足以启动有边界的协议移植，不等于完成全部业务规则或完整 Android 生命周期。

阅读顺序：GOV-001 → SPEC-001 → FACT-001 → FACT-002 至 FACT-005 → EVIDENCE-001 → TASK-001。
新增跨层决策先更新本索引；待决项通过 RFC-0000 推进。工程事实不依赖其他工作区可用。


## 原生代码组织与工作室视觉责任

原生实现按应用装配、账号、头像、运动接口、工作室、存储六个领域组织，领域内部再按协议、
服务、校验与平台适配拆分。应用入口仅装配状态、插件和命令；命令按账号、资料头像、
只读运动、工作室、提交、移动平台分组，不承载协议算法。账号测试夹具与生产状态管理分离。
本次只调整模块边界，不更改前端 IPC 名称、存储格式、应用标识或移动入口约定。

工作室使用地图主画布与路线检查面板，取消层层包裹的表单外框。桌面并排、窄屏按顺序堆叠；
步骤用细线进度表达，距离与配速保持相同输入和偏移区节奏。所有界面变化沿用现有主题及组件。

地图连接与加载状态由独立前端模块管理；Android WebView 保留系统浏览器标识并追加稳定应用标识。
底图故障不得通过放宽 TLS 或域名边界处理；设备侧根因与模拟网络验证分开记录，见 SPEC-009。
