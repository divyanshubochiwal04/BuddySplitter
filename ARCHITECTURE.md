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


