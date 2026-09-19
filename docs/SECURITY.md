# BuddySplitter Security Architecture & Threat Model

**Audit Date**: September 19, 2026  
**Document Version**: Phase 11 Hardening  

---

## 1. Threat Model & Security Boundaries

BuddySplitter is a group expense-splitting bot interacting via the Telegram Bot API and storing persistent state in a PostgreSQL database (via Supabase).

### Core Assets Protected
1. **Financial Ledger Integrity**: Ensuring group balances sum strictly to zero ($sum = 0$), splits cannot be forged, and debts cannot be manipulated.
2. **Cross-Group Isolation**: Preventing members of Group A from accessing, viewing, editing, or deleting expenses or settlements belonging to Group B.
3. **User Privacy & Identity**: Protecting Telegram user identifiers, preventing message scraping, and preventing impersonation during financial actions.
4. **Platform Availability**: Defending against flood, abuse, double submissions, and state pollution.

---

## 2. Authentication Model

- **Identity Provider**: Telegram Bot API handles authentication. Each update includes a cryptographic Telegram user ID (`ctx.from.id`) and chat ID (`ctx.chat.id`).
- **Zero Client Credentials**: End users do not register passwords or tokens with BuddySplitter.
- **Bot Authentication**: The bot authenticates to the Telegram API using `TELEGRAM_BOT_TOKEN`, and to the database using `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY`.

---

## 3. Authorization Model

Authorization is strictly enforced in the domain and service layers, never trusted from client payloads alone:

| Action | Required Authorization | Verification Logic |
|---|---|---|
| **View Group Balances / Summary** | Active group member | `GroupMemberRepository.findByGroupAndUser` checks `is_active === true` |
| **Create Expense** | Active group member | Payer and all participants must belong to active group membership set |
| **Edit Expense Description** | Expense Creator or Payer | `expense.created_by === userId \|\| expense.paid_by === userId` |
| **Delete Expense** | Expense Creator or Payer | Must be creator/payer AND expense must not have repayment activity |
| **Record Repayment** | Active group member (debtor) | Payer must owe money to recipient in the group settlement plan |
| **Data Deletion Confirmation** | Target user only | `ctx.from.id === targetUserId` validated on callback execution |

---

## 4. Cross-Group Isolation

All database queries for expenses, balances, and settlements are strictly scoped by `group_id`:
- In `ExpenseRepository`, methods `findByGroupId`, `countActiveByGroupId`, and `findActiveExpensesWithSplitsByGroupId` require explicit `group_id`.
- `softDeleteExpense` and `updateExpenseDescription` verify `expense.group_id === groupId`. If an ID from Group B is passed by a user in Group A, a `NotFoundError` is thrown.
- Telegram Chat IDs are mapped to internal UUIDs through `GroupRepository.findByTelegramChatId`, ensuring non-collision.

---

## 5. Secrets Management & Hygiene

- **Storage**: Secrets (`TELEGRAM_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`) are managed exclusively via environment variables.
- **Git Hygiene**: `.env` and `.env.*` are excluded in `.gitignore`. Only `.env.example` with blank placeholders is committed.
- **Server-Side Only**: `SUPABASE_SERVICE_ROLE_KEY` is never sent to the Telegram client, never output in logs, and never returned in error messages.
- **History Audit**: Verified zero tokens or keys committed in git revision history.

---

## 6. Input Validation & Money Safety

- **Integer Minor Units**: All monetary values are processed and stored as integer minor units (paise in INR). Floating-point representations for currency storage are strictly prohibited.
- **Zod Schema Validation**: All callback payloads, environment configurations, and inputs are validated using Zod schemas (`callbackDataSchema = z.string().min(1).max(64)`).
- **Domain Validation**:
  - Rejects `NaN`, `Infinity`, negative numbers, or fractions of minor units.
  - Rejects empty descriptions or descriptions exceeding 255 characters.
  - Verifies that sum of splits equals total amount down to the exact paise.
  - Rejects repayment exceeding the debt owed.

---

## 7. Output Sanitization & Markdown Injection Defense

- User-controlled inputs (names, group titles, expense descriptions) are passed through `escapeMarkdown()` before rendering in Telegram messages.
- Escapes special syntax characters: `*`, `_`, `` ` ``, and `[`.
- Prevents malicious formatting injection from altering the visual structure of settlement receipts or balance summaries.

---

## 8. Error Sanitization

- Global bot error handling (`bot.catch`) logs technical error details to server logs but returns generic, friendly messages to end users.
- `safeErrorMessage()` in `src/shared/errors.ts` ensures that database errors, SQL syntax exceptions, and Supabase query details are never reflected back to Telegram users.

---

## 9. Rate Limiting & Abuse Prevention

- **In-Memory Sliding Window**: `RateLimiter` in `src/shared/rate-limiter.ts` limits request frequencies:
  - Query actions (`/balance`, `/summary`, `/expenses`, `/members`): 30 requests per minute per user.
  - Mutating actions (`/add`, `/settle` payments, deletions, edits): 10 requests per minute per user.
- **User Feedback**: Polite `⏳ You’re doing that a bit too fast` notification sent when throttled.
- **Bounded Memory**: Expired rate-limiting timestamps are automatically pruned.
- **Known Limitation**: The rate limiter is currently process-local / in-memory. For horizontally scaled multi-container deployments, a distributed Redis-based limiter is required (deferred to Phase 12).

---

## 10. Replay & Idempotency Protection

- **Payment Confirmation**: Checking current debt before creating settlement prevents double-payment execution.
- **Deletion Guards**: Soft-delete marks `deleted_at`; subsequent calls return `{ alreadyDeleted: true }`.
- **State Draft Isolation**: State managers (`ExpenseStateManager`, `PaymentStateManager`) use composite `chatId:userId` keys with 15-minute TTL. Rapid duplicate button taps during in-flight operations are ignored.

---

## 11. Dependency Security Audit (`npm audit`)

As of Phase 11 audit:
- `@vitest/mocker` / `vitest` reported moderate severity (GHSA-82fw-gwwq-j7x9 - path traversal in test mock redirection).
- **Exploitability Analysis**: `vitest` is a development dependency used strictly for running local automated tests. It is never deployed, executed, or exposed in production environments.
- **Action**: Monitored; breaking major upgrades to test framework are avoided in this phase to preserve test suite stability. Production runtime dependencies (`grammy`, `@supabase/supabase-js`, `zod`, `dotenv`) have 0 known vulnerabilities.

---

## 12. Incident Response Basics

In the event of a suspected security incident:
1. **Token Revocation**: Immediately revoke and regenerate `TELEGRAM_BOT_TOKEN` in `@BotFather` and update environment secrets.
2. **Supabase Key Rotation**: Rotate `SUPABASE_SERVICE_ROLE_KEY` in the Supabase Dashboard.
3. **Database Audit**: Inspect `expenses`, `expense_splits`, and `settlements` tables for unexpected mutations.
4. **Log Inspection**: Review application logs for unexpected unhandled error spikes or unauthorized access attempts.
