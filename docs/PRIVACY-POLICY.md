# BuddySplitter Privacy Policy

**Effective Date**: September 19, 2026  
**Last Updated**: September 19, 2026  

> *Notice*: This document describes BuddySplitter’s intended data practices. Applicable legal requirements may vary by jurisdiction. BuddySplitter is an open-source tool designed to facilitate group expense tracking and balance calculations.

---

## 1. Introduction

BuddySplitter ("we", "us", or "the bot") is a Telegram bot designed to help friend groups, roommates, and travel buddies track shared expenses, compute outstanding balances, and plan repayments without spreadsheets.

We are committed to transparent data practices and data minimization. We only collect and process information strictly necessary to provide the expense-splitting service.

---

## 2. Information We Collect and Receive

### A. Telegram Account Data
When you interact with BuddySplitter (either directly or within a Telegram group where the bot is a member), we receive basic profile information provided by the Telegram Bot API:
- **Telegram User ID** (unique numeric identifier required to attribute expenses and balances)
- **First Name** and optional **Last Name** (used for human-readable display in balances and split summaries)
- **Telegram Username** (optional, used to mention members when settling up)

We **do not** collect or have access to:
- Your phone number
- Your private chats or chat history with other users
- Your contact list
- Your location data
- Media files, photos, or documents sent in your groups

### B. Group Chat Data
When BuddySplitter is added to a group:
- **Telegram Chat ID** (numeric identifier used to group related expenses)
- **Group Title** (used to label expense reports and menus)
- **Active Membership List** (mapping of registered users belonging to the group)

BuddySplitter operates with Telegram **Privacy Mode enabled**. We do not read, log, or store general group messages or conversations. We only process messages that explicitly start with a bot command (e.g. `/add`, `/settle`) or text sent in direct reply to an active expense creation prompt.

### C. Expense & Transaction Data
When group members create expenses or record repayments:
- **Expense Description** (e.g. "Dinner", "Groceries")
- **Amount** (stored in integer minor units / paise for precision)
- **Currency** (e.g. INR)
- **Payer Identification** (which member paid)
- **Participant Shares / Splits** (who participated and their calculated share)
- **Repayment Records** (payer, recipient, amount settled, and timestamp)
- **Timestamps** (creation, modification, and settlement dates)

---

## 3. Why We Collect This Data

Every data point stored by BuddySplitter directly serves core functional accounting:
- **To attribute expenses**: Knowing who paid and who participated allows calculating net balances.
- **To compute optimal settlements**: Determining the minimal number of transactions required to resolve debts.
- **To provide transparency**: Allowing members to view past expenses via `/expenses` and payment receipts via `/payments`.
- **To identify users**: Ensuring that only group members can participate in splits and confirm repayments.

We **do not**:
- Sell your data to third parties.
- Use your data for advertising, profiling, or behavioral analytics.
- Use your expense descriptions or data to train artificial intelligence or machine learning models.

---

## 4. Data Storage and Infrastructure

- **Database**: Data is stored securely in a managed Supabase PostgreSQL database instance.
- **Encryption**: All database connections and Telegram API communications utilize TLS/HTTPS encryption in transit.
- **Access Control**: Database operations are executed using secure server-side credentials. Credentials and API tokens are never exposed to clients or logged.

---

## 5. Data Retention Approach

BuddySplitter maintains two tiers of data:
1. **Interactive Conversational State**: In-memory draft states (such as entering a description or selecting splits) are held in volatile process memory with a 15-minute Time-to-Live (TTL) expiration. Once completed or cancelled, drafts are immediately discarded.
2. **Shared Financial Ledger**: Group expense records, splits, and settlement receipts are retained as long as the group uses the bot. This is required to maintain mathematical balance integrity ($sum(balances) = 0$).

---

## 6. User Rights & Data Deletion

### A. Inspecting Your Data (`/my_data`)
You can view a summary of the personal data stored about your account at any time by sending the `/my_data` command to the bot. This reports your registered details, group count, and transaction statistics.

### B. Anonymizing & Deleting Your Data (`/delete_my_data`)
You may request deletion and anonymization of your data by running `/delete_my_data` in the bot:
- **What is deleted/anonymized**: Your first name, last name, and username are immediately overwritten with generic placeholder values (`Deleted User`). Your group membership records are marked inactive and labeled `Former Member`.
- **What is retained for ledger integrity**: Past expense split amounts and settlement transaction records are retained without your personal identifying details. Hard-deleting historical records would distort or invalidate other members' balances and unresolved debts.

---

## 7. Third-Party Services

BuddySplitter interacts with the following third-party infrastructure:
- **Telegram Bot API** ([Telegram Privacy Policy](https://telegram.org/privacy)): Facilitates messaging and interaction delivery.
- **Supabase / PostgreSQL** ([Supabase Privacy Policy](https://supabase.com/privacy)): Provides secure cloud database storage.

---

## 8. Children's Privacy

BuddySplitter is not directed to children under 13 years of age. We do not knowingly collect personal information from children.

---

## 9. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect operational or technical enhancements. Any updates will be reflected in this document with a revised "Last Updated" date.

---

## 10. Contact

For questions regarding this policy, data practices, or open-source contributions, please open an issue in the official project repository at:
https://github.com/divyanshubochiwal04/BuddySplitter
