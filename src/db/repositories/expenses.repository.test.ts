import { describe, it, expect, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database, ExpenseInsert } from '../types';
import { ExpenseRepository } from './expenses.repository';
import { ValidationError } from '../../shared/errors';

function createMockClient() {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };

  const client = {
    from: vi.fn().mockReturnValue(queryBuilder),
  } as unknown as SupabaseClient<Database>;

  return { client, queryBuilder };
}

describe('ExpenseRepository', () => {
  it('creates an expense with equal splits and validates minor units matching', async () => {
    const { client, queryBuilder } = createMockClient();

    const mockExpense = {
      id: 'exp-1',
      group_id: 'grp-1',
      description: 'Dinner at Bistro',
      category: 'food',
      total_amount: 3000, // 3000 paise = ₹30.00
      currency: 'INR',
      paid_by: 'usr-1',
      created_by: 'usr-1',
      split_type: 'equal' as const,
      expense_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    const mockSplits = [
      { id: 's-1', expense_id: 'exp-1', user_id: 'usr-1', amount: 1500, percentage: 50, created_at: new Date().toISOString() },
      { id: 's-2', expense_id: 'exp-1', user_id: 'usr-2', amount: 1500, percentage: 50, created_at: new Date().toISOString() },
    ];

    queryBuilder.single.mockResolvedValue({ data: mockExpense, error: null });
    queryBuilder.select.mockReturnValueOnce({ single: () => Promise.resolve({ data: mockExpense, error: null }) } as any);
    // For the second select (splits insert)
    queryBuilder.select.mockResolvedValueOnce({ data: mockSplits, error: null });

    const repo = new ExpenseRepository(client);

    const expensePayload: ExpenseInsert = {
      group_id: 'grp-1',
      description: 'Dinner at Bistro',
      total_amount: 3000,
      currency: 'INR',
      paid_by: 'usr-1',
      created_by: 'usr-1',
      split_type: 'equal',
    };

    const splitsPayload = [
      { user_id: 'usr-1', amount: 1500, percentage: 50 },
      { user_id: 'usr-2', amount: 1500, percentage: 50 },
    ];

    const result = await repo.createExpenseWithSplits(expensePayload, splitsPayload);

    expect(client.from).toHaveBeenCalledWith('expenses');
    expect(client.from).toHaveBeenCalledWith('expense_splits');
    expect(result.id).toBe('exp-1');
    expect(result.total_amount).toBe(3000);
  });

  it('rejects expense if total_amount is not a positive integer minor unit', async () => {
    const { client } = createMockClient();
    const repo = new ExpenseRepository(client);

    const invalidExpense: ExpenseInsert = {
      group_id: 'grp-1',
      description: 'Snacks',
      total_amount: 25.5, // Not integer paise
      paid_by: 'usr-1',
      created_by: 'usr-1',
      split_type: 'equal',
    };

    await expect(repo.createExpenseWithSplits(invalidExpense, [{ user_id: 'usr-1', amount: 25.5 }]))
      .rejects.toThrow(ValidationError);
  });

  it('rejects expense if sum of split amounts does not match total_amount', async () => {
    const { client } = createMockClient();
    const repo = new ExpenseRepository(client);

    const expense: ExpenseInsert = {
      group_id: 'grp-1',
      description: 'Coffee',
      total_amount: 1000, // 1000 paise
      paid_by: 'usr-1',
      created_by: 'usr-1',
      split_type: 'equal',
    };

    const mismatchSplits = [
      { user_id: 'usr-1', amount: 400 },
      { user_id: 'usr-2', amount: 400 }, // sum = 800 != 1000
    ];

    await expect(repo.createExpenseWithSplits(expense, mismatchSplits))
      .rejects.toThrow(/Sum of splits .* must equal total amount/);
  });

  it('performs soft deletion by setting deleted_at', async () => {
    const { client, queryBuilder } = createMockClient();
    const mockDeleted = {
      id: 'exp-1',
      deleted_at: new Date().toISOString(),
    };
    queryBuilder.single.mockResolvedValue({ data: mockDeleted, error: null });

    const repo = new ExpenseRepository(client);
    const result = await repo.softDelete('exp-1');

    expect(client.from).toHaveBeenCalledWith('expenses');
    expect(queryBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    );
    expect(result.deleted_at).toBeDefined();
  });
});
