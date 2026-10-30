// Presentation compatibility for receipts saved by earlier versions.
// Stored receipts and their states remain unchanged.
const previousMessages = new Map(
  Object.entries({
    '提交意图已保存；结果尚未确认，请勿重传。':
      '提交结果待确认，请先查看运动记录，勿重复提交。',
    '连接或响应失败，结果不确定。请先核对学校记录，勿重传。':
      '提交结果待确认，请先查看运动记录，勿重复提交。',
    '未获得可识别回执，结果不确定。请核对学校记录，勿重传。':
      '提交结果待确认，请先查看运动记录，勿重复提交。',
    '学校已确认接收；入库、合格与统计仍需分别核对。':
      '学校已接收，请到运动记录查看结果。',
    '学校明确拒绝本次提交；该草稿已锁定，核对后再处理。':
      '学校未接收本次提交，此草稿已停止提交。请先核对运动记录。',
    '已通过详情关联标识核对入库，合格与统计仍需分别核对。':
      '已找到本次提交的运动记录，请查看详情。',
  }),
);

export function submissionMessage(message: string): string {
  return (previousMessages.get(message) ?? message).replaceAll(
    '（客户端安全门禁）',
    '',
  );
}
