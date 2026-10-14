export const profileGroups = [
  '个人信息',
  '学籍信息',
  '状态信息',
  '系统标识',
  '补充信息',
] as const;
type Group = (typeof profileGroups)[number];
type Field = { label: string; group: Group; hint?: string };
const entries: [Group, Record<string, string>][] = [
  [
    '个人信息',
    {
      realName: '姓名',
      name: '姓名',
      nickName: '昵称',
      username: '账号',
      userName: '账号',
      userNum: '账号',
      sex: '性别',
      phone: '手机号码',
      email: '电子邮箱',
      address: '地址',
      birthday: '出生日期',
      height: '身高（原值）',
      weight: '体重（原值）',
      sysNationId: '民族信息',
      nationId: '民族标识',
      nationName: '民族',
      cardNum: '卡号',
      imageRouteUrl: '头像地址',
    },
  ],
  [
    '学籍信息',
    {
      schoolName: '学校名称（接口返回）',
      schoolCode: '学校代码',
      campusName: '校区',
      collegeName: '学院',
      deptName: '院系',
      majorName: '专业',
      className: '班级',
      clazzName: '班级',
      clazzInfo: '班级完整信息',
      clazzCode: '班级代码',
      studentNumber: '学号',
      grade: '年级',
      yearName: '年级',
      eduYear: '学制',
      stuTypeName: '学生类别',
    },
  ],
  [
    '状态信息',
    {
      isGraduation: '毕业状态',
      feature: '特征标记（原值）',
      type: '资料类型（原值）',
      userType: '用户类型',
    },
  ],
  [
    '系统标识',
    {
      id: '资料标识',
      userId: '用户标识',
      basUserId: '基础用户标识',
      studentId: '学生标识',
      basStudentTypeId: '学生类别标识',
      campusId: '校区标识',
      deptId: '院系标识',
      majorId: '专业标识',
      clazzId: '班级标识',
      yearId: '年级标识',
      createTime: '创建时间',
      updateTime: '更新时间',
    },
  ],
];
const fields = Object.fromEntries(
  entries.flatMap(([group, values]) =>
    Object.entries(values).map(([key, label]) => [
      key,
      {
        label,
        group,
        ...(group === '状态信息'
          ? { hint: '学校返回的状态值，具体取值含义尚未确认。' }
          : {}),
      },
    ]),
  ),
) as Record<string, Field>;
export function profileField(key: string): Field {
  return (
    fields[key] ?? {
      label: '其他资料（待识别）',
      group: '补充信息',
      hint: '此字段的具体含义尚未确认，来源字段名显示在名称旁。',
    }
  );
}

// Confirmed by the user; other codes remain uninterpreted.
export function profileValue(key: string, value: unknown): string | undefined {
  if (
    key === 'eduYear' &&
    ((typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)))
  )
    return `${value} 年`;
  if (key === 'userType' && (value === 1 || value === '1')) return '学生';
  if (key === 'isGraduation' && (value === 0 || value === '0')) return '未毕业';
  return undefined;
}
