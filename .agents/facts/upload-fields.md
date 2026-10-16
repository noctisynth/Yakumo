# 上传字段字典

文档编号：FACT-003。状态：Observed client contract。更新：2026-10-14。
证据：EV-06、EV-09、EV-11、EV-12；结构化对照：DATA-002。

## 1. 顶层字段并集

共 38 个键，包含原生追加的 v。实际请求随空值及本地缓存分支变化；这里不声明服务端 required。
timestamp、sign 和认证属于请求层，不是下面的业务 JSON。

| 字段 | JSON 类型 | 语义、来源或条件 |
|---|---|---|
| sportType | integer | 来自配置 runType，客户端默认 1；完整枚举未知 |
| startTime | integer | Unix 毫秒；初始化时使用时间基准加单调时钟增量，或设备时间 |
| endTime | integer | Unix 毫秒；服务端基准加单调时钟增量，缺失时回退设备时间 |
| sportTime | integer | 有效运动秒数，暂停不累计 |
| sportRange | string | 复核距离，公里；从米转换，向下保留两位小数 |
| speed | string | 每公里配速，分秒形式，例如 7'25"；不是瞬时速度 |
| avgSpeed | string | 平均速度，公里每小时 |
| brand | string | 原版设备制造商，首字母大写 |
| model | string | 原版设备型号 |
| system | string | 原版 Android 或 HarmonyOS 分支 |
| version | string | 操作系统版本 |
| appVersion | string | 原版应用版本名，异常分支默认 1.0 |
| pointList | string | 配置必经点数组的 JSON 文本，保留配置额外键 |
| stepNumbers | string | 每分钟有效运动步数增量桶的 JSON 文本 |
| isSequencePoint | string | 必经点顺序配置，完整枚举未知 |
| gitudeLatitude | string | 轨迹数组 JSON 文本；保留原协议拼写 |
| okPointList | string | 已通过检查点数组 JSON 文本 |
| isFaceStatus | string | 本地人脸状态 true 对应 "1"，否则 "0"；不是开关或服务端结论 |
| uploadType | integer | 本地类型转整数；serverUnavailable 分支强制 8；其他枚举未闭合 |
| identify | string | 当前设置优先，否则客户端生成 UUID；关联运动、缓存和重试 |
| geofence | string | 配置多边形数组的 JSON 文本 |
| limitSpeed | string | 配速边界；默认由 m/s 转 min/km；具体学校规则仍需核对 |
| limitStride | string | 来自 endStride 或默认步幅边界；学校单位及校验未穷尽 |
| limitStepFrequency | string | 来自 endLimitStepFrequency 或默认步频边界 |
| gpsDistance | string | GPS 累计距离，公里；与 sportRange 独立，向下保留两位 |
| appType | string | 原版固定 Android；替代客户端的映射策略尚待设计 |
| versionCode | integer | 原版安装包版本号；静态样本 20240 |
| versionName | string | 原版安装包版本名；静态样本 2.0.24 |
| signatureMD5 | string | 原版签名摘要相关公共参数；与 v 的 SHA256 链不同 |
| uniqueCode | string | 原版设备标识，涉及标识生成、MD5 和缓存；失败分支未完整核对 |
| d | integer | 开发环境开关贡献 0 或 1，再加确认计数 |
| f | integer | 点级 f 为 true 的数量；轨迹解析为 null 时可被省略 |
| m | integer | 点级 m 为 true 的数量；轨迹解析为 null 时可被省略 |
| h | integer | 点级 h 为 true 的数量；轨迹解析为 null 时可被省略 |
| remarkId | string | 按 identify 查询的缓存关联值，非 null 才写入 |
| isValid | integer | 本地 momentIsValid 整数列，非 null 才写入；不是服务器有效判定 |
| environment | object | 缓存设备环境存在才写入；deviceId、oppo、safe 为字符串，可有 null |
| v | string | 原生封包追加或覆盖的证书校验材料，见 FACT-002 |

