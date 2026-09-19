# BuddySplitter Architecture

This document describes the architectural foundation of BuddySplitter, design decisions, and future integration plans.

---

## 1. High-Level Overview

BuddySplitter is designed as an event-driven conversational system:

```text
┌─────────────────────────────────────────────────────────────┐
│                   Telegram Messenger (UI)                   │
│        Group chats, private chats, commands, buttons        │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / Bot API
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 grammY Bot Layer (src/bot)                  │
│       Parses commands, formats messages, routes actions     │
└──────────────────────────────┬──────────────────────────────┘
                               │ Domain function calls
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Business Logic Modules (src/modules)            │
│    Users • Groups • Expenses • Splits • Balances • Debts    │
└──────────────────────────────┬──────────────────────────────┘
                               │ Data operations
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Database Layer (src/db)                     │
│    Repositories • Query mapping • Supabase PostgreSQL       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Telegram as the Frontend

BuddySplitter intentionally avoids standalone web or mobile user interfaces:

- **Zero Friction:** Users do not need to download a new application or remember another login. The group chat they already use for planning is the interface.
- **Conversational UX:** Transactions and settlements are recorded inline using Telegram bot commands (`/start`, `/help`, and upcoming expense commands) and interactive inline keyboards.
- **Real-time Notifications:** All members in the Telegram group receive immediate transparent feedback when expenses are logged or balances change.

---

## 3. Layer Separation

To maintain code maintainability, testability, and clarity, BuddySplitter enforces a strict three-tier separation:

### Bot Layer (`src/bot/`)
- **Responsibility:** Handles Telegram communication exclusively.
- **Components:**
  - `commands/`: Handles slash commands (`/start`, `/help`). Extracts and validates user intent from incoming updates.
  - `callbacks/`: Receives inline button callback interactions.
  - `keyboards/`: Constructs Telegram inline or reply markup buttons.
  - `messages/`: Centralizes all user-facing message strings, copy, and markdown formatting.
- **Constraint:** Handlers never contain direct database queries or business calculation logic. Handlers delegate to domain modules.

### Business Logic Modules (`src/modules/`)
- **Responsibility:** Pure application and domain logic.
- **Components:**
  - `users/`: User profile management and identity mapping.
  - `groups/`: Group settings, member tracking, and currencies.
  - `expenses/`: Expense validation, split calculations (equal, exact, percentage, shares).
  - `settlements/`: Balance computation, debt graph simplification algorithms, and settlement records.
- **Constraint:** Domain modules are independent of Telegram API primitives. They accept and return standard TypeScript domain types.

### Database Layer (`src/db/`)
- **Responsibility:** Data persistence and query execution.
- **Components:**
  - `client.ts`: Manages the Supabase PostgreSQL connection client.
  - `repositories/`: Encapsulates table queries and maps database rows to domain entities.
- **Constraint:** Database logic is isolated behind repository functions. Business modules interact through typed repositories rather than raw queries.

---

## 4. Supabase Role (PostgreSQL)

Supabase provides the relational database engine:

- **Relational Integrity:** Ensures foreign key constraints between users, groups, expenses, and expense splits.
- **Consistency & Atomicity:** Multi-item splits and settlements execute within relational transactions to prevent corrupted financial states.
- **Future Capabilities:** Row-Level Security (RLS), automated backups, and real-time triggers can be utilized seamlessly as the system scales.

---

## 5. Startup and Lifecycle Handling (`src/app.ts`)

- **Configuration:** Validates all required environment variables at process startup using Zod schemas (`src/config/env.ts`). If any configuration is invalid or missing, the process fails fast with descriptive diagnostics.
- **Graceful Shutdown:** Listens for `SIGINT` and `SIGTERM` signals to cleanly stop the grammY bot polling runner, avoiding dropped updates or abrupt connection terminations.

---

## 6. Conversational State Machine (`src/modules/expenses/expense-state.ts`)

Interactive multi-step expense creation is coordinated via an in-memory draft state manager:

- **State Isolation:** Session drafts are indexed by a composite key `${chatId}:${userId}`. Multiple group members can run simultaneous expense drafts without crosstalk or race conditions.
- **TTL Eviction:** Drafts carry a 15-minute Time-To-Live (TTL). Expired drafts are automatically purged on query, preventing memory bloat.
- **Linear State Transitions:**
  - `AWAITING_DESCRIPTION` ➔ `AWAITING_AMOUNT` ➔ `AWAITING_PAYER` ➔ `AWAITING_PARTICIPANTS` ➔ `AWAITING_SPLIT` ➔ `CONFIRMATION` ➔ `SAVING`.

---

## 7. Split Calculation Engine (`src/modules/expenses/split/`)

Financial accuracy is maintained strictly using integer minor units (paise: ₹1 = 100 paise) with zero floating-point arithmetic drift:

- **Equal Split (`equal.ts`):**
  - Divides total paise by $N$ participants.
  - Remainder paise ($total \pmod N$) are distributed deterministically (+1 paisa to the first $R$ participants).
  - Guarantees `sum(splits) === totalPaise` exactly.
- **Custom Split (`custom.ts`):**
  - Validates exact user-provided allocations.
  - Detects shortage or overage relative to total expense amount with informative diagnostics.
- **Percentage Split (`percentage.ts`):**
  - Implements the **Hare-Niemeyer / Largest Remainder Method**.
  - Calculates integer floor paise shares, ranks fractional remainders descending, and distributes leftover paise sequentially to avoid penny drift while totaling exactly 100%.
- **Shares Split (`shares.ts`):**
  - Implements the **Largest Remainder Method** for proportional share allocations ($s_1, s_2, \dots, s_n$).
  - Operates strictly with integer math: `floorAmount_i = floor((totalAmount * s_i) / totalShares)`, remainder integer `remainder_i = (totalAmount * s_i) % totalShares`.
  - Zero floating-point arithmetic throughout the pipeline.
  - Distributes remaining paise to highest integer remainder participants with deterministic tie-breaking by input index.
  - Mathematical Invariant: `sum(all participant split amounts) === totalAmount` guaranteed across any combination.

---

## 8. Dynamic Modification & Payer Independence

BuddySplitter enables full interactive control before persistence:

- **Split Method Switching (`exp:change_split`):** Allows returning to split selection from the confirmation preview. Preserves description, total amount, payer, and participant list, while discarding old splits and recalculating from the original total without accumulated rounding errors.
- **Participant Modification (`exp:change_participants`):** Allows adjusting participant checkboxes. Discards old split calculations and requires fresh split calculation upon continuation.
- **Payer Independence (`exp:change_payer`):** The payer is decoupled from the participant list. A payer can pay for an expense without being a participant (e.g. paying on behalf of friends).

---

## 9. Atomicity and Idempotency Protections

Financial operations enforce strict correctness guarantees:

- **Idempotent Submission:** When the confirmation button (`[✅ Save Expense]`) is clicked, the draft step immediately flips to `SAVING`. Repeated button presses or network retries are safely ignored.
- **Rollback on Partial Failure:** In the event of a failure during batch insertion into `expense_splits`, the repository layer invokes a compensating delete on the newly created `expenses` row, preventing orphaned records.

---

## 10. Balance Engine (`src/modules/balances/`)

The Balance Engine provides a mathematically rigorous, deterministic calculation of each group member's financial standing:

### 10.1 Mathematical Model
For every member $M$:
- $\text{paidAmount} = \sum \text{expense.total\_amount}$ for all active non-deleted expenses where $\text{expense.paid\_by} = M.\text{userId}$
- $\text{owedAmount} = \sum \text{split.amount}$ for all splits on active non-deleted expenses where $\text{split.user\_id} = M.\text{userId}$
- $\text{netBalance} = \text{paidAmount} - \text{owedAmount}$

### 10.2 Conservation Invariant
Every calculation run is audited against the conservation law:
$$\sum_{M} \text{paidAmount} = \sum_{M} \text{owedAmount} = \text{totalExpensesAmount} \implies \sum_{M} \text{netBalance} = 0$$
If $\sum \text{netBalance} \neq 0$ or if any expense's split sum $\neq \text{total\_amount}$, the engine fails fast by throwing a `ValidationError`.

### 10.3 Classification & Deterministic Sorting
Members are classified into three mutually exclusive categories:
- **Creditors (`creditor`):** $\text{netBalance} > 0$ (should receive money). Sorted descending by net balance, tie-broken alphabetically by display name.
- **Debtors (`debtor`):** $\text{netBalance} < 0$ (owes money). Sorted ascending by net balance (largest debt first), tie-broken alphabetically by display name.
- **Settled (`settled`):** $\text{netBalance} = 0$ (even). Sorted alphabetically by display name.

### 10.4 Query Efficiency (Zero N+1)
`findActiveExpensesWithSplitsByGroupId` fetches all active group expenses and their splits via two efficient batch queries, mapping relations in-memory without repetitive roundtrips.

---

## 11. Settlement Engine (`src/modules/settlements/`)

The Settlement Engine simplifies member balances into a minimal, actionable series of recommended peer-to-peer transfers.

### 11.1 Service Architecture & Single Source of Truth
The settlement pipeline follows a strict layered topology:
```text
Telegram Handlers (/settle, action:settle_up, settle:full)
                     │
                     ▼
             SettlementService
                     │  (delegates balance retrieval)
                     ▼
              BalanceService
                     │
                     ▼
           SettlementCalculator (Pure Domain Logic)
