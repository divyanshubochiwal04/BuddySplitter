export interface RepayDebtItem {
  toUserId: string;
  toDisplayName: string;
  debtAmount: number; // in paise (> 0)
}

export interface RepayAllocation {
  toUserId: string;
  toDisplayName: string;
  originalDebt: number; // in paise
  allocatedAmount: number; // in paise
  remainingDebt: number; // in paise
  isFull: boolean;
}

export interface RepayCalculationResult {
  targetAmount: number; // in paise
  allocations: RepayAllocation[];
  totalAllocated: number; // in paise
  unallocatedAmount: number; // in paise
}

/**
 * Calculates allocations of a target repay amount across a selected list of debts.
 * Debts are allocated sequentially in the order they were selected.
 * If allocatedAmount < originalDebt, remainingDebt is strictly originalDebt - allocatedAmount.
 */
export function calculateRepayAllocations(
  targetAmount: number,
  debts: RepayDebtItem[],
  selectedUserIds: string[]
): RepayCalculationResult {
  if (selectedUserIds.length === 0 || targetAmount <= 0) {
    return {
      targetAmount,
      allocations: [],
      totalAllocated: 0,
      unallocatedAmount: targetAmount > 0 ? targetAmount : 0,
    };
  }

  let remainingTarget = targetAmount;
  const allocations: RepayAllocation[] = [];

  for (const userId of selectedUserIds) {
    const debt = debts.find((d) => d.toUserId === userId);
    if (!debt) continue;

    const allocated = Math.min(remainingTarget, debt.debtAmount);
    const remainingDebt = debt.debtAmount - allocated;
    remainingTarget -= allocated;

    allocations.push({
      toUserId: debt.toUserId,
      toDisplayName: debt.toDisplayName,
      originalDebt: debt.debtAmount,
      allocatedAmount: allocated,
      remainingDebt,
      isFull: remainingDebt === 0,
    });
  }

  const totalAllocated = targetAmount - remainingTarget;
  const unallocatedAmount = Math.max(0, remainingTarget);

  return {
    targetAmount,
    allocations,
    totalAllocated,
    unallocatedAmount,
  };
}

/**
 * Greedily selects debts in order until targetAmount is satisfied.
 */
export function autoSelectDebtsForAmount(
  targetAmount: number,
  debts: RepayDebtItem[]
): string[] {
  let remaining = targetAmount;
  const selected: string[] = [];

  for (const debt of debts) {
    if (remaining <= 0 && selected.length > 0) break;
    selected.push(debt.toUserId);
    remaining -= debt.debtAmount;
  }

  return selected;
}
