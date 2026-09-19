-- Migration: Add 'shares' to expenses split_type and optional shares to expense_splits
-- Date: 2026-09-19
-- Description: Supports share-based expense splitting (Phase 5: Advanced Splits)

-- 1. Update split_type check constraint on expenses table
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_split_type_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_split_type_check 
    CHECK (split_type IN ('equal', 'custom', 'percentage', 'shares'));

-- 2. Add optional shares column to expense_splits table
ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS shares INTEGER 
    CHECK (shares IS NULL OR shares > 0);
