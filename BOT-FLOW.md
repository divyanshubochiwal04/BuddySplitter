# BuddySplitter — Telegram Bot Conversational Flow & State Machine

This document details the Telegram conversational flows, state machine lifecycle, step transitions, commands, and inline callback protocols implemented in BuddySplitter.

---

## 1. High-Level Conversational State Machine

Expense creation in BuddySplitter is an interactive multi-step wizard conducted directly inside Telegram group chats.

```text
[➕ Add Expense / /add]
           │
           ▼
   [AWAITING_DESCRIPTION]  ──(user sends text)──► Validate 1..255 chars
           │
           ▼
      [AWAITING_AMOUNT]    ──(user sends amount)► Validate & convert to integer paise
           │
           ▼
      [AWAITING_PAYER]     ──(inline buttons)───► [🙋 I Paid] or [👥 Someone Else]
           │
           ▼
   [AWAITING_PARTICIPANTS] ──(inline buttons)───► [✅/⬜ Toggle], [Select All], [Done]
           │
           ▼
     [AWAITING_SPLIT]      ──(inline buttons)───► [⚖️ Equal], [✏️ Custom], [📊 Percent]
           │
           ├── Equal ────────────────────────────────────────┐
           ├── Custom  ──► [AWAITING_CUSTOM_INPUT]  ──(text)─┤
           └── Percent ──► [AWAITING_PERCENT_INPUT] ──(text)─┤
                                                             ▼
                                                    [CONFIRMATION]
                                                    [✅ Confirm & Save] [❌ Cancel]
                                                             │
                                                             ▼
                                                    [SAVING] (Idempotent lock)
                                                             │
                                                             ▼
                                                    Database Insert & Rollback Guard
                                                             │
                                                             ▼
                                                    Group Success Announcement
```

---

## 2. Session & State Isolation

- **Composite State Key:** `chatId:userId`
  - Expenses are scoped per user and per group chat.
  - Multiple users can draft expenses simultaneously within the same group without state collisions.
  - The same user in multiple groups maintains isolated drafts.
- **TTL Expiration:** 15 minutes
  - Inactive drafts automatically expire after 15 minutes of inactivity.
  - Expired drafts are cleanly purged from memory upon subsequent lookups.
- **Cancellation:**
  - Users can cancel at any time using `/cancel` or tapping `[❌ Cancel]`.
  - Cancellation frees the draft session immediately.

---

## 3. Step-by-Step Flow Specification

### Step 0: Entry Point & Chat Type Guard
- **Triggers:**
  - Slash command: `/add`
  - Inline keyboard button: `[➕ Add Expense]` (`action:add_expense`)
- **Validation:**
  - Allowed chats: `group` and `supergroup`.
  - If triggered in private chat: Responds with `"⚠️ Expenses can only be added inside a group."`
- **Initial Action:**
  - Initializes `ExpenseDraft` for `${chatId}:${userId}`.
  - Sets `step = 'AWAITING_DESCRIPTION'`.
  - Prompts: `"📝 What is this expense for?\n\nSend the description (e.g. Dinner, Groceries, Cab fare)..."`

---

### Step 1: Description Input
- **Input Type:** Telegram text message.
- **Validation:**
  - Non-empty text, trimmed.
  - Minimum 1 character, maximum 255 characters.
- **Transition:**
  - Saves description in draft.
  - Sets `step = 'AWAITING_AMOUNT'`.
  - Prompts: `"💰 How much was spent?\n\nEnter amount in ₹ (e.g. 1500 or 1500.50):"`

---

### Step 2: Amount Input (Minor Currency Units)
- **Input Type:** Telegram text message.
- **Accepted Formats:**
  - Integer amounts: `1500`, `₹1500`, `Rs 1500`
  - Decimal amounts: `1500.50`, `₹1500.75`
- **Validation:**
  - Must be a positive amount > 0.
  - Maximum 2 decimal places.
  - Converted directly to integer paise: `₹1 = 100 paise`.
  - Zero floating-point arithmetic drift throughout the application.
