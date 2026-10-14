# 身份、签名与上传协议

文档编号：FACT-002。状态：Verified within stated scope。更新：2026-10-14。
证据：EV-03 至 EV-09、EV-12 至 EV-15；新增公开材料离线核对见 CHECK-006。这里的斜杠字符串均为网络 API 路由。

## 1. 学校与身份

首个验证对象为西南石油大学，schoolCode=swpu，学校 ID=454。
历史配置服务基地址为 `http://tygl.swpu.edu.cn/`；真机抓包证实实际使用 HTTP。
HTTPS 曾握手失败，不代表它永远不可用；未通过禁用 TLS 验证绕过失败。
isOpenEncry="0" 不代表免签名。某次 HTTP 入口返回 HTML，尽管 Content-Type 声明 JSON；
客户端须实际解析和分类响应，不能只信响应头。学校目录曾返回 363 条数据而 total=0。

新版登录顺序：获取 RSA 公钥 → RSA PKCS#1 v1.5 加密密码 UTF-8 字节 → 标准 Base64 →
前缀 `RSA:` → 登录请求。观察到的公钥为 2048 位。
登录参数为 username、password、grant_type=password、type=app、appType=stuApp；
客户端另带 school、Cookie、设备标识、model 和 Basic 客户端认证信息。
Basic 常量不在本上下文中复制；后续接入须核对其对应客户端版本，不能猜值。
旧版 AES/CBC/NoPadding、补零、Base64 登录是历史结果，不是新版合同。

登录响应观察到 access_token、refresh_token、token_type、expires_in、scope、license、
dept_id、user_id、username、apps。实际刷新抓包使用 grant_type=refresh_token，另有
refresh_token、scope、type、appType 参数；成功响应并不证明所有失效或轮换分支已验证。
原始 appId 从 getAppid 获取，公共请求带 school 与 Cookie host，历史无账号请求成功。
不能把学校 openId 当作原始 appId，也不能把派生 appId 当成其替代。

## 2. 已关联的路由

| 功能 | 方法与网络路由 | 参数及证据边界 |
|---|---|---|
| 登录公钥 | GET /auth/rsa-public-key | 新版登录公钥，不是上传内置公钥 |
| 登录及刷新 | POST /auth/oauth/token | 登录和刷新样本参数位于 Query；避免 URL 日志泄漏 |
| 原始 appId | GET /upms/sysSchool/getAppid | school、Cookie host |
| 当前用户 | GET /upms/basUser/getLoginUserInfo | 已观察到成功响应 |
| 运动配置 | GET /exercise/exerciseSetting/2a36d143/getSetting | Query key、param；data 加密 |
| 开始基准 | GET /exercise/exerciseSetting/2a36d143/getExerciseStartTime | Query identify；data.startTime 整数；可能产生状态 |
| 上传 | POST /exercise/exerciseRecord/2a36d143/addExerciseRecord | 表单 key、param |
| 缓存记录检查 | POST /exercise/exerciseRecord/checkExerciseRecord | 表单 identifys；返回标识到字符串的映射；完整语义未知 |
| 汇总 | GET /exercise/exerciseRecord/sumExerciseRecord | 无业务参数 |
| 统计 | GET /exercise/exerciseRecord/statisticsExerciseRecord | 无业务参数 |
| 列表 | GET /exercise/exerciseRecord/2a36d143/listExerciseRecord | status、datePageIndex、date；抓包还见 isFeedback |
| 详情 | GET /exercise/exerciseRecord/2a36d143/getExerciseRecord | exerciseRecordId |

上传的 Retrofit 表面声明为 app/addExerciseRecord，经注解和原生映射转换。
列表 status=1 为已验证有效记录查询；抓包还见 0，空串曾返回 500/code=1。
datePageIndex 样本为 1，date 可为空；不据此穷尽所有查询约束。

## 3. 公共请求头与签名

学校登录后的请求包括 Bearer Authorization、school、Cookie 的 host 值、uniqueCode、
timestamp、sign。timestamp 为 Unix 毫秒十进制字符串。上下文不保留任何会话值。

令 T 为 token，S 为 timestamp，A 为原始 appId：