五个内嵌 JSON 字符串字段为 pointList、stepNumbers、gitudeLatitude、okPointList、geofence。
不能把它们直接改成外层数组。environment 是真正的对象。默认 Gson 会省略对象 null，
但保留 0、false 和空串；空数组文本 "[]" 与字段缺失不是同一含义。

## 2. 轨迹点 11 个字段

| 字段 | 类型 | 语义 |
|---|---|---|
| a | number | 纬度，度 |
| o | number | 经度，度 |
| t | integer | 定位时间，Unix 毫秒 |
| s | number | 初始定位速度，可被相邻点距离除时间差覆盖，米每秒 |
| i | boolean | 暂停或停止累计状态 |
| l | integer | 高德定位类型；完整枚举未知 |
| c | integer | 累计有效运动秒数 |
| e | integer | 累计有效步数 |
| f | boolean，通常缺失 | Android isFromMockProvider 为真时赋 true，默认 null 被省略 |
| m | boolean，通常缺失 | 高德 isMock 为真时赋 true，默认 null 被省略 |
| h | boolean，通常缺失 | 高德高风险模拟定位应用标记为真时赋 true，默认 null 被省略 |

原版相邻点速度函数在时间差为零时返回距离值，这是兼容性观察，不是合理速度定义。
坐标来自高德，观察到客户端未转 WGS84；不能把所有地点或全部样本笼统标为 WGS84。
点级 f/m/h 是可空布尔，顶层同名字段是计数，不可互换。普通点布局缺失这些键不证明轨迹真实。

## 3. 检查点、围栏和步数

okPointList 元素明确包含六键：id(string)、time(string)、content(string)、latitude(number)、
longitude(number)、sort(string)。time 格式 yyyy-MM-dd HH:mm:ss，原版指定 Locale.CHINA，
未显式指定时区，来自设备 Date；不同于服务器时间基准。
pointList 读取服务端配置 list，客户端消费 id、content、latitude、longitude、sort；额外键保留。
geofence 为多边形数组，顶点读 lat/lng 并转 double，但上传保留配置原始标量类型。

stepNumbers 每 60 个有效运动秒形成步数增量桶，结束时处理未满一分钟的剩余步数。
它不是累计总步数数组或时间戳列表；分桶总和须与最终累计步数一致。
暂停导致 sportTime 与 endTime-startTime 不必相等；不能总把墙钟差直接作为有效运动时长。

## 4. 实测对照及类型差异

原版 HAR 上传包含全部 38 键、787 点、15 个分钟桶；点级 f/m/h 缺失而顶层计数存在。
pointList、okPointList、geofence 均为字符串空数组，environment 三键为字符串。
这不证明其他账号没有必经点、围栏或设备要求。

成功合成样本上传 sportRange="2.02"，详情返回 "2.020"；上传 sportTime 为整数，详情是 "899"。
上传轨迹为字符串，详情返回 900 项数组。线上数据与领域模型应明确转换，不靠自动强转掩盖差别。
DATA-002 描述样本字段集合，不设置 required；嵌套 contentSchema 只是描述，不能假定所有
JSON Schema 校验器会解析字符串内 JSON。


## 5. 非空围栏静态消费路径复核

2026-10-16 静态复核 V3GeoFenceObserver.onCreate/d：读取 geofence 文本并解析为多边形列表，
每个顶点 lat/lng 转为 double 后直接构建高德 DPoint 和 LatLng，分别交给 GeoFenceClient
和地图 PolygonOptions，没有观察到该路径中的坐标转换。j 方法根据进入/离开状态暂停和恢复。
结合高德公开的 GCJ-02 坐标参照说明，当前契约按高德坐标消费；此结论来自静态消费路径与 SDK
文档，不是新增服务端坐标声明，也不证明服务端最终校验策略或账号间配置一致。
用户报告校内数据被本客户端拦截，同时报告外省曾正常上报，未提供对应配置对照；两项均仅记为
用户确认，不能替代响应证据。原版 SDK 生命周期与离线上报前的完整轨迹检查是不同执行机制。
参考：https://developer.amap.com/api/javascript-api/guide/abc/basetype 。
