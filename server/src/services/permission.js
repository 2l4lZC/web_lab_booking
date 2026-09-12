/**
 * 违规降权规则 —— 单独抽出来，因为「预约时校验」和「用户管理里展示」
 * 必须用同一套规则。两处各写一份迟早会不一致。
 */

export const VIOLATION_WINDOW_DAYS = 90
export const VIOLATION_RESTRICT_AT = 3
export const VIOLATION_FREEZE_AT = 5
export const FREEZE_DAYS = 7
export const RESTRICTED_ADVANCE_DAYS = 1

export const GRADE_LEVEL = { undergrad: 1, master: 2, phd: 3 }

export const GRADE_TEXT = { undergrad: '本科生', master: '研究生', phd: '博士生' }

/**
 * 根据近 90 天违规次数推导当前受限情况。
 * 纯函数，不查库 —— 权限是算出来的，不是存出来的。
 *
 * @param {number} violationCount 近 90 天违规次数
 * @param {string} grade 学历（保留参数，便于将来按学历差异化）
 */
export function describePermission(violationCount, grade) {
  const count = Number(violationCount) || 0

  if (count >= VIOLATION_FREEZE_AT) {
    return {
      level: 'frozen',
      violationCount: count,
      label: '已冻结',
      detail: `近 ${VIOLATION_WINDOW_DAYS} 天违规 ${count} 次，预约权限受限`,
      maxAdvanceDays: RESTRICTED_ADVANCE_DAYS,
    }
  }

  if (count >= VIOLATION_RESTRICT_AT) {
    return {
      level: 'restricted',
      violationCount: count,
      label: '已降权',
      detail: `最多只能提前 ${RESTRICTED_ADVANCE_DAYS} 天预约`,
      maxAdvanceDays: RESTRICTED_ADVANCE_DAYS,
    }
  }

  return {
    level: 'normal',
    violationCount: count,
    label: '正常',
    detail: '按各实验室配置的提前天数预约',
    maxAdvanceDays: null,
  }
}

/** 判断是否处于冻结期（需要最后一次违规时间） */
export function isFrozenNow(violationCount, lastViolationAt, now = new Date()) {
  if (Number(violationCount) < VIOLATION_FREEZE_AT || !lastViolationAt) return false
  const last = new Date(lastViolationAt)
  const until = new Date(last.getTime() + FREEZE_DAYS * 86400000)
  return until > now
}
