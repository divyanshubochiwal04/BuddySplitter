# Telegram Bot Platform Compliance Audit

**Audit Date**: September 19, 2026  
**Audited Platform**: BuddySplitter Telegram Bot (Node.js/TypeScript, grammY framework)  
**Applicable Platform Standards & Policies**:
1. [Telegram Bot Platform Developer Terms of Service](https://telegram.org/tos/bot-developers)
2. [Telegram Privacy Policy](https://telegram.org/privacy)
3. [Telegram Standard Privacy Policy for Third-Party Applications](https://telegram.org/privacy-tpa)
4. [Telegram Bot Features & Privacy Mode](https://core.telegram.org/bots/features)
5. [Telegram Bot FAQ](https://core.telegram.org/bots/faq)

---

## 1. Compliance Audit Matrix

Status legend:
- **PASS**: Verified in code implementation.
- **NEEDS_CHANGE**: Identified discrepancy that required remediation (resolved in Phase 11).
- **NOT_APPLICABLE**: Requirement pertains to features not present in BuddySplitter (e.g. payment processing, webhooks, mini-apps).
- **NEEDS_HUMAN_REVIEW**: External developer manual action, BotFather settings, or legal jurisdictional review required.

| Requirement | Category | Status | Evidence in BuddySplitter | Required Fix / Remediation | Implementation |
|---|---|---|---|---|---|
| **Privacy Mode Default** (Do not read arbitrary messages) | Data Minimization | **PASS** | `src/bot/bot.ts` handles explicit commands (`/start`, `/add`, etc.), inline button callbacks, and in-flow message states. Does not process or record arbitrary chat messages. | Ensure Privacy Mode remains enabled in BotFather; do not request unrestricted message access. | `src/bot/bot.ts` in-flow text handler strictly matches ongoing user draft (`handleExpenseTextInput`, `handlePaymentTextInput`). |
| **No Message Scraping** | Privacy | **PASS** | `src/db/repositories/`: No chat messages, conversation transcripts, media, or files are persisted to database tables. | Verify database tables store only structured expense data (description, amount, splits). | `src/db/types.ts` only stores `expenses`, `expense_splits`, `settlements`, `group_members`, and `users`. |
| **Data Minimization** | Privacy | **PASS** | Only Telegram user ID, first name, optional last name, and optional username are recorded upon active interaction. | Never collect phone numbers, contact books, location coordinates, or photos. | `src/bot/middleware/registration.middleware.ts` records only `id`, `first_name`, `last_name`, `username`. |
| **Privacy Policy Availability** | Transparency | **PASS** | User command `/privacy` provided; points to hosted `PRIVACY_POLICY_URL` or displays clear local fallback statement. | Provide user-accessible `/privacy` command and optional environment variable. | Implemented in `src/bot/commands/privacy.ts` and `src/config/env.ts`. |
| **User Data Deletion Mechanism** | User Rights | **PASS** | User command `/delete_my_data` allows users to anonymize their profile while preserving shared financial ledger integrity. | Implement `/delete_my_data` with confirmation and financial accounting protection. | Implemented in `src/bot/commands/delete-data.ts`, `src/modules/users/user.service.ts`, and `src/bot/callbacks/router.ts`. |
| **User Data Inspection / Export** | Transparency | **PASS** | User command `/my_data` provides a summary of the requesting user's stored account and accounting activity. | Add `/my_data` command showing only the caller's own records without leaking internal IDs or secrets. | Implemented in `src/bot/commands/my-data.ts` and `src/modules/users/user.service.ts`. |
| **Credential & Secret Protection** | Security | **PASS** | `TELEGRAM_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` are read via environment variables. `.env` is gitignored. No secrets in error responses or logs. | Audit git history, sanitize logger, and add safe error handler. | `src/shared/errors.ts:safeErrorMessage`, `.gitignore`, `src/config/env.ts`. |
| **No Unsolicited Spam or Marketing** | Anti-Spam | **PASS** | Messages are exclusively triggered by user interactions (commands, button callbacks, active expense creation). No unsolicited DMs, marketing broadcasts, or referral spam. | Strict prohibition on background broadcast queues or unsolicited messages. | `src/bot/bot.ts` only responds to updates directed at the bot. |
| **Independent Branding** | Intellectual Property | **PASS** | Bot is named "BuddySplitter". No claim of being an official Telegram service or affiliated with Telegram FZ-LLC. | Use independent branding throughout `/start`, `/help`, and documentation. | `src/bot/messages/` and `README.md` use independent naming. |
| **Rate Limiting Protection** | Platform Stability | **PASS** | In-memory sliding-window rate limiter protects bot endpoints against spam bursts and double-click replay. | Implement application-level rate limiter for mutating and query actions. | `src/shared/rate-limiter.ts` applied to commands and callbacks. |
| **Financial Intermediary Disclaimer** | Truth in Advertising | **PASS** | Documentation and privacy policy state BuddySplitter is an expense calculator and ledger tracker, not a bank, escrow, or regulated financial intermediary. | Include clear disclaimers in privacy policy and documentation. | `docs/PRIVACY-POLICY.md` and `/privacy` message. |
| **BotFather Privacy Policy Link** | BotFather Settings | **NEEDS_HUMAN_REVIEW** | BotFather allows setting a public Privacy Policy URL via `/setprivacypolicy`. Requires live deployment URL. | Developer must set the URL in @BotFather once public hosting URL is established. | Documented in BotFather Manual Checklist. |
| **BotFather Privacy Mode Setting** | BotFather Settings | **NEEDS_HUMAN_REVIEW** | Privacy Mode is enabled by default for bots created via @BotFather. Developer must ensure it is not disabled. | Verify with @BotFather `/setprivacy` that Privacy Mode is `ENABLED`. | Documented in BotFather Manual Checklist. |
| **Applicable Statutory Legal Compliance (GDPR/DPDP/CCPA)** | Legal Compliance | **NEEDS_HUMAN_REVIEW** | BuddySplitter provides privacy controls (export, anonymization, minimization), but legal compliance requires formal legal review in target jurisdictions. | Conduct legal review before commercial operation. | Documented with disclaimer; no false compliance claims made. |

---

## 2. Distinction: Code-Verifiable vs Manual / Legal Review

### A. Code-Verifiable Items (Verified in Test Suite)
- **Data Minimization**: Zero storage of chat text, media, location, or telemetry.
- **Input Sanitization**: Markdown characters escaped with `escapeMarkdown()` to prevent formatting injection.
- **Error Sanitization**: `safeErrorMessage()` prevents SQL errors, table schemas, or stack traces from reaching Telegram users.
- **User Verification**: `/delete_my_data` callbacks verify that `ctx.from.id` matches the deletion target, preventing cross-user deletions.
- **Cross-Group Isolation**: All expense and settlement operations verify active group membership and group ID match.
- **Rate Limiting**: Sliding window protects against abusive command execution.
- **Financial Ledger Integrity**: Anonymizing a user preserves foreign key relationships and transaction amounts, preventing group debt distortion.

### B. Manual / Legal Review Required
- **BotFather Configuration**: Verification of @BotFather settings (Privacy Mode, Bot Description, About text, Privacy Policy URL).
- **Hosting & Infrastructure**: SSL/TLS certificate configuration, secure server hosting environment (deferred to Phase 12).
- **Statutory Legal Compliance**: Formal GDPR / India DPDP / US state privacy law analysis by qualified legal counsel.

---

## 3. Manual BotFather Checklist

Before making BuddySplitter available in production, the developer must manually verify the following settings with `@BotFather`:

- [ ] **Bot Name & Username**: Ensure username ends with `bot` (e.g. `@BuddySplitterBot`) and name does not infringe Telegram trademarks.
- [ ] **About & Description**: State clearly that BuddySplitter is a group expense tracker. Avoid claiming official affiliation with Telegram.
- [ ] **Privacy Mode**: Run `/setprivacy` in `@BotFather` and verify it is set to **`ENABLED`**. BuddySplitter is built to operate under Privacy Mode.
- [ ] **Privacy Policy URL**: Run `/setprivacypolicy` in `@BotFather` and provide the URL to the published `PRIVACY-POLICY.md`.
- [ ] **Group Joining**: Run `/setjoingroups` and ensure **`ENABLED`** so users can add the bot to expense-splitting groups.
- [ ] **Inline Mode**: Only enable if inline query splitting is explicitly implemented.
- [ ] **Admin Privileges**: Do not request or require administrator privileges in groups. BuddySplitter functions as a standard group member.
- [ ] **Token Security**: Store `TELEGRAM_BOT_TOKEN` in server environment secrets. Never commit to public repositories.

---

## 4. Policy Compliance Test Matrix

| Area | Status | Notes |
|---|---|---|
| **Privacy Mode Compatibility** | PASS | Operates strictly via commands and interactive state prompts |
| **No Message Scraping** | PASS | Group text ignored unless user is in an active draft flow |
| **Data Minimization** | PASS | Only basic Telegram user info recorded |
| **Privacy Policy Access** | PASS | `/privacy` command with dynamic or fallback text |
| **Data Export** | PASS | `/my_data` command gives complete transparency into user records |
| **Data Deletion / Anonymization** | PASS | `/delete_my_data` anonymizes user while preserving ledger balance |
| **Credential Security** | PASS | Zero secrets in repository, error messages, or logs |
| **Anti-Spam Compliance** | PASS | Purely interactive, no broadcasts, no unsolicited messaging |
| **Rate Limit Protection** | PASS | Process-local limiter active; prevents flood |
| **Independent Branding** | PASS | Clear distinction from Telegram FZ-LLC |
| **Jurisdictional Legal Compliance** | NEEDS_HUMAN_REVIEW | Requires legal review for specific deployment jurisdictions |