- **Transition:**
  - Saves `totalAmount` (in paise) in draft.
  - Sets `step = 'AWAITING_PAYER'`.
  - Renders inline keyboard:
    - `[🙋 I Paid (You)]` (`exp:payer:me`)
    - `[👥 Someone Else]` (`exp:payer:pick`)

---

### Step 3: Payer Selection
- **Input Type:** Telegram inline keyboard callback.
- **Options:**
  - **Self:** `[🙋 I Paid (You)]` sets the initiating user's internal database UUID as `payerId`.
  - **Other Member:** `[👥 Someone Else]` queries active group members from database and displays an inline keyboard with each member's name (`exp:payer:set:<userId>`).
- **Transition:**
  - Validates selected user is an active group member.
  - Pre-selects all active group members as default participants.
  - Sets `step = 'AWAITING_PARTICIPANTS'`.
  - Displays participant selection keyboard.

---

### Step 4: Participant Selection
- **Input Type:** Telegram inline keyboard callback.
- **UI Elements:**
  - Member toggle buttons: `[✅ Alice]` / `[⬜ Bob]` (`exp:part:toggle:<userId>`)
  - Batch select button: `[Select All]` (`exp:part:all`)
  - Finish button: `[Done (N selected)]` (`exp:part:done`)
- **Validation:**
  - At least 1 participant must be selected before advancing.
- **Transition:**
  - Sets `step = 'AWAITING_SPLIT'`.
  - Prompts: `"How would you like to split the expense?"`
  - Renders split selection keyboard:
    - `[⚖️ Split Equally]` (`exp:split:equal`)
    - `[✏️ Custom Exact Amounts]` (`exp:split:custom`)
    - `[📊 Split by Percentage]` (`exp:split:percent`)

---

### Step 5: Split Calculation & Details

#### A. Equal Split (`exp:split:equal`)
- **Formula:** `base = floor(totalPaise / N)`, `remainder = totalPaise % N`
- **Paise Precision:** Deterministically allocates 1 extra paisa to the first `remainder` participants.
- **Verification:** `sum(splits) === totalPaise` strictly guaranteed.
- **Transition:** Immediately generates splits and advances to **Confirmation**.

#### B. Custom Exact Amounts (`exp:split:custom`)
- **Prompt:** Shows total amount and asks for each participant's share.
- **Input Formats:**
  - Line-by-line: `Alice: 500\nBob: 700`
  - User ID / Name mapping.
- **Validation:**
  - All assigned amounts must be positive integers in paise.
  - Sum of assigned amounts must exactly equal `totalAmount`.
  - Clear error feedback shows shortage/overage (e.g., `"Short by ₹20.00"`).
- **Transition:** Upon valid sum match, advances to **Confirmation**.

#### C. Percentage Split (`exp:split:percent`)
- **Prompt:** Asks for percentage breakdown for each participant.
- **Algorithm:** **Hare-Niemeyer / Largest Remainder Method**:
  1. Calculate floor paise for each percentage.
  2. Rank fractional remainders descending.
  3. Distribute leftover paise one by one to highest remainders.
- **Validation:**
  - Sum of percentages must equal 100%.
  - Total allocated paise equals `totalAmount` with zero rounding loss.
- **Transition:** Advances to **Confirmation**.

#### D. Shares Split (`split:shares`)
- **Prompt:** `"🔢 Give each person their number of shares."`
- **Interactive Stepper UI:**
  - Each participant has a stepper row: `[➖]` `[ N shares ]` `[➕]`.
  - Default: 1 share per participant.
  - Decrement is strictly bounded at minimum 1 share (`share:dec:<userId>`).
  - Increment increments by 1 (`share:inc:<userId>`).
- **Deterministic Largest Remainder Rounding:**
  1. Floor allocation: `floorAmount_i = floor((totalAmount * s_i) / totalShares)`.
  2. Exact integer remainder: `remainder_i = (totalAmount * s_i) % totalShares`. Zero floating point operations.
  3. Unallocated paise: `totalAmount - sum(floorAmounts)`.
  4. Rank descending by `remainder_i`, breaking ties deterministically by original index.
  5. Top remainder participants receive +1 paise until unallocated paise is exhausted.