```text
h = lowercase_hex(MD5(UTF8(T)))
K = ASCII(h 的前 16 个字符)
IV = ASCII(h 的后 16 个字符)
F(x) = lowercase_hex(MD5(Base64(AES-128-CBC-PKCS7(UTF8(x), K, IV))))
derivedAppId = F(A + T + S)
derivedAppSecret = F(T + S)
sign = F(URLDecodeOnce(canonical_join(parameters 与两个派生字段)))
```

拼接无额外分隔符；Base64 标准编码且不换行。MD5 的文本字符作为密钥字节，不能把 MD5
十六进制解码后再分半。canonical 按 C++ 字符串字节序排键，以 key=value 和 & 拼接，无尾部 &。
URL 解码在整条拼接字符串上只执行一次；原始 `+` 转空格，百分号解码产生的 `+` 不再递归处理。

GET 拦截器按每个查询名称取首个值，null 转空字符串，移除 LF，然后写入两个派生字段。
timestamp/sign 放请求头；timestamp 不自动追加为业务 Query。
普通 FormBody 按解码后的 name/value 遍历入 Map，重复键最后一个覆盖，随后派生字段覆盖同名值。
不能用统一查询多值策略替代这两种不同分支。

其他静态分支：multipart 使用抽取的文本 part，文件元数据 Map 不加入该签名 Map；
application/json 使用整段 UTF-8 正文作为一个键、值为空串，再加入派生字段。
m.boxkj.com 表单使用另一套固定应用参数和旧 MD5 分支；空 body 及其他类型不得猜成 FormBody。
这些分支没有同等强度的服务端验证，当前跑步适配应以 GET 和普通 FormBody 为范围。

## 4. 上传封包

令 C 为原版 APK 签名证书 DER，P 为内置上传 RSA 公钥。公开材料及 SHA-256 保存在 DATA-001。

```text
K_upload = ASCII(lowercase_hex(MD5(UTF8(T + S))) 的前 16 个字符)
fingerprint = SHA256(C) 的大写十六进制，逐字节以冒号分隔
stamp = Base64(SHA256(UTF8(fingerprint)) 的原始 32 字节摘要)
payload.v = Base64(AES-128-ECB-PKCS7(UTF8(stamp), K_upload))
key = Base64(RSA-PKCS1-v1_5(K_upload, P))
param = Base64(AES-128-ECB-PKCS7(UTF8(native_json_dump(payload)), K_upload))
```

ECB 没有 IV，与 sign 的 CBC 不同。stamp 不能使用 SHA256 的 64 字符十六进制文本替代摘要。
RSA 使用随机填充，同一密钥的 key 密文可以不同；不能以全部密文字节相同为通用验收条件。
只持有公开上传公钥，没有获得服务端私钥。原生返回数组的第 0 项是 Base64(K_upload)，
第 1 项是表单 key，第 2 项是 param；第 0 项不是上传表单 key。
上传公钥和登录动态公钥用途不同。signatureMD5 与 v 的证书 SHA256 链也不能互换。
本次静态绑定追踪将 Transform.a(Context) 关联至 native_auth_5dm；使用公开证书、建模 JNI
和原生 MD5 实现离线执行，结果为 `7F:C0:22:E6:7C:7D:2A:CC:C3:C8:77:0A:46:13:8D:C3`，
与证书 DER 的冒号分隔大写 MD5 一致。这是公开兼容材料的离线核对，不是设备证明或线上验收。
原版公钥、证书及版本值属于协议兼容材料，不证明替代客户端已通过原设备证明。

## 5. JSON 兼容性

Java 默认 Gson 省略对象 null 值，保留空字符串、0、false。原生解析、覆盖 v、按键排序后
紧凑输出 JSON；原生对输入中已存在的 null 则会保留。
中文与转义、嵌套结构、毫秒长整数、整数边界、负零及指数均有离线样例。
原生浮点 1000000000000000.0 输出为 1e+15；不能默认 Rust 序列化输出与该行为完全相同。
超出原生 64 位整数范围、非有限浮点及未覆盖临界舍入需显式处理。
主要上传数值为整数；轨迹浮点在 JSON 字符串内部，原生不会再次格式化其内容。

