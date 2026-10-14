# 应用骨架初始化验证

文档编号：CHECK-001。状态：Verified within stated scope。更新：2026-10-14。
对应规范：SPEC-001、SPEC-002；实施清单：TASK-001。

## 实际环境与依赖

| 项目 | 本次验证版本 |
|---|---|
| Rust stable / Cargo | 1.98.1 / 1.98.1 |
| Rust 目标 | x86_64-pc-windows-msvc |
| Node.js / Bun | 22.22.3 / 1.4.2 |
| Tauri Rust / JavaScript API / CLI | 2.12.3 / 2.12.3 / 2.12.2 |
| React / React DOM | 19.3.0 |
| React Router / Zustand | 8.4.0 / 5.0.15 |
| Vite / TypeScript | 8.3.4 / 7.0.2 |
| Tailwind CSS / Vite 插件 | 4.3.3 |
| Biome | 2.5.15 |
| shadcn CLI | 4.21.4；Radix Nova 预设 |

上述是已安装并验证的组合，不代表所有依赖的长期最低兼容版本。
前端锁文件和 Cargo 锁文件保留完整解析结果；Rust 工具链选择 stable 通道，不固定 nightly。

## 功能与工程验证

前端包含首页、设置、404、HashRouter 导航；Zustand 保存本次运行内的主题和紧凑布局设置。
shadcn 基础组件包括 Button、Badge、Card 和 Switch。Tailwind 通过 Vite 插件构建，
页面和组件未新增独立原生 CSS；全局样式仅包含入口、主题及必要基础规则，字体从本地资源加载。

- Biome 格式、lint、文件命名及 import 检查通过；配置两空格、单引号与 Tailwind 指令解析。
- 应用代码及构建配置的 TypeScript 检查通过，Vite 生产构建通过。
- stable Rust 格式与 Clippy 全目标检查通过；Rust 测试入口和文档测试通过，当前为零用例。
- Windows x64 Tauri debug 无安装包构建通过；实际启动后可加载打包页面并使用 HashRouter。
- 真实 Rust IPC 返回应用名“八云爱”和版本 0.1.0，前端显示原生运行环境。
- Edge 无头浏览器验证导航、深浅主题、系统主题变化、设置恢复、紧凑布局和键盘跳转入口。
- 390px 窄屏的首页和设置页无横向溢出；已检查桌面及窄屏截图。
- 浏览器检查期间无页面运行时错误或外部请求。

验证通过临时浏览器工具和本机 WebView 调试连接完成，工具及截图不属于产品代码或公开夹具。
未将调试端口写入应用配置；本轮未登录业务账号、调用学校接口或提交运动记录。

## 覆盖限制

仅验证当前 Windows x64 原生目标和浏览器响应式布局，未验证 macOS、Linux、Android 或 iOS。
未生成安装包、签名或发布。原版协议事实尚未移植为新客户端的业务实现；本次不新增服务端接受性结论。
原生命令仅提供公开应用信息；本轮未引入网络、shell、文件或外部链接插件及其权限。
