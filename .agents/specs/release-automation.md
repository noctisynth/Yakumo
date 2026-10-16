# 版本管理与 GitHub 自动化

文档编号：SPEC-003。状态：Active。更新：2026-10-14。
依据：用户授权配置 Semifold、changeset、GitHub CI/CD，创建并推送组织内的公开仓库 Yakumo。

自动更新签名、清单生成与发布后推进 update-channel 的新增门槛见 SPEC-010。正式发布缺少
长期 updater 密钥或公钥即失败，不继承过去未签名产物的验证结论；既有 Release 不补传或覆盖。

## 版本与发布单元

八云爱作为一个应用发布单元，由 Semifold 的 rust 适配器管理 yakumo。
建立单成员 Cargo workspace；共享版本作为唯一权威来源，成员继承该版本。
前端版本通过 post-version 脚本同步，Tauri 配置读取前端版本；锁文件同时更新并校验。
前端是内部应用工程，不独立发布到 npm；原生 crate 不发布到 crates.io。
正式发布通道为 stable，不保留初次发布的一次性 channel-bump 覆盖。首个正式版本为 0.1.0。stable Rust
仍为编译工具链要求；产品发布通道由发布配置单独决定。版本提升与变更集消费由发布自动化执行。

## 自动化流程

采用 main 基础分支与独立 release 自动化分支。Semifold 固定使用本轮验证的 0.3.4。
有待处理 changeset 时，质量检查通过后由 semifold ci 创建或更新 release PR。
发布 PR 包含共享版本、派生版本、锁文件及 changelog 修改，合并前必须经过质量检查。
没有 changeset 且当前版本有 changelog、尚无对应 GitHub Release 时，构建 Windows x64、
Linux x64、macOS arm64 和 x64 的桌面附件，以及通过签名和安装检查的 Android 通用 APK/AAB，
全部成功后由 Semifold 创建 Release 并上传。Android 细节与当前验收范围见 SPEC-009、TASK-003。
已经存在的 Release 不自动覆盖或补传附件，失败恢复需要检查实际资产状态。
原始软件包注册表的检查和发布均禁用，只启用应用的 GitHub Release 与附件。

## CI 边界

PR 与 main 执行冻结依赖安装、Biome、类型检查、前端构建、版本一致性、Rust 格式、Clippy 和测试。
原生构建按桌面系统安装系统依赖；缓存按 workspace 组织。发布矩阵成功不等于真机业务验收。
PR 仅执行受限质量检查；可信 main 的发布 job 才持有必要的 contents 与 pull-requests 写权限。
主流程串行管理发布状态，不并发更新 release 分支；引用的 Actions 固定到已核对的提交。
本轮公开仓库推送只包含源码、工程上下文、配置和锁文件，排除构建、私人数据及临时验证产物。

## 验收

Semifold 初始化和配置同步检查成功，changeset 的 status 展示符合预期；预演不消耗 changeset。
验证派生版本同步、冻结锁文件和工作流语法；运行与 workspace 迁移相称的现有检查。
确认远端仓库精确名称为 Yakumo、归属 noctisynth、可见性为 public，推送后检查实际 Actions 状态。

移动构建仅在线执行，Android 缺失签名凭据、身份不匹配、签名方案或对齐不合格时终止发布。
手动跨平台预览与 Android 签名验证只上传 Actions 附件，不创建正式 Release 或合并发布分支。


系统产品名与安装程序统一使用 Yakumo（首字母大写），默认安装目录、快捷方式及系统卸载条目
由该产品名生成。产品标识 app.yakumo.client 保持稳定，应用内中文品牌不随打包名更换。


## 首次正式发布授权与基线

2026-10-15 使用者明确授权推送、合并发布分支，并要求 preserve 基线、正式发布 0.1.0。
已生成的发布分支基线为 0.1.0-alpha.0；发布前对齐该基线及派生版本，移除 alpha 通道设置，
由 Semifold 将全部待处理变更晋升为 0.1.0。不能将稳定基线误提升为 0.2.0，不能手改变更集
提升等级或手工消费来绕过计划。正式发布 PR 必须包含 0.1.0 的版本、锁文件与变更日志，
通过当前提交的质量检查后合并，再检查正式标签、GitHub Release 与跨平台附件。


## 0.1.1 修复发布授权

2026-10-16 使用者授权完成 changeset、提交、推送，在当前提交质量验证通过后合并 release 分支，
发布 0.1.1。此次为修复发布，全部待消费变更集使用 patch，不引入 minor 提升，保留 preserve 配置。
项目地图 Key 通过本地环境文件与仓库 Actions 变量配置，原始临时文本已删除，值不进入 Git。


## 后续通道策略调整（本地提交，未推送）

2026-10-16 使用者要求移除一次性 channel-bump = preserve 配置，后续授权本地提交，不推送。
当前 stable 版本继续由 Semifold 根据 changeset 自动提升。以后切换到 alpha 等命名通道时，
按当次发布计划确定新的基础版本，不沿用首次发布时保留基础版本的覆盖策略。
0.1.1 已合并提交及其线上构建不包含这项后续本地调整；前述 preserve 要求保留为发布历史。