## 6. 上传的双层表单编码

Content-Type 为 application/x-www-form-urlencoded。原版先对 key/param 的原始 Base64
执行 Java URLEncoder，再由 OkHttp 普通 FormBody 编码一次。

| 层 | 演示值 |
|---|---|
| 原始 Base64 | ++//AA== |
| 预编码 | %2B%2B%2F%2FAA%3D%3D |
| 线上字段 | key=%252B%252B%252F%252FAA%253D%253D |
| FormBody.value | %2B%2B%2F%2FAA%3D%3D |
| canonical 解码后片段 | key=++//AA== |

签名 Map 排序后依次为 appId、appSecret、key、param。key/param 在 Map 中处于预编码层；
拼接后 URL 解码一次，再执行 F。不得直接签线上表单字节，或把加号最终变为空格。
派生 appId/appSecret 仅参与签名，不追加进该表单或单独请求头。
该分支不额外把方法、路由、school、Cookie、uniqueCode、Authorization 或 URL Query 加入 Map。

包装与签名须使用同一 S 和 T。构建器只构造请求，不发送；诊断中不得暴露 canonical、
派生材料、完整请求或本地 AES 密钥。
正常上传都是 ASCII 字段和合法 Base64；拒绝畸形百分号转义，不能宣称通用解码器完全等价。
原生 %GG 与常见通用解码器结果不同；JNI 补充字符、孤立 surrogate 等边界尚未穷尽。

## 7. 配置与响应

配置请求观察到包装后的 common 客户端字段、latitude、longitude、runType；其 key/param
作为 GET Query 只经查询层编码，不套用上传 POST 双层预编码。
配置响应 data 使用同请求 T、S 推导的 K_upload 做 Base64/AES-ECB/PKCS7 解密，所得 JSON
在两份原版响应中均包含 49 字段。字段类型保存在 DATA-001，详见 FACT-004。

上传响应静态模型包含 code(Integer)、msg(String)、data(Object)、exerciseRecordId(String)。
真实测试观察到 data(Boolean)，不可据此把全部响应固定成 Boolean 或把静态 Object 当值。
原版使用 JSON converter 并消费 msg/recordId；没有正常空正文默认成功的证据。
非 JSON、超时、业务拒绝、HTTP 异常和入库后无效须分别处理。

列表中的数字和状态常以字符串返回，许多字段可 null；详情轨迹可直接是数组，而上传轨迹为
JSON 字符串。详情 avgSpeed 的实测拼写为 avgspeed，不得把请求 DTO 直接当响应模型。
汇总分组包括 directionRun、IndoorRun、morningRun、freedomRun、exerciseSite、sunRun；
统计存在 all、week、month、years、sysTerm。未知字段应保留兼容空间。

## 8. 可直接用于移植对照的合成向量

以下全部为明确的合成测试输入，来自 EV-07；不是可用账号或线上会话。该向量验证派生、
表单和 sign，不是合法 RSA 上传密文，也不得提交到服务端。

```json
{
  "syntheticToken": "test-token",
  "timestamp": "1700000000123",
  "rawAppId": "test-app",
  "rawKey": "++//AA==",
  "rawParam": "AA==",
  "derivedAppId": "3af3a313ee0c47461187784299bac29b",
  "derivedAppSecret": "5f63882c88c1985206573379a519a6e7",
  "wireBody": "key=%252B%252B%252F%252FAA%253D%253D&param=AA%253D%253D",
  "canonical": "appId=3af3a313ee0c47461187784299bac29b&appSecret=5f63882c88c1985206573379a519a6e7&key=++//AA==&param=AA==",
  "sign": "94eddfc82b89d87fef73eb8f3641305f"
}
```

独立编码样例：输入空格加 `+/=~*中文`，Java 预编码结果为
`+%2B%2F%3D%7E*%E4%B8%AD%E6%96%87`。需特别保留星号并转义波浪号。
原生 JSON 的七组结果是历史对照；本上下文只摘取已说明的边界，不宣称已经提供全量可执行夹具。