- **Invariant Guarantee:** `sum(all participant paise) === totalAmount`.
- **Transition:** On `[➡️ Continue]` (`share:continue`), advances to **Confirmation**.

---

### Step 6: Confirmation Preview & Dynamic Modification

- **Rendered Message:**
  ```text
  🧾 Dinner

  💰 Total: ₹3,000.00
  👤 Paid by: Dev

  Split:
  • Dev — ₹1,500.00 (2 shares)
  • Rahul — ₹750.00 (1 share)
  • Aman — ₹750.00 (1 share)

  Method: 🔢 Shares
  ```
- **Inline Controls:**
  - `[✅ Save Expense]` (`exp:confirm`): Idempotently persists expense to database.
  - `[✏️ Change Split]` (`exp:change_split`): Returns to split selection without losing description, amount, payer, or participants. Discards previous splits and recalculates from original total with zero accumulated error.
  - `[👥 Change Participants]` (`exp:change_participants`): Modifies participant checkboxes. Discards old split calculations and requires fresh split calculation upon continuation.
  - `[✏️ Change Payer]` (`exp:change_payer`): Selects a different payer while keeping participants independent.
  - `[❌ Cancel]` (`exp:cancel`): Aborts draft and frees session.

---

### Step 7: Atomic Persistence & Rollback Guard
- **Idempotency Guard:**
  - When `[✅ Confirm & Save]` is pressed, draft immediately transitions to `SAVING`.
  - Subsequent duplicate clicks are dropped, preventing duplicate database records.
- **Database Atomicity:**
  - Creates record in `expenses` table.
  - Creates individual records in `expense_splits` table.
  - **Rollback Guard:** If `expense_splits` insertion encounters any error, the newly created `expenses` row is deleted immediately, preventing orphaned/partial expenses.
- **Success Notification:**
  - Draft is cleared from memory.
  - Edit or post success confirmation in group chat:
    ```text
    ✅ Expense Added!

    📝 Dinner at Olive Bistro
    💰 ₹2,400.00 paid by John Doe
    👥 Split among 3 members:
      • John Doe: ₹800.00
      • Jane Smith: ₹800.00
      • Bob: ₹800.00
    ```

---

## 4. Callback Query Protocol Reference

| Callback Data Pattern | Handler | Action Description |
| :--- | :--- | :--- |
| `action:add_expense` | `router.ts` | Entry point from group menu to start `/add` flow |
| `exp:payer:me` | `expense-callbacks.ts` | Assigns current user as payer |
| `exp:payer:pick` | `expense-callbacks.ts` | Renders list of group members to select payer |
| `exp:payer:set:<userId>` | `expense-callbacks.ts` | Assigns selected member as payer |
| `exp:part:toggle:<userId>` | `expense-callbacks.ts` | Toggles member participation checkbox |
| `exp:part:all` | `expense-callbacks.ts` | Selects all active group members |
| `exp:part:done` | `expense-callbacks.ts` | Validates selection and advances to split selection |
| `exp:split:equal` | `expense-callbacks.ts` | Calculates equal split and shows confirmation |
| `exp:split:custom` | `expense-callbacks.ts` | Prompts user for custom amounts per participant |
| `exp:split:percent` | `expense-callbacks.ts` | Prompts user for percentage per participant |
| `exp:confirm:save` | `expense-callbacks.ts` | Idempotently persists expense and splits to database |
| `exp:cancel` | `expense-callbacks.ts` | Cancels draft and deletes temporary state |

---

## 5. Security & Validation Checklist

- [x] BigInt Telegram ID safe representation.
- [x] Money stored exclusively in integer minor units (paise). Zero floating point operations in database or calculations.
- [x] Payer and participants strictly validated to belong to the active group.
- [x] Double-tap protection using `SAVING` atomic lock.
- [x] Orphan expense protection via automatic rollback on split insert failure.
- [x] 15-minute TTL per draft to prevent memory leaks.
- [x] Isolated state keys preventing cross-user race conditions.
