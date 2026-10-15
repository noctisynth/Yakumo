# 当前用户头像

文档编号：FACT-006。状态：Verified within stated scope。更新：2026-10-15。
证据：EV-17、EV-18。仅迁移去身份化读取事实，不包含头像图片、私人地址或账号信息。

GET /upms/basUser/getLoginUserInfo 的展示头像字段是 data.imageRouteUrl 字符串。
原生 MyFragment.g、wj0.e、kn.g、h26.f 将此字段交给 q93.f 图片加载器；空值或失败使用默认资源。
四份历史 HTTP 200/code=0 响应中该字段为空字符串；先前只读响应 Schema 也存在此字段。
空字符串不是接口错误。非空值的完整 URL、协议相对或路径相对形态尚未穷尽。

avatarUrl 是 H5 本地缓存键，不是当前用户信息接口字段。collectPhoto 是旧界面字段，
H5 回调会从本地缓存主动赋值，不能据此认定当前接口返回它。旧 LoginUser.headImageUrl
不能替代新版 imageRouteUrl。展示头像与人脸采集照片分别处理。

EV-17 历史阶段：静态代码还出现图片上传及保存头像逻辑，但未捕获对应写入请求或响应，当前 UI 入口及
服务端可用性均未确认。本轮只接入展示，不上传图片、不修改用户资料。
一次新增只读验证未收到 HTTP 响应，不能增加当前在线可用性结论。

再次核对 EV-17 静态材料：上传候选路由为 /file/fileObject/upload/image/sample，回调读取
data.filePath 与 data.httpUrl；保存候选路由为 POST /upms/basUserImage/saveImgPath，表单 imgPath
取 filePath，不能取展示 URL。上传 method、multipart 字段名、大小格式限制及完整响应仍未确认，
当前渲染未绑定上传组件，无对应写入抓包，故不认定已证实可更换头像。


## EV-18 修订：已捕获的头像更新合同

POST /upms/basUserImage/uploadBase64Pic 使用 application/x-www-form-urlencoded，唯一业务字段
为 bas64Pic（保留原拼写），值为完整 data:image/png;base64,... 数据 URI，表单只编码一次。
携带学校身份头、会话 Authorization、毫秒 timestamp 与 H5 sign。固定 H5 appId 为
c9292ee89d2f49492f983f5931af0d09；派生 appId 和 appSecret 后，将 appId、appSecret、bas64Pic
三个原始键值片段排序连接再摘要。Base64 的加号参与原始签名，不先按表单解码为空格。

成功响应 code=0，data.imageRoute 为路径，data.imageRouteUrl 在观察样本中为 null。
该调用已完成头像绑定，不追加旧 saveImgPath。随后 GET /upms/basUserImage/getBasUserImage
返回图片 URL，当前用户接口的 data.imageRouteUrl 也返回新头像。查询参数可变，不能按 URL
全字符串判断是否同一图片。头像展示字段仍为 imageRouteUrl，并非 avatarUrl。

观察成功 PNG 为 504×504、283184 字节。此尺寸是样本，不是服务端唯一格式或大小约束；
旧候选上传路由不能替代此次已捕获合同。原有 256 KiB 本地缓存上限不足以容纳该样本，
产品调整为 2 MiB，并增加显式刷新，不将缓存失败解释为学校不存在头像。
