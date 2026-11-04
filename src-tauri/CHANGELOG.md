# Changelog

<!-- semifold:release version=0.2.2 -->
## v0.2.2

### Bug Fixes

- [`23fd3bf`](https://github.com/noctisynth/Yakumo/commit/23fd3bf1b238d12729d1ef4881e4c6454d049e45): 防止云端 Android 模拟器初始化组件遮挡发布验收，并补全失败诊断。
<!-- semifold:release:end -->

<!-- semifold:release version=0.2.1 -->
## v0.2.1

### Bug Fixes

- [`b3aee3d`](https://github.com/noctisynth/Yakumo/commit/b3aee3d848a84ee51cbee70f0fa3d3b1ce0ffd65): 对齐生成、预设与提交的配速安全范围，使用提交确认弹窗并提示偏快配速的合理性风险。
- [`b3aee3d`](https://github.com/noctisynth/Yakumo/commit/b3aee3d848a84ee51cbee70f0fa3d3b1ce0ffd65): 统一用户文案，清理防御性表达与研发术语，保留操作结果、风险和限制。
<!-- semifold:release:end -->

<!-- semifold:release version=0.2.0 -->
## v0.2.0

### Bug Fixes

- [`b75b787`](https://github.com/noctisynth/Yakumo/commit/b75b78700d455fd4cedd73b9fd3196293dfb533f): Recognize the API 35 Compose source-permission toggle in installed-updater validation and retain completed case evidence on later failures. ([#5](https://github.com/noctisynth/Yakumo/pull/5) by @fu050409)
- [`b75b787`](https://github.com/noctisynth/Yakumo/commit/b75b78700d455fd4cedd73b9fd3196293dfb533f): Use maintained Mozilla roots for Android updater HTTPS without missing platform-verifier JVM setup, and verify public TLS alongside isolated installed-update tests. ([#5](https://github.com/noctisynth/Yakumo/pull/5) by @fu050409)
- [`b75b787`](https://github.com/noctisynth/Yakumo/commit/b75b78700d455fd4cedd73b9fd3196293dfb533f): Read Android updater validation evidence from Tauri dataDir and support focused retries. ([#5](https://github.com/noctisynth/Yakumo/pull/5) by @fu050409)
- [`b75b787`](https://github.com/noctisynth/Yakumo/commit/b75b78700d455fd4cedd73b9fd3196293dfb533f): Prevent the local development server from serving any encrypted signing backup or recovery material. ([#5](https://github.com/noctisynth/Yakumo/pull/5) by @fu050409)
- [`b75b787`](https://github.com/noctisynth/Yakumo/commit/b75b78700d455fd4cedd73b9fd3196293dfb533f): Verify disposable TLS chains immediately after generation and retain public certificate diagnostics on failure. ([#5](https://github.com/noctisynth/Yakumo/pull/5) by @fu050409)
- [`b75b787`](https://github.com/noctisynth/Yakumo/commit/b75b78700d455fd4cedd73b9fd3196293dfb533f): Isolate disposable certificate generation from runner OpenSSL configuration to prevent duplicate CA extensions on Intel macOS. ([#5](https://github.com/noctisynth/Yakumo/pull/5) by @fu050409)
- [`b75b787`](https://github.com/noctisynth/Yakumo/commit/b75b78700d455fd4cedd73b9fd3196293dfb533f): Verify disposable updater certificate chains and retain bounded TLS failure evidence across platforms. ([#5](https://github.com/noctisynth/Yakumo/pull/5) by @fu050409)
- [`b75b787`](https://github.com/noctisynth/Yakumo/commit/b75b78700d455fd4cedd73b9fd3196293dfb533f): Reject incorrect signing backup passwords and implicit trust rotation; allow focused installed-updater validation. ([#5](https://github.com/noctisynth/Yakumo/pull/5) by @fu050409)
- [`b75b787`](https://github.com/noctisynth/Yakumo/commit/b75b78700d455fd4cedd73b9fd3196293dfb533f): Remove release automation markers from updater notes and accept CRLF changelogs. ([#5](https://github.com/noctisynth/Yakumo/pull/5) by @fu050409)
- [`b75b787`](https://github.com/noctisynth/Yakumo/commit/b75b78700d455fd4cedd73b9fd3196293dfb533f): Exercise updater release signing and tamper rejection with disposable synthetic fixtures in CI. ([#5](https://github.com/noctisynth/Yakumo/pull/5) by @fu050409)
- [`b75b787`](https://github.com/noctisynth/Yakumo/commit/b75b78700d455fd4cedd73b9fd3196293dfb533f): Configure persistent updater trust and verify real cross-version installation using isolated cloud builds. ([#5](https://github.com/noctisynth/Yakumo/pull/5) by @fu050409)
- [`b75b787`](https://github.com/noctisynth/Yakumo/commit/b75b78700d455fd4cedd73b9fd3196293dfb533f): Verify vendored updater source against canonical Git blob bytes across platforms. ([#5](https://github.com/noctisynth/Yakumo/pull/5) by @fu050409)
- [`b75b787`](https://github.com/noctisynth/Yakumo/commit/b75b78700d455fd4cedd73b9fd3196293dfb533f): Validate isolated updater HTTPS routing with a dedicated CA and a server certificate. ([#5](https://github.com/noctisynth/Yakumo/pull/5) by @fu050409)
- [`afad7c0`](https://github.com/noctisynth/Yakumo/commit/afad7c0b4281fcbee093cc1378476635295ea14c): Prevent mobile overscroll from moving bottom navigation and remove unnecessary page overflow by reserving the navigation's actual height outside the content scroller. ([#7](https://github.com/noctisynth/Yakumo/pull/7) by @fu050409)

### New Features

- [`b75b787`](https://github.com/noctisynth/Yakumo/commit/b75b78700d455fd4cedd73b9fd3196293dfb533f): Add signed desktop and Android updates with public GitHub mirror fallback and verified release channel promotion. ([#5](https://github.com/noctisynth/Yakumo/pull/5) by @fu050409)
<!-- semifold:release:end -->

<!-- semifold:release version=0.1.2 -->
## v0.1.2

### Bug Fixes

- [`fc29bc5`](https://github.com/noctisynth/Yakumo/commit/fc29bc57c7aba1a91af08b776571adc946fdd4b4): 修复 Android 安装包仍显示默认图标的问题，统一普通、圆形和自适应品牌图标，并增加实际安装包校验，避免后续构建回退。 ([#3](https://github.com/noctisynth/Yakumo/pull/3) by @fu050409)
- [`7b1ed8f`](https://github.com/noctisynth/Yakumo/commit/7b1ed8f66d716045ff87a8d6e7bf1df92198b3a4): 修复非空学校运动区域被一律拦截的问题，按同一坐标参照核验最终轨迹及路段，保留原始区域配置；区分真实越界与配置异常，并在发送前再次检查。 ([#3](https://github.com/noctisynth/Yakumo/pull/3) by @fu050409)

### Chores

- [`18d293e`](https://github.com/noctisynth/Yakumo/commit/18d293efa961046925427d6c60afcb65b4718a9f): 根据用户 Android 与 PC 实测确认完成当前使用验收，已知及后续缺陷独立跟踪，明确用户反馈与自动化验证的证据边界。 ([#3](https://github.com/noctisynth/Yakumo/pull/3) by @fu050409)
<!-- semifold:release:end -->

<!-- semifold:release version=0.1.1 -->
## v0.1.1

### Bug Fixes

- [`ab2ca76`](https://github.com/noctisynth/Yakumo/commit/ab2ca760aed2c8e39e5295157b6a4872e6e65a06): 补齐 Android 地图请求的应用标识，加固底图加载超时、离线反馈及重试隔离，防止空白或持续等待。
- [`f98f2c2`](https://github.com/noctisynth/Yakumo/commit/f98f2c2580a5f126fb5eafc6dfaabf1fa9096123): 增加项目级天地图底图配置，桌面和 Android 共用国内底图及注记，失败时可切换备用地图并保留视角和选点；未配置访问 Key 时不启用。
- [`94bc0a3`](https://github.com/noctisynth/Yakumo/commit/94bc0a32fa25a4b123162bf44f38c620d2cc4d26): 兼容学校规则的 JSON 数组文本，避免空围栏被误判为实际要求；区分配置异常与未完成核验，移除用户提示中的研发阶段文案及无效的重新生成指引。
<!-- semifold:release:end -->

<!-- semifold:release version=0.1.0 -->
## v0.1.0

### Bug Fixes

- [`8e5de43`](https://github.com/noctisynth/Yakumo/commit/8e5de439d3af71c7a62cda03a013daec4114d69a): 登录归入账号管理子页面，顶部返回并精简风险文案
- [`e0b7cfe`](https://github.com/noctisynth/Yakumo/commit/e0b7cfe25082892822ba5da5dc2acfab6423d020): 从 Android 原生同步系统栏安全区域、键盘和主题，并修正云端 UI 的滚动定位
- [`a356dad`](https://github.com/noctisynth/Yakumo/commit/a356dad8e71e92f9bad65408a9506dd02bbb0a84): 修复云端 SDK 初始化并验证 Gradle 覆层、签名配置和凭据缺失时的失败保护
- [`58867dc`](https://github.com/noctisynth/Yakumo/commit/58867dc1ed38ced04de5b475e04496586e37c540): 修复学校同源头像在 Fake-IP 代理环境下的误拦，头像更换改为悬停点击与确认弹窗、刷新统一到资料页，并移除提交历史列表，将未确认结果归入运动记录核对。
- [`c3e29e9`](https://github.com/noctisynth/Yakumo/commit/c3e29e9fca4ecac4738261325cf7828cd2eee702): 统一账号顶部导航视觉并改用 shadcn 学校选择组件
- [`520f77f`](https://github.com/noctisynth/Yakumo/commit/520f77f5f4c051a494c958306cb983bb6a259da0): 纠正受支持无异常流程的人脸初始化状态，保留人脸要求开启或未知时的提交阻断。
- [`b17b2d3`](https://github.com/noctisynth/Yakumo/commit/b17b2d30c812836c2648cae5ba15cd9a5eabfbf8): 压深并统一暗色靛灰层级，移除账户卡片外层底框
- [`8a03f0d`](https://github.com/noctisynth/Yakumo/commit/8a03f0d8280a514241078e0c01980b8eb9a4d580): Run local release-plan checks without a pull-request event context on pushes and workflow dispatches, and limit status comments to trusted repository pull requests.
- [`0ce3c64`](https://github.com/noctisynth/Yakumo/commit/0ce3c64b0018f42119ffee4f47fe26c2aad82a00): 定位添加选点后同步聚焦地图，并将预设列表改为主按钮。
- [`f72b2cd`](https://github.com/noctisynth/Yakumo/commit/f72b2cd2a61d5b6d85c427a8ed30b628802d8e4d): 恢复保存预设标准按钮尺寸，工作室反馈贴近操作，并使用预计运动数据标题。
- [`709c246`](https://github.com/noctisynth/Yakumo/commit/709c246d08862bac8a72c92ca367713b25e1c7e5): 拆分登录与账号管理，修复错误提示位置及登录中风险确认状态
- [`a276115`](https://github.com/noctisynth/Yakumo/commit/a27611545d85a3ea930cce35215fde06f5c99301): 修复学校单行 Base64 登录公钥解析失败
- [`9bd53c8`](https://github.com/noctisynth/Yakumo/commit/9bd53c8ba7a57f8b5991c83e646460792d29666f): 细分登录响应异常阶段，保留安全错误边界
- [`d6c128a`](https://github.com/noctisynth/Yakumo/commit/d6c128a42673c394eb5e728300c03fe2aa418ba9): 重设计大盘风格登录页，修复暗色密码显隐并保留失败输入
- [`484897b`](https://github.com/noctisynth/Yakumo/commit/484897bdd44768e1e601d7ea42c4495b225b4fbc): 保持触屏横屏底栏与安全区域，强化 Android AAB 证书、最低系统及云端 UI 验证
- [`b74e82f`](https://github.com/noctisynth/Yakumo/commit/b74e82f45cd72b0b0f8ade751777d59400a85e6a): 统一日期选择、工作室操作与账号卡片展示，修正刷新按钮对齐。
- [`6bc319c`](https://github.com/noctisynth/Yakumo/commit/6bc319cc1bdce1b760b09fb151af8761820462d1): 学制按年展示并移除多余单位说明
- [`065c855`](https://github.com/noctisynth/Yakumo/commit/065c8550d4d8e1ef8c8c099ebb3cf5b27a0ec503): 资料字段名恢复次要展示并解释已确认的学生与毕业状态
- [`fdfb832`](https://github.com/noctisynth/Yakumo/commit/fdfb832814e07faea70662b7668c57fe8f83e1b8): 资料字段中文分组展示并统一软件图标头像占位
- [`718afed`](https://github.com/noctisynth/Yakumo/commit/718afedf22237d36d5365215bafa80313a114751): Move account switching into a sidebar footer card with an upward menu, account placeholders, keyboard navigation and account management shortcuts.
- [`382e7f7`](https://github.com/noctisynth/Yakumo/commit/382e7f700389c10d291dd6c09c18c4650d5d35cd): 地图默认加载并提供加载与重试状态，精简提交页为数据核对表，自动检查学校要求并在票据过期时更新，保留显式发送和重复防护。
- [`1061787`](https://github.com/noctisynth/Yakumo/commit/1061787431ecb7e5af61974644eef403a3fecdff): 预设保存改用弹窗，提交拦截逐项显示当前值与学校要求，并修复路线默认里程的输入精度冲突。
- [`695d3ae`](https://github.com/noctisynth/Yakumo/commit/695d3ae1407b8aabafcba850e883ea697840235b): 支持地图滚轮与双指缩放，统一缩放控件并简化合规地图署名。
- [`866dbc9`](https://github.com/noctisynth/Yakumo/commit/866dbc9652069757a6c488f556e7709480d456ae): 统一所有二级页面顶部返回及记录筛选 Select 组件
- [`cb9da91`](https://github.com/noctisynth/Yakumo/commit/cb9da9126904891945c75c9c250ba293283cbc8b): 安装程序和系统产品名称统一使用 Yakumo。
- [`889874f`](https://github.com/noctisynth/Yakumo/commit/889874fac895e55c1b63f2910ba6ad01d9694689): 将原生窗口标题中的英文品牌名称改为 Yakumo

### Chores

- [`784ca11`](https://github.com/noctisynth/Yakumo/commit/784ca11341aa86718951afb4a399761c663d0343): 切换正式发布通道，保留 preserve 基线，以既有 0.1.0-alpha.0 晋升首次正式版本 0.1.0。

### New Features

- [`99057d1`](https://github.com/noctisynth/Yakumo/commit/99057d126a19e2fa2a65481578360c58d98ba89d): Read imageRouteUrl from signed current-user profiles and display per-account encrypted avatar caches with Avatar components and reliable empty or failed-image placeholders.
- [`eb0c1ed`](https://github.com/noctisynth/Yakumo/commit/eb0c1ed913e86e3489ca63c60716d1bfcdd0a21c): 为上报轨迹加入有界平滑随机坐标与行进变化，重算距离速度和步数桶，并提供最终轨迹局部预览。
- [`356fbaa`](https://github.com/noctisynth/Yakumo/commit/356fbaa3b8e56596f5374b3d4e570ea839f12484): 重设角色头像品牌和深靛金色界面，将运动记录与学校配置拆分为侧栏独立页面
- [`3091c1e`](https://github.com/noctisynth/Yakumo/commit/3091c1e78a609fd7d64efd4aaa753bcaa1d0c6b6): 增加 Android 云端构建与跨平台预览入口，接入 Keystore 会话保护和系统预览导出
- [`e2405aa`](https://github.com/noctisynth/Yakumo/commit/e2405aa9efc430b799636b76e1fb2c99a8626123): 新增当前账号资料页，支持非凭据字段检索、空值及嵌套内容展示
- [`23a744d`](https://github.com/noctisynth/Yakumo/commit/23a744ded2e594b3f84971b117dbda6c68c9848e): 下线环形入口，以距离和配速联动生成时长、速度及估算步数，支持一致的随机偏差并验证截断和循环。
- [`7cd7f85`](https://github.com/noctisynth/Yakumo/commit/7cd7f85848c74ce136971e059c44b929ccdc0a7a): Port exercise GET and form signing, native JSON formatting, RSA/AES envelopes and double form encoding with offline native-vector verification.
- [`ff9c616`](https://github.com/noctisynth/Yakumo/commit/ff9c616de841cf5bb5f9434580c80da3d316a71a): 点击后请求单次定位并回填学校查询坐标，保留手动输入
- [`d8a28c2`](https://github.com/noctisynth/Yakumo/commit/d8a28c2df02dbf0b7b1d15ba637d391800c6dbea): 接入显式运动提交、学校规则检查、持久防重及未知结果关联核对，分别反馈详情列表与统计
- [`0686e87`](https://github.com/noctisynth/Yakumo/commit/0686e8752634caff25dc5cf37aec7099b63bfde3): Initialize the privacy-focused Tauri and React application with Tailwind CSS, typed state and routing, and stable Rust.

    Add a shared-version Semifold workspace, release metadata checks, desktop GitHub CI/CD, and alpha application release automation.

- [`e82de2f`](https://github.com/noctisynth/Yakumo/commit/e82de2fc86766048ecdfa70239386da1ea4a5029): 移动端改用四项底部导航和独立个人空间，统一未登录卡片圆角
- [`5e97f33`](https://github.com/noctisynth/Yakumo/commit/5e97f3352fb2acf7098ba3065404a90ad78ed424): Support multiple school accounts with native RSA login, encrypted local sessions, explicit account switching and removal, and expiry feedback.
- [`69861bb`](https://github.com/noctisynth/Yakumo/commit/69861bbdb3399ec8613dbf51f0791887b2cae976): 新增原生可复现轨迹生成、参数预览、一致性检查及合成来源导出
- [`d0ba4e9`](https://github.com/noctisynth/Yakumo/commit/d0ba4e963d2aa85b61593447cd2ece8e41158cf7): 新增学校只读数据大盘、配置查询、记录筛选与详情，并隔离账号及迟到响应
- [`c0567ba`](https://github.com/noctisynth/Yakumo/commit/c0567bab07ba2ce9cd7cea88e0a25dd4e52cba8d): 为 Android 配置长期发布签名、v2/v3 与 16 KB 校验和云端安装验证，发布等待全部跨平台产物通过
- [`8c8358d`](https://github.com/noctisynth/Yakumo/commit/8c8358d81de0933636e886eac9c10a8ca6feb18a): 工作室接入真实地图选点、偏移范围、加密预设及 Stepperize 四步流程
- [`b67b070`](https://github.com/noctisynth/Yakumo/commit/b67b070cfecd9097ef9c99a749f9cc3c64f093c2): 重排工作室地图与参数布局，默认闭合路线并按选线估算里程；增加客户端安全门禁、头像显式更新与刷新，按领域重组 Rust 实现。
- [`ddf95d9`](https://github.com/noctisynth/Yakumo/commit/ddf95d9c86439011ea78a10dab283b2b31e46950): 支持多点地图路线、沿线速度变化和加密路线预设，保留合成来源与一致性验证。
<!-- semifold:release:end -->
