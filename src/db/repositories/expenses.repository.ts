import { SupabaseClient } from '@supabase/supabase-js';
import { Database, ExpenseInsert, ExpenseRow, ExpenseSplitInsert, ExpenseSplitRow } from '../types';
import { ValidationError } from '../../shared/errors';

export interface ExpenseWithSplits extends ExpenseRow {
  splits: ExpenseSplitRow[];
}

export class ExpenseRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async findById(id: string): Promise<ExpenseWithSplits | null> {
    const { data: expense, error: expenseError } = await this.client
      .from('expenses')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (expenseError) throw expenseError;
    if (!expense) return null;

    const { data: splits, error: splitsError } = await this.client
      .from('expense_splits')
      .select('*')
      .eq('expense_id', id);

    if (splitsError) throw splitsError;

    return {
      ...expense,
      splits: splits ?? [],
    };
  }

  async findByGroupId(
    groupId: string,
    options?: { limit?: number; offset?: number; includeDeleted?: boolean }
  ): Promise<ExpenseRow[]> {
    let query = this.client
      .from('expenses')
      .select('*')
      .eq('group_id', groupId);

    if (!options?.includeDeleted) {
      query = query.is('deleted_at', null);
    }

    query = query.order('expense_date', { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      const from = options.offset;
      const to = from + (options.limit ?? 10) - 1;
      query = query.range(from, to);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async findActiveExpensesWithSplitsByGroupId(groupId: string): Promise<ExpenseWithSplits[]> {
    const { data: expenses, error: expensesError } = await this.client
      .from('expenses')
      .select('*')
      .eq('group_id', groupId)
      .is('deleted_at', null)
      .order('expense_date', { ascending: true });

    if (expensesError) throw expensesError;
    if (!expenses || expenses.length === 0) return [];

    const expenseIds = expenses.map((e) => e.id);
    const { data: splits, error: splitsError } = await this.client
      .from('expense_splits')
      .select('*')
      .in('expense_id', expenseIds);

    if (splitsError) throw splitsError;

    const splitsByExpenseId = new Map<string, ExpenseSplitRow[]>();
    for (const split of splits ?? []) {
      const existing = splitsByExpenseId.get(split.expense_id) ?? [];
      existing.push(split);
      splitsByExpenseId.set(split.expense_id, existing);
    }

    return expenses.map((expense) => ({
      ...expense,
      splits: splitsByExpenseId.get(expense.id) ?? [],
    }));
  }

  async createExpenseWithSplits(
    expense: ExpenseInsert,
    splits: Omit<ExpenseSplitInsert, 'expense_id'>[]
  ): Promise<ExpenseWithSplits> {
    if (!Number.isInteger(expense.total_amount) || expense.total_amount <= 0) {
      throw new ValidationError('Expense total_amount must be a positive integer in minor units');
    }

    if (splits.length === 0) {
      throw new ValidationError('Expense must have at least one split');
    }

    const totalSplitAmount = splits.reduce((sum, s) => sum + s.amount, 0);
    if (totalSplitAmount !== expense.total_amount) {
      throw new ValidationError(
        `Sum of splits (${totalSplitAmount}) must equal total amount (${expense.total_amount})`
      );
    }

    const { data: createdExpense, error: expenseError } = await this.client
      .from('expenses')
      .insert(expense)
      .select()
      .single();

    if (expenseError) throw expenseError;

    const splitsToInsert: ExpenseSplitInsert[] = splits.map((s) => ({
      ...s,
      expense_id: createdExpense.id,
    }));

    const { data: createdSplits, error: splitsError } = await this.client
      .from('expense_splits')
      .insert(splitsToInsert)
      .select();

    if (splitsError) {
      // Rollback cleanup: remove the created expense to prevent orphan/incomplete state
      await this.client.from('expenses').delete().eq('id', createdExpense.id);
      throw splitsError;
    }

    return {
      ...createdExpense,
      splits: createdSplits ?? [],
    };
  }

  async softDelete(id: string): Promise<ExpenseRow> {
    const { data, error } = await this.client
      .from('expenses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
