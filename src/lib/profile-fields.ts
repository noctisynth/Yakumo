export const profileGroups = [
  '个人信息',
  '学籍信息',
  '状态信息',
  '其他编号',
  '补充信息',
] as const;
type Group = (typeof profileGroups)[number];
type Field = { label: string; group: Group };
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
      height: '身高',
      weight: '体重',
      sysNationId: '民族信息',
      nationId: '民族编号',
      nationName: '民族',
      cardNum: '卡号',
      imageRouteUrl: '头像地址',
    },
  ],
  [
    '学籍信息',
    {
      schoolName: '学校名称',
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
      feature: '资料标记',
      type: '资料类型',
      userType: '用户类型',
    },
  ],
  [
    '其他编号',
    {
      id: '资料编号',
      userId: '用户编号',
      basUserId: '基础用户编号',
      studentId: '学生编号',
      basStudentTypeId: '学生类别编号',
      campusId: '校区编号',
      deptId: '院系编号',
      majorId: '专业编号',
      clazzId: '班级编号',
      yearId: '年级编号',
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
      },
    ]),
  ),
) as Record<string, Field>;
export function profileField(key: string): Field {
  return (
    fields[key] ?? {
      label: '其他资料',
      group: '补充信息',
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
