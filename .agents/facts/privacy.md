# 权限与通信证据

文档编号：FACT-005。状态：Observed facts。更新：2026-10-14。
证据：EV-01、EV-05、EV-16。

## 已观察到的事实

- Manifest 权限名从旧版 43 个变为新版 41 个，移除了 READ_EXTERNAL_STORAGE 和
  WRITE_EXTERNAL_STORAGE；没有新增权限名。数量不是权限必要性的证明。
- 真机实际连接学校服务的 TCP 80 端口，HTTP 正文中可见完整 Bearer、刷新令牌及用户资料字段。
  这些是实际明文传输证据，不只是静态 SDK 或权限推测。业务 param 加密不保护 HTTP 认证头。
- 用户信息响应包括 userName、cardNum、学院、专业、班级、校区等字段；上下文只保留类型。
- 观察到友盟 utoken.umeng.com、ulogs.umeng.com，高德多个域名，以及
  sdk-report.beizi.biz、yumao.puata.info、infrasec-openapi-cn.heytapmobi.com、
  cdn.dcloud.net.cn、m.boxkj.com 的实际双向通信。另一批连接还包括 android.bugly.qq.com
  和 report.idazhe.net。域名与流量不能单独证明每个第三方收集了什么个人信息。
- 两次 sdk-report.beizi.biz 的日志 POST 返回 HTTP 200/业务 code=200，声明
  application/octet-stream 和 Accept-Encrypt。正文导出出现大量 U+FFFD 替换字符，原始
  二进制已经丢失，不能据此还原具体上报字段。需要原始包字节才能进一步分析。

## 证据边界

CSV 只含连接元数据，既不能确定 API 请求，也不能将“连接已关闭”当成功状态。
HTTP 文本导出按严格交替顺序配对，没有独立 TCP 流重组证据；HTTPS 域名没有同等正文证据。
H5 提取到的 38 个 API 字面量是候选集合，不是已调用接口数量。
权限、SDK、第三方连接和具体敏感内容四种证据强度不同，不能相互代替。
本项目记录可验证的隐私问题，不把“违法”作为已经得到证实的工程结论。

## 对产品的约束

依据 SPEC-001，不引入广告和无关遥测；以实际功能需要为权限边界。
学校 HTTP 是已知兼容性事实，产品应明确展示传输方式，不把应用层加密标为端到端传输安全。
不得静默关闭 TLS 校验或把学校认证头转发到无关域名；重定向、目标主机和协议需明确校验。
公开上下文和测试夹具不存私人会话、用户资料、真实坐标、设备标识或记录标识。
历史私有数据使用的 Windows DPAPI 只是当时的保护手段，不是新的跨平台存储方案。
