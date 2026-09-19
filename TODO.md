# BuddySplitter Roadmap & Implementation Phases

- [x] **Phase 1: Foundation**
  - Clean Node.js + TypeScript project setup (strict mode).
  - grammY bot skeleton with `/start`, `/help`, and unknown command handler.
  - Environment validation using Zod.
  - Supabase client initialization.
  - Structured project layout (`src/bot`, `src/modules`, `src/db`, `src/config`, `src/shared`).
  - Graceful startup and shutdown handling (`SIGINT`, `SIGTERM`).
  - Unit tests with Vitest.
  - Project documentation (`README.md`, `ARCHITECTURE.md`, `TODO.md`).

- [x] **Phase 2: Database**
  - Supabase PostgreSQL schema migration (`supabase/migrations/20260919000000_create_buddysplitter_schema.sql` and `src/db/schema.sql`).
  - 6 relational tables: `users`, `groups`, `group_members`, `expenses`, `expense_splits`, `settlements`.
  - Safe 64-bit BigInt for Telegram IDs and UUID primary keys.
  - Money stored strictly in integer minor units (paise: ₹1 = 100 paise) with zero float drift.
  - Foreign keys, cascading deletes, unique constraints, and optimized indexes.
  - Validation constraints (`from_user_id != to_user_id`, `total_amount > 0`, `split_type`, `status`).
  - Type-safe repository layer (`UserRepository`, `GroupRepository`, `GroupMemberRepository`, `ExpenseRepository`, `SettlementRepository`).
  - Domain entities synchronized in `src/modules/`.
  - Comprehensive unit tests covering repositories and minor unit currency conversions.

- [x] **Phase 3: Telegram Core**
  - Interactive `/start` in private chat with dynamic `[➕ Add to Group]` and `[❓ Help]` buttons.
  - Interactive `/start` in groups with 6-button main menu (`Add Expense`, `My Balance`, `Summary`, `Settle Up`, `Expenses`, `Members`).
  - Automatic user upsert on interaction (`telegram_user_id`, `first_name`, `last_name`, `username`).
  - Automatic group & membership upsert on group messages/commands.
  - Bot group detection (`my_chat_member` and `new_chat_members` event handling) with greeting message.
  - Comprehensive `/help` command explaining `/start`, `/add`, `/balance`, `/summary`, `/settle`, `/expenses`, `/members`, `/cancel`.
  - Reusable inline keyboard builders (`private`, `group`, `common: back, cancel`).
  - Safe callback routing system with Zod data validation, alert responses for upcoming features, and crash prevention.
  - `/members` command displaying registered group members.
  - `/cancel` command and coming-soon placeholders.
  - Backend `SUPABASE_SERVICE_ROLE_KEY` integration for trusted server-side execution.
  - 16 unit test suites with 58 passing tests.

- [x] **Phase 4: Expense Flow**
  - Interactive multi-step expense creation wizard triggered via `/add` or `[➕ Add Expense]` group button.
  - Chat type guard (strictly group/supergroup only; rejects private chats with guidance).
  - Robust step state machine: `AWAITING_DESCRIPTION` ➔ `AWAITING_AMOUNT` ➔ `AWAITING_PAYER` ➔ `AWAITING_PARTICIPANTS` ➔ `AWAITING_SPLIT` ➔ `CONFIRMATION` ➔ `SAVING`.
  - In-memory `ExpenseStateManager` with composite key `${chatId}:${userId}` and 15-minute TTL eviction.
  - Zero float drift: all monetary values parsed and handled in integer minor units (paise: ₹1 = 100 paise).
  - Payer selection supporting self (`[🙋 I Paid (You)]`) and dynamic group member picking.
  - Multi-participant checkbox toggling (`[✅/⬜ Name]`, `[Select All]`, `[Done]`).
  - 3 split calculation engines:
    - Equal Split with deterministic remainder paise distribution.
    - Custom Exact Amounts with real-time balance validation and shortage/overage diagnostics.
    - Percentage Split with Hare-Niemeyer / Largest Remainder Method for exact 100% and zero penny drift.
  - Pre-save confirmation summary showing total, payer, and member breakdown.
  - Idempotent submission guard (`SAVING` step) preventing duplicate expense creations on double-tap.
  - Relational atomicity guard: automatic compensating rollback deletion of expense if split batch insertion fails.
  - Group notification message upon successful expense creation.
  - Detailed `BOT-FLOW.md` specification and architecture docs.
  - 23 unit test suites with 96 passing tests across repositories, services, split engines, validation, and conversational handlers.


- [x] **Phase 5: Advanced Splits**
  - Share-based split engine (`calculateSharesSplit`) using deterministic Largest Remainder Method rounding.
  - Minor-unit integer paise precision with zero floating-point arithmetic.
  - Invariant guarantee: `sum(split.amount) === totalAmount` across arbitrary amounts and shares.
  - Interactive shares stepper UI (`[➖] N shares [➕]`) with minimum 1 share constraint and bounds checking.
  - Confirmation screen controls: `[✏️ Change Split]`, `[👥 Change Participants]`, `[✏️ Change Payer]`.
  - Split method switching with fresh calculation from original total amount and zero accumulated rounding error.
  - Participant modification discarding old splits and requiring fresh allocation.
  - Payer vs participant independence (payer can be outside participant list).
  - PostgreSQL database migration (`supabase/migrations/20260919000001_add_shares_split_type.sql`) adding `'shares'` to `split_type` check constraint and optional `shares` column to `expense_splits`.
  - 25 unit test suites with 122 passing tests covering mathematical edge cases, property invariants, and conversational flows.

- [ ] **Phase 6: Balance Engine**
  - Group net balance calculation for every member.
  - `/balances` command with clear summary view.
  - Individual `/mybalance` command in private or group chat.

- [ ] **Phase 7: Settlement Engine**
  - Debt simplification algorithm (minimizing total payment transactions).
  - `/settle` command providing recommended settlement transactions.

- [ ] **Phase 8: Repayments**
  - Record payments / settlements between members (`/pay` or `/settled`).
  - Balance updates upon repayment confirmation.
  - Payment audit trail.

- [ ] **Phase 9: Expense Management**
  - View expense history (`/history`).
  - Edit or delete mistakenly entered expenses.
  - Permissions (only expense creator or admin can modify/delete).

- [ ] **Phase 10: UX Polish**
  - Interactive Telegram inline keyboards for selecting participants and split types.
  - Multi-currency support and currency symbol formatting.
  - Friendly error messages and usage hints.

- [ ] **Phase 11: Security & Tests**
  - Input sanitization and rate limiting.
  - Comprehensive integration and end-to-end bot tests.
  - Error monitoring and edge case coverage.

- [ ] **Phase 12: Production Deployment**
  - Production containerization (Docker).
  - Webhook mode configuration option alongside polling.
  - Deployment configuration and operational runbooks.
