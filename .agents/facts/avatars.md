# 当前用户头像

文档编号：FACT-006。状态：Verified within stated scope。更新：2026-10-15。
证据：EV-17。仅迁移去身份化读取事实，不包含头像图片、私人地址或账号信息。

GET /upms/basUser/getLoginUserInfo 的展示头像字段是 data.imageRouteUrl 字符串。
原生 MyFragment.g、wj0.e、kn.g、h26.f 将此字段交给 q93.f 图片加载器；空值或失败使用默认资源。
四份历史 HTTP 200/code=0 响应中该字段为空字符串；先前只读响应 Schema 也存在此字段。
空字符串不是接口错误。非空值的完整 URL、协议相对或路径相对形态尚未穷尽。

avatarUrl 是 H5 本地缓存键，不是当前用户信息接口字段。collectPhoto 是旧界面字段，
H5 回调会从本地缓存主动赋值，不能据此认定当前接口返回它。旧 LoginUser.headImageUrl
不能替代新版 imageRouteUrl。展示头像与人脸采集照片分别处理。

静态代码还出现图片上传及保存头像逻辑，但未捕获对应写入请求或响应，当前 UI 入口及
服务端可用性均未确认。本轮只接入展示，不上传图片、不修改用户资料。
一次新增只读验证未收到 HTTP 响应，不能增加当前在线可用性结论。

再次核对 EV-17 静态材料：上传候选路由为 /file/fileObject/upload/image/sample，回调读取
data.filePath 与 data.httpUrl；保存候选路由为 POST /upms/basUserImage/saveImgPath，表单 imgPath
取 filePath，不能取展示 URL。上传 method、multipart 字段名、大小格式限制及完整响应仍未确认，
当前渲染未绑定上传组件，无对应写入抓包，故不认定已证实可更换头像。
