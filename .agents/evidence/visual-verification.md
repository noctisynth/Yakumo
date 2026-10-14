# 角色品牌与页面改版验证

文档编号：CHECK-007。状态：Verified within stated scope。更新：2026-10-15。
规范：SPEC-007、SPEC-006。

## 资产及生成记录

使用内置 imagegen 生成，未使用 CLI 或外部 API 密钥。头像为生成式同人图，不是官方立绘。
方形母版名 yakumo-portrait.png；界面用 yakumo-mark.png，浏览器用 yakumo-favicon.png。
Tauri 图标工具从同一母版生成桌面及移动规格，不把移动规格生成等同于移动平台运行验证。
所有运行引用资产均随项目保存，无外部图片请求。用户头像仍由原账户 Avatar 展示。

最终生成提示词原文：

> Use case: logo-brand. Create ONE finished square 1024x1024 anime character portrait app icon for a desktop app named Yakumo, no text. Touhou Project Yakumo Ran inspired fan illustration: adult kitsune woman with short golden blonde bob, fluffy golden fox ears, luminous amber eyes, a gentle confident smile, white and deep indigo blue traditional outfit, white soft cap with blue trim and a small red decorative ribbon, hint of fluffy golden fox tail behind shoulder. Tight head-and-shoulders closeup face fills 65 percent of frame, centered face, eyes at 45 percent height, entire cap and fox ears visible with 8 percent safe margin, clean identifiable silhouette at 32px. Premium polished anime game launcher portrait icon composition like modern character-focused gacha app icons, crisp elegant cel shading, carefully drawn eyes and hair, restrained fine highlights, no 3D. Deep midnight indigo background with flat warm gold circular halo behind head; limited indigo, ivory, golden amber palette. Full bleed square image with opaque background; no rounded-corner mask baked in, no border, no logos, no typography, no watermark, no clouds, no scenery, no extra characters. Charming mature expression, nonsexual, visually clean and professional. Save final image to a local file and return file path as well as image.

## 验证

Biome、应用与配置类型检查、前端生产构建通过；账号和大盘 5 项测试、41 个断言通过。
Windows x64 Tauri debug 应用包含新图标完整构建通过；未制作安装包。
浏览器使用合成账号及模拟原生命令验证登录跳转、大盘未知值、记录状态和日期筛选、日期分组、
详情及返回、独立配置页手动坐标查询、部分失败保留值、迟到账号响应丢弃和账号切换后筛选重置。
无页面错误及外部请求。截图检查桌面大盘、360 像素大盘和记录，以及深色记录与配置页，无横向溢出。
移除云朵图标引用，品牌图标在侧栏及浏览器使用本地小尺寸衍生图。

未改动原生学校协议；本轮没有真实学校请求、开始运动或上传。未验证 macOS、Linux 或移动端运行。

## 暗色层次修订

按用户反馈将内容区与卡片压深为低饱和靛灰，保持金色点缀；账户按钮外层移除背景与内边距，
只保留按钮自身轮廓。Biome、类型检查和前端生产构建通过。本地浏览器验证深浅切换、
桌面与 360 像素无溢出，确认账户外层透明，无页面错误；等待颜色过渡结束后检查截图。
