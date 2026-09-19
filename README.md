<div align="center">

# 💸 BuddySplitter

**Group expenses made simple. Split expenses directly inside Telegram without spreadsheets or external apps.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![grammY](https://img.shields.io/badge/grammY-Telegram_Bot-2489FF?style=for-the-badge&logo=telegram&logoColor=white)](https://grammy.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Vitest](https://img.shields.io/badge/Tests-154%20Passed-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

<p align="center">
  <a href="#-key-features">Key Features</a> •
  <a href="#-interactive-conversational-flow">Conversational Flow</a> •
  <a href="#-system-architecture">Architecture</a> •
  <a href="#-quickstart">Quickstart</a> •
  <a href="#-bot-commands">Bot Commands</a> •
  <a href="#-roadmap">Roadmap</a>
</p>

</div>

---

## 📖 Overview

**BuddySplitter** is a Telegram-native expense splitting bot built with **TypeScript (strict mode)**, **grammY**, and **Supabase PostgreSQL**. 

Unlike traditional split tools (Splitwise, spreadsheets, web apps), BuddySplitter lives directly inside your Telegram group chats:
- **Zero Friction:** No new apps to download, no accounts to register. The chat group you already use with your roommates, travel buddies, or friends is the interface.
- **Financial Precision:** Every monetary transaction is strictly stored and calculated in integer minor units (**paise**: `₹1 = 100 paise`), eliminating IEEE-754 floating-point rounding errors.
- **Fair Split Algorithms:** Built-in split strategies including the **Hare-Niemeyer / Largest Remainder Method** for percentage allocations and deterministic remainder redistribution.

---

## ✨ Key Features

| Feature | Description |
| :--- | :--- |
| ⚡ **Telegram-Native UX** | Interactive inline keyboards, menus, and real-time group notifications. |
| 🤖 **Interactive Multi-Step Wizard** | Conversational flow for logging expenses: Description ➔ Amount ➔ Payer ➔ Participants ➔ Split Mode ➔ Confirmation. |
| ⚖️ **4 Split Engines** | **Equal Split** (remainder distribution), **Custom Amounts** (real-time validation), **Percentage** (Hare-Niemeyer method), and **Shares** (deterministic largest remainder). |
| 📊 **Mathematical Balance Engine** | Exact per-member net balance calculation (`paid - owed`) audited by conservation invariant `SUM(netBalance) === 0` and zero float drift. |
| 💎 **Zero Float Drift** | All currency operations are calculated in integer minor units (paise). ₹1500.50 is handled as `150050` paise. |
| 🔒 **State Isolation & Concurrency** | In-memory session state scoped by composite key `${chatId}:${userId}` with a 15-minute TTL eviction, allowing multiple members to log expenses simultaneously. |
| 🛡️ **Atomicity & Idempotency** | Double-tap prevention using transient `SAVING` state lock; automatic compensating rollback deletion if split persistence fails. |
| 👥 **Transparent Onboarding** | Automatic user and group registration on every interaction with 64-bit Telegram ID safety. |

---

## 💬 Interactive Conversational Flow

Here is what the expense creation experience looks like inside Telegram:

```text
User:   /add
Bot:    📝 What is this expense for?
        Send the description (e.g. Dinner, Groceries, Flight tickets):

User:   Dinner at Bistro
Bot:    💰 How much was spent?
        Enter amount in ₹ (e.g. 1500 or 1500.50):

User:   1500
Bot:    👤 Who paid for "Dinner at Bistro" (₹1,500.00)?
        [🙋 I Paid (Alice)]  [👥 Select Someone Else]

User:   [Taps "🙋 I Paid"]
Bot:    👥 Who was involved in this expense?
        [✅ Alice (You)]  [✅ Bob]
        [✅ Charlie]      [✅ David]
        [🔄 Select All]   [➡️ Done (4 selected)]

User:   [Taps "➡️ Done"]
Bot:    ⚖️ How would you like to split ₹1,500.00 among 4 members?
        [⚖️ Split Equally]
        [✏️ Custom Exact Amounts]
        [📊 Split by Percentage (%)]

User:   [Taps "⚖️ Split Equally"]
Bot:    📋 Confirm Expense Details:
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        📝 Description:  Dinner at Bistro
        💰 Total Amount: ₹1,500.00
        👤 Paid By:      Alice
        ⚖️ Split Type:    Equal (4 participants)

        Split Breakdown:
        • Alice:   ₹375.00
        • Bob:     ₹375.00
        • Charlie: ₹375.00
        • David:   ₹375.00
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        [✅ Confirm & Save]  [❌ Cancel]

User:   [Taps "✅ Confirm & Save"]
Bot:    🎉 Expense Saved!
        "Dinner at Bistro" (₹1,500.00) recorded by Alice.
```

---

## 🏗 System Architecture

BuddySplitter enforces a strict 3-tier architecture ensuring separation of concerns, testability, and reliability:

```mermaid
flowchart TD
    subgraph Telegram["Telegram Messenger"]
        TG_GROUP["Group Chat"]
        TG_PRIVATE["Private Chat"]
    end

    subgraph BotLayer["Bot Presentation Layer (src/bot)"]
        ROUTER["Callback Router"]
        COMMANDS["Command Handlers (/start, /add, /help, /members)"]
        KEYBOARDS["Inline Keyboard Builders"]
        MESSAGES["Message Templates & Formatters"]
        MIDDLEWARE["Auto-Registration Middleware"]
    end

    subgraph DomainLayer["Business Domain Layer (src/modules)"]
        STATE["ExpenseStateManager (TTL 15m)"]
        WIZARD["Expense Flow State Machine"]
        SPLIT["Split Engines (Equal, Custom, Percentage)"]
        USERS["User Service"]
        GROUPS["Group Service"]
    end

    subgraph DataLayer["Database Layer (src/db)"]
        REPO_USER["UserRepository"]
        REPO_GROUP["GroupRepository"]
        REPO_EXPENSE["ExpenseRepository"]
        REPO_SETTLE["SettlementRepository"]
        SUPABASE[("Supabase PostgreSQL")]
    end

    TG_GROUP & TG_PRIVATE --> MIDDLEWARE --> COMMANDS & ROUTER
    COMMANDS & ROUTER --> KEYBOARDS & MESSAGES
    COMMANDS & ROUTER --> WIZARD & USERS & GROUPS
    WIZARD --> STATE & SPLIT
    WIZARD & USERS & GROUPS --> REPO_USER & REPO_GROUP & REPO_EXPENSE & REPO_SETTLE
    REPO_USER & REPO_GROUP & REPO_EXPENSE & REPO_SETTLE --> SUPABASE
```

### Conversational State Machine

```mermaid
stateDiagram-v2
    [*] --> AWAITING_DESCRIPTION: /add or [➕ Add Expense]
    AWAITING_DESCRIPTION --> AWAITING_AMOUNT: Valid text (1..255 chars)
    AWAITING_AMOUNT --> AWAITING_PAYER: Valid amount > 0 (paise)
    AWAITING_PAYER --> AWAITING_PARTICIPANTS: Select payer
    AWAITING_PARTICIPANTS --> AWAITING_SPLIT: Select ≥ 1 participants
    AWAITING_SPLIT --> CONFIRMATION: Equal split calculated
    AWAITING_SPLIT --> AWAITING_CUSTOM_INPUT: Custom split selected
    AWAITING_SPLIT --> AWAITING_PERCENT_INPUT: Percentage split selected
    AWAITING_CUSTOM_INPUT --> CONFIRMATION: Valid custom sum == total
    AWAITING_PERCENT_INPUT --> CONFIRMATION: Valid percentage == 100%
    CONFIRMATION --> SAVING: [✅ Confirm & Save]
    CONFIRMATION --> [*]: [❌ Cancel] or /cancel
    SAVING --> [*]: Persisted to Database & Group Notified
```

---

## 🗄 Database Schema

The database is built on PostgreSQL via Supabase, with full relational integrity and constraints:

- `users`: Registered Telegram users (`telegram_user_id` BigInt, `username`, `first_name`, `last_name`).
- `groups`: Tracked Telegram groups (`telegram_group_id` BigInt, `title`, `default_currency`).
- `group_members`: Membership mapping (`user_id`, `group_id`, `joined_at`, `is_active`).
- `expenses`: Logged expenses (`group_id`, `paid_by_user_id`, `description`, `total_amount`, `split_type`, `created_by_user_id`).
- `expense_splits`: Individual allocations (`expense_id`, `user_id`, `amount_owed`, `percentage`, `shares`).
- `settlements`: Recorded payments between members (`group_id`, `from_user_id`, `to_user_id`, `amount`, `status`).

---

## 🤖 Bot Commands

| Command | Chat Type | Description |
| :--- | :--- | :--- |
| `/start` | Private / Group | Initializes bot, auto-registers user/group, renders interactive menu |
| `/help` | Private / Group | Comprehensive command manual and instructions |
| `/add` | Group Only | Starts the multi-step expense creation wizard |
| `/members` | Group Only | Displays active registered members in the current group |
| `/balance` | Group Only | View your personal balance (paid, share, net standing) in the group |
| `/summary` | Group Only | View full group summary with creditors, debtors, and totals |
| `/cancel` | Group Only | Aborts the current active expense creation wizard session |
| `/settle` | Group Only | *(Coming Soon)* Debt-simplified settlement recommendations |

---

## 🛠 Tech Stack

| Technology | Purpose |
| :--- | :--- |
| **[Node.js](https://nodejs.org/)** (v20+) | High-performance asynchronous JavaScript runtime |
| **[TypeScript](https://www.typescriptlang.org/)** (v5.9+) | Static typing with strict mode enabled |
| **[grammY](https://grammy.dev/)** | Fast, robust, and extensible Telegram Bot framework |
| **[Supabase](https://supabase.com/)** | Managed PostgreSQL database with instant REST/realtime APIs |
| **[Zod](https://zod.dev/)** | Runtime schema validation for environment variables & callback data |
| **[Vitest](https://vitest.dev/)** | Blazing-fast unit testing runner |

---

## ⚡ Quickstart

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- A Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- A [Supabase](https://supabase.com/) project (PostgreSQL)

### 1. Clone & Install

```bash
git clone https://github.com/divyanshubochiwal04/BuddySplitter.git
cd BuddySplitter
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

```env
TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
NODE_ENV="development"
```

### 3. Database Migration

Run the SQL migration in your Supabase SQL Editor:
- File: [`supabase/migrations/20260919000000_create_buddysplitter_schema.sql`](supabase/migrations/20260919000000_create_buddysplitter_schema.sql)

### 4. Run Locally

```bash
# Typecheck
npm run typecheck

# Run unit tests
npm test

# Build production bundle
npm run build

# Start bot
npm start
```

---

## 🧪 Testing & Code Quality

BuddySplitter maintains a high standard of code health with a comprehensive test suite:

```bash
npm test
```

```text
 ✓ src/bot/commands/balance-commands.test.ts (8 tests)
 ✓ src/modules/balances/balance.calculator.test.ts (11 tests)
 ✓ src/modules/balances/balance.formatter.test.ts (6 tests)
 ✓ src/modules/balances/balance.service.test.ts (7 tests)
 ✓ src/modules/expenses/split/shares.test.ts (13 tests)
 ✓ src/modules/expenses/split/equal.test.ts (5 tests)
 ✓ src/modules/expenses/split/custom.test.ts (5 tests)
 ✓ src/modules/expenses/split/percentage.test.ts (4 tests)
 ✓ src/modules/expenses/expense-state.test.ts (4 tests)
 ✓ src/modules/expenses/expense-validation.test.ts (8 tests)
 ✓ src/modules/expenses/expense.service.test.ts (5 tests)
 ✓ src/modules/expenses/expense-flow.test.ts (20 tests)
 ✓ src/db/repositories/expenses.repository.test.ts (4 tests)
 ✓ src/db/repositories/settlements.repository.test.ts (5 tests)
 ✓ src/db/repositories/users.repository.test.ts (3 tests)
 ✓ src/db/repositories/groups.repository.test.ts (3 tests)
 ✓ src/db/repositories/group-members.repository.test.ts (3 tests)
 ✓ src/db/client.test.ts (1 test)
 ✓ src/modules/users/user.service.test.ts (2 tests)
 ✓ src/modules/groups/group.service.test.ts (2 tests)
 ✓ src/bot/middleware/registration.middleware.test.ts (3 tests)
 ✓ src/bot/callbacks/router.test.ts (4 tests)
 ✓ src/bot/callbacks/expense-callbacks.test.ts (9 tests)
 ✓ src/bot/commands/commands.test.ts (8 tests)
 ✓ src/bot/keyboards/keyboards.test.ts (7 tests)
 ✓ src/config/env.test.ts (6 tests)
 ✓ src/shared/currency.test.ts (6 tests)
 ✓ src/shared/errors.test.ts (3 tests)
 ✓ src/bot/bot.test.ts (1 test)

 Test Files  29 passed (29)
      Tests  154 passed (154)
```

---

## 🗺 Roadmap

- [x] **Phase 1: Foundation** — Node.js + strict TypeScript, Zod environment validation, graceful shutdown.
- [x] **Phase 2: Database Layer** — Supabase PostgreSQL schema with 6 tables, integer minor-unit paise, repository patterns.
- [x] **Phase 3: Telegram Core** — User/group auto-registration, interactive `/start`, `/help`, `/members`, callback router.
- [x] **Phase 4: Expense Flow** — Conversational wizard, 3 split engines (Equal, Custom, Hare-Niemeyer Percentage), idempotent lock, compensating rollback.
- [x] **Phase 5: Advanced Splits** — Share-based split (`shares` split type) with dynamic stepper UI, deterministic largest remainder rounding, participant modification, and split method switching.
- [x] **Phase 6: Balance Engine** — Mathematical net balance calculator, `/balance`, `/summary`, conservation invariant verification, deterministic sorting.
- [ ] **Phase 7: Settlement Engine** — Debt simplification algorithm (min-cash-flow graph solver), `/settle`.
- [ ] **Phase 8: Repayments** — Record member-to-member repayments (`/pay`, `/settled`), payment audit log.
- [ ] **Phase 9: Expense Management** — Expense history (`/expenses`), edit/delete with authorization checks.
- [ ] **Phase 10: UX Polish** — Multi-currency formatting, inline reminder notifications.
- [ ] **Phase 11: Security & Rate Limiting** — Antispam throttling, input sanitization, integration testing.
- [ ] **Phase 12: Production Deployment** — Docker containerization, Telegram webhook runner.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <sub>Built with ❤️ for hassle-free group expenses directly in Telegram.</sub>
</div>