```
- `SettlementService` does not re-query the database or recalculate expenses. It consumes `BalanceService` output directly.
- Recommendations are non-persistent previews: Phase 7 executes zero writes to the `settlements` table. Actual repayment logging, receipts, and payment status transitions are strictly deferred to Phase 8.

### 11.2 Algorithm: Greedy Bipartite Debtor-Creditor Matching
1. **Partition:** Separates positive net balances (`creditors`) and negative net balances (`debtors`, converting net debt to positive payable units).
2. **Deterministic Ordering:**
   - Creditors are sorted descending by remaining credit, tie-breaking lexically by `userId`.
   - Debtors are sorted descending by remaining debt, tie-breaking lexically by `userId`.
   - Guaranteed determinism: identical balance states produce identical transaction sets regardless of input array ordering.
3. **Greedy Matching:**
   - Matches the current top debtor with the current top creditor.
   - Generates a transfer of $\min(\text{remainingDebt}, \text{remainingCredit})$.
   - Deducts the transferred amount from both parties.
   - Advances pointers when a party's balance reaches zero.
   - Continues until all debts and credits are fully satisfied.

### 11.3 Transaction Minimization Bound
- **Worst-Case Guarantee:** For $N = D + C$ unbalanced participants ($D$ debtors and $C$ creditors), the algorithm produces at most $N - 1$ transactions.
- **NP-Hardness Context:** Finding the absolute minimum number of transactions across arbitrary subsets is equivalent to the **Subset Sum / Multi-Way Partitioning** problem, which is NP-hard. The greedy heuristic achieves an optimal or near-optimal transaction count in $O(N \log N)$ time, eliminating all cyclic debts without exponential computation.

### 11.4 Invariants & Correctness Guarantees
- $\text{amount} > 0$ strictly in integer minor units (paise). Zero floating-point arithmetic.
- $\text{fromUserId} \neq \text{toUserId}$ (guaranteed zero self-payments).
- Total settlement volume matches total positive credit:
  $$\sum \text{transaction.amount} = \sum_{M, \text{netBalance} > 0} \text{netBalance}_M = \sum_{M, \text{netBalance} < 0} |\text{netBalance}_M|$$
- **Simulation Invariant Audit:** The calculator simulates applying every generated transaction against initial member balances and asserts that every member's remaining balance resolves to exactly $0$ paise.

---

## 12. Repayment & Settlement Tracking Engine (`src/modules/settlements/`)

Phase 8 converts settlement recommendations into trackable, immutable repayments without modifying original expenses.

### 12.1 Repayment Model
- Repayments are recorded in the PostgreSQL `settlements` table:
  - `id`: Unique UUID identifier.
  - `group_id`: Group database UUID.
  - `from_user_id`: Debtor making the payment.
  - `to_user_id`: Creditor receiving the payment.
  - `amount`: Stored in integer minor units (paise: ₹1 = 100 paise).
  - `status`: `'paid'`, `'pending'`, or `'cancelled'`. Only `'paid'` affects financial balances.
  - `settled_at`: Timestamp when the payment occurred.
  - `created_by`: User recording the transaction.
- **Expenses Are Never Modified:** Repayments are independent ledger events. The audit history of all expenses and individual splits remains immutable.

### 12.2 Balance Reconciliation Model
- For member $M$:
  - $\text{rawBalance} = \text{paidAmount} - \text{owedAmount}$
  - $\text{paymentsMade} = \sum \text{amount}$ where $\text{from\_user\_id} = M.\text{userId} \land \text{status} = \text{'paid'}$
  - $\text{paymentsReceived} = \sum \text{amount}$ where $\text{to\_user\_id} = M.\text{userId} \land \text{status} = \text{'paid'}$
  - $\text{outstandingNet} = \text{rawBalance} + \text{paymentsMade} - \text{paymentsReceived}$
- **Conservation Law:**
  $$\sum_M \text{outstandingNet} = \sum_M \text{rawBalance} + \sum_M (\text{paymentsMade} - \text{paymentsReceived}) = 0 + 0 = 0$$

### 12.3 Dynamic Settlement Plan Recomputation
- Passing reconciled balances ($\text{outstandingNet}$) into `calculateSettlements` dynamically recalculates the remaining settlement plan.
- Fully repaid debts disappear; partial repayments reduce remaining obligations.

### 12.4 Validation & Protection
- **Overpayment Guard:** Payments exceeding the current outstanding debt to the recipient are rejected with `❌ Payment exceeds the current amount owed.`.
- **Self-Payment Guard:** Debtor and recipient must be distinct members (`from_user_id != to_user_id`).
- **Authorization Guard:** Only the payer can record or confirm their payment.
- **Idempotency Guard:** `PaymentStateManager` uses a `SAVING` lock to prevent duplicate records upon rapid double-tapping.

---

## 13. Expense Management Architecture (`src/modules/expenses/`)

Phase 9 introduces comprehensive expense history, details viewing, editing, and soft-deletion with domain authorization and repayment safety guards.

### 13.1 Paginated History & Deterministic Ordering
- Expenses are queried using active filter (`deleted_at IS NULL`) ordered deterministically:
  `ORDER BY expense_date DESC, created_at DESC, id DESC`.
- Paginated at 5 expenses per page to ensure fast rendering, compact keyboard layouts, and zero Telegram button overflow.
- All member identities and display names are resolved in-context without leaking database UUIDs to users.

### 13.2 Domain-Level Authorization
- Only the **creator** (`expense.created_by`) or the **payer** (`expense.paid_by`) is authorized to edit or delete an expense.
- All other active group members have read-only visibility into expense details and split breakdowns.
- Authorization checks are strictly enforced in the service layer (`authorizeExpenseManagement`), rejecting unauthorized actions with descriptive validation errors.

### 13.3 Repayment Safety & Financial History Integrity
- When an expense is created, debts are generated among participants. If a repayment is subsequently recorded (`settlements` with `status = 'paid'`) involving the payer or any split participant, modifying the financial structure of that expense would compromise accounting integrity.
- **Rules:**
  1. **Deletion Guard:** If repayments exist related to this expense's payer or participants, deletion is strictly blocked:
     `⚠️ This expense has repayment activity. It cannot be deleted because doing so would invalidate financial history.`
  2. **Financial Edit Guard:** Amount, payer, participants, and split breakdowns cannot be modified if repayments exist:
     `⚠️ This expense has related repayments. For financial safety, amount/payer/participants cannot be changed after repayment activity.`
  3. **Description Edit Exemption:** Descriptions can always be edited because text annotations do not alter balances or debts.

### 13.4 Soft Deletion & Balance Recalculation
- Deletions are never physical hard deletes; rows are stamped with `deleted_at = new Date().toISOString()`.
- Active expense queries (`findActiveExpensesWithSplitsByGroupId`) automatically exclude soft-deleted expenses via `deleted_at IS NULL`.
- Balance recalculation (`calculateGroupBalances`), reconciliation (`reconcileBalances`), and settlement planning (`calculateSettlements`) automatically reflect the active ledger state without requiring manual balance patching or database triggers.
- Double-tap deletion requests are handled idempotently, reporting `This expense is already deleted.` without throwing errors.





