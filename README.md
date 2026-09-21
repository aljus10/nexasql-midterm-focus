# NexaSQL Midterm Focus — Pattern Recognition Edition

A personal, browser-based SQL trainer built around the **NexaCart E-Commerce Marketplace** star schema.

This edition changes the learning flow so you do **not** begin with a blank SQL editor. Each of the six common business-query patterns is learned through a four-step recognition ladder:

1. **Arrange lines** — drag complete SQL clauses into the correct order.
2. **Build from blocks** — arrange smaller keywords, tables, conditions, and calculations.
3. **Fill the gaps** — complete a nearly finished query using a word bank or by typing the missing pieces.
4. **Type from scratch** — solve the business question in a normal SQL editor, like the midterm.

A later step unlocks after you correctly complete **two different questions** in the previous step. Existing mastery from older NexaSQL builds can also unlock later steps automatically.

## The six midterm-focused patterns

1. Totals & KPIs
2. Top-N rankings
3. Category & place analysis
4. Monthly / yearly trends
5. Customers & sellers
6. Filtered rankings such as “Top 10 products in Manila in 2025”

Advanced SQL remains outside the main path so the site can focus on the questions most likely to appear in a business-analysis practical exam.

## Run it

1. Extract the folder somewhere permanent, for example `Documents/NexaSQL-Midterm-Focus`.
2. Open that folder in VS Code.
3. Open the VS Code terminal.
4. Run:

```bash
python serve.py
```

5. Open:

```text
http://localhost:8080
```

Use the **same browser profile** and the **same address/port** every time so your progress remains available.

If Chrome shows an older copy after replacing the project files, use **Ctrl + Shift + R** once.

## Practice database

The first launch needs internet access because the page downloads PGlite, the PostgreSQL-in-the-browser engine. NexaSQL then creates a local PostgreSQL database in your browser's IndexedDB.

The training database mirrors the star-schema structure used in the Supabase project:

- `dim_customer`
- `dim_product`
- `dim_seller`
- `dim_payment`
- `dim_shipping`
- `fact_order_items`

The local practice dataset contains:

- 500 customers
- 150 products
- 30 sellers
- 5 payment methods
- 5 shipping options
- 10,000 unique orders
- 25,000 order-item fact rows

Your training database is local and separate from your real Supabase project.

## Learning progress

Progress is stored in browser `localStorage`. The SQL training database is stored separately in browser IndexedDB.

The site tracks:

- XP and study streak
- six pattern-mastery scores
- puzzle-stage completion for each pattern
- free-typing attempts
- recent practice
- mock-midterm scores

Use **Export progress** regularly to download a JSON backup. **Import progress** restores it later.

## How the puzzle ladder works

The main objective is:

```text
SEE the pattern
    ↓
ARRANGE the pattern
    ↓
COMPLETE the pattern
    ↓
TYPE the pattern
    ↓
APPLY it to a new business question
```

The first puzzle teaches the normal clause sequence:

```text
SELECT
FROM
JOIN
WHERE
GROUP BY
ORDER BY
LIMIT
```

Not every query needs every clause. For example, a total-sales KPI may only need `SELECT` and `FROM`.

## Mock Midterm

The mock exam intentionally removes the puzzle support. It gives 10 business questions in 20 minutes and uses a normal blank SQL editor so it still tests whether you can apply the patterns independently.

## Important exam distinctions

```text
COUNT(*)
= fact/order-item rows

COUNT(DISTINCT order_number)
= unique customer orders

SUM(quantity)
= physical units sold

SUM(net_sales)
= merchandise sales after discounts

SUM(total_paid)
= customer spending including shipping
```

## If the page does not load

- Do not double-click `index.html` directly.
- Run `python serve.py`.
- Open `http://localhost:8080`.
- Make sure you are online on the first launch so PGlite can download.
- If an older page appears, press **Ctrl + Shift + R**.
- Chrome, Edge, and Firefox are recommended.

## Cloud Saving with Supabase (Email & Password)

NexaSQL supports saving your progress online across multiple devices and browsers via Supabase.

### 1. Create the `user_progress` table in Supabase
Go to your **Supabase Dashboard** -> **SQL Editor**, paste the following script, and click **Run**:

```sql
-- 1. Create table for user progress
CREATE TABLE IF NOT EXISTS public.user_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- 3. Policy: users can read/write only their own row
CREATE POLICY "Users can manage own progress"
  ON public.user_progress
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 2. Connect in NexaSQL
1. Click the **Connect Cloud** button in the top header or sidebar.
2. Enter your **Supabase Project URL** (e.g., `https://xyz.supabase.co`) and **Supabase Anon Key** (from Project Settings -> API).
3. Switch between **Sign In** or **Sign Up** using your email and password.
4. Your XP, study streak, pattern scores, and unlocked ladder stages will automatically sync to your Supabase cloud account!

---

## Deploy to Vercel

You can deploy NexaSQL to Vercel in 1 click:

1. Push your repo to GitHub:
   ```bash
   git remote add origin https://github.com/aljus10/nexasql-midterm-focus.git
   git add .
   git commit -m "feat: interactive SQL puzzle with Supabase cloud save"
   git push -u origin main
   ```
2. Log in to [Vercel](https://vercel.com).
3. Click **Add New...** -> **Project**.
4. Import your `nexasql-midterm-focus` repository.
5. Keep default settings (`cleanUrls: true` is already configured in `vercel.json`).
6. Click **Deploy**.

---

## Files

- `index.html` — app shell and UI layout
- `styles.css` — UI styling, drag-and-drop slots, badges, cloud auth modals
- `app.js` — SQL game engine, PGlite local database, Supabase cloud sync & auth
- `vercel.json` — Vercel routing configuration
- `serve.py` — lightweight local development server

