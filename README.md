# OM – Open Market (B2B Wholesale Marketplace)

OM – Open Market is a production-oriented B2B wholesale marketplace built with **React, TypeScript, Tailwind CSS, Express, and Supabase (PostgreSQL, Authentication, Row Level Security, and Storage)**.

All users—Administrators, Wholesalers, and Retailers—connect to **one centralized Supabase PostgreSQL database**. There is **zero demo data** and **zero local fake database fallback**.

---

## Understanding the Database Structure (In Simple Language)

Your Supabase database contains **20 connected tables** created by the migration files in `supabase/migrations/`:

1. **`profiles`**: Stores every user's account details (name, email, mobile, role: `ADMIN` / `WHOLESALER` / `RETAILER`, account status).
2. **`businesses`**: Stores wholesaler business profiles and retailer shop details, including GSTIN, address, city, state, PIN code, logo, and approval status (`pending`, `approved`, `rejected`, `suspended`).
3. **`categories`** & 4. **`subcategories`**: Marketplace product categories managed dynamically by the Admin.
5. **`products`**: Wholesale product listings linked to the wholesaler (`wholesaler_id`) and business (`business_id`).
6. **`product_images`**: Multiple photograph URLs stored in Supabase Storage for each product.
7. **`inventory`**: Tracks `available_stock` and `reserved_stock` for every product.
8. **`pricing_tiers`**: Quantity-based bulk pricing (e.g., 1–10 pcs ₹100, 11–50 pcs ₹90).
9. **`subscription_plans`**: Monthly wholesaler plans (`STARTER` ₹299, `GROWTH` ₹599, `PREMIUM` ₹999) and listing limits.
10. **`subscriptions`**: Tracks each wholesaler's active, pending, expired, or suspended plan and grace period.
11. **`orders`** & 12. **`order_items`**: Separate supplier order records created per wholesaler at checkout, preserving exact locked prices at the time of ordering.
13. **`carts`** & 14. **`cart_items`**: Retailer shopping carts supporting items from multiple wholesalers simultaneously.
15. **`enquiries`**: Direct questions sent by retailers to wholesalers and supplier replies.
16. **`reviews`**: Product ratings submitted by retailers who have received a `delivered` order.
17. **`payments`**: Records for both direct order payments (COD / UPI / Bank Transfer) and wholesaler subscription payment verification.
18. **`notifications`**: In-app alerts for new orders, status updates, enquiries, approvals, and subscriptions.
19. **`product_reports`**: User-submitted reports on prohibited or misleading listings for Admin moderation.
20. **`stock_movements`**: Complete audit log of every stock addition, reduction, order reservation, and order cancellation restore.

---

## Step-by-Step Setup Guide for Beginners

### 1. How to Run the Application Locally
1. Install **Node.js 20+** on your computer.
2. Open a terminal in the project folder and run:
   ```bash
   npm install
   ```
3. Configure your `.env` file (see Step 6 below).
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:3000` in your browser.

---

### 2. How to Create a Supabase Account
1. Go to [https://supabase.com](https://supabase.com).
2. Click **Start your project** and sign in with GitHub or email.

### 3. How to Create a Supabase Project
1. Click **New Project** inside your Supabase organization.
2. Enter a project name (for example: `om-open-market`).
3. Create a strong **Database Password** (save it safely; you will need it for database backups).
4. Choose the region closest to your customers (for India, select **Mumbai `ap-south-1`**).
5. Click **Create new project** and wait ~1–2 minutes for provisioning to finish.

### 4. Where to Find the Project URL
1. In your Supabase project sidebar, click **Project Settings** (gear icon at bottom-left).
2. Click **API** (or **Data API**).
3. Copy the **Project URL** (it looks like `https://abcdefghijklm.supabase.co`).

### 5. Where to Find the Publishable (Anon) Key
1. On the same **Project Settings → API** page:
   - Copy the **`anon` / `publishable` key** (safe for browser use).
   - Also note the **`service_role` key** (keep this strictly secret—ONLY put it in server environment variables, NEVER in `VITE_*` frontend variables or GitHub!).

### 6. How to Configure Environment Variables
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in your keys in `.env`:
   ```env
   VITE_SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
   VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_PUBLISHABLE_KEY"

   # Server-side ONLY (never prefix with VITE_):
   SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="YOUR_SECRET_SERVICE_ROLE_KEY"

   APP_URL="http://localhost:3000"
   PORT=3000
   ```

### 7. How to Run SQL Migrations
1. Open your Supabase Dashboard → **SQL Editor** → **New query**.
2. Open and run each file from `supabase/migrations/` **one by one in exact order**:
   1. `supabase/migrations/001_initial_schema.sql` — Creates all 20 tables & indexes.
   2. `supabase/migrations/002_rls_policies.sql` — Enables Row Level Security on every table.
   3. `supabase/migrations/003_storage_buckets.sql` — Creates `product-images`, `business-logos`, and `profile-pictures` storage buckets & permissions.
   4. `supabase/migrations/004_functions_and_seed_config.sql` — Installs atomic checkout, stock adjustment, notification triggers, initial 11 categories, and initial 3 subscription plans.

### 8. How to Configure Storage
Running `003_storage_buckets.sql` automatically creates the 3 storage buckets (`product-images`, `business-logos`, `profile-pictures`) with:
- Maximum file size: **5 MB**
- Allowed formats: **JPG, PNG, WEBP**
- Strict folder ownership (`{user_id}/...`) so wholesalers can only upload or delete images for their own products.
You can verify them under **Supabase Dashboard → Storage**.

### 9. How to Configure Row Level Security (RLS) Policies
Running `002_rls_policies.sql` enables RLS on all 20 tables. Key protections enforced at the database level:
- Users cannot change their own `role` or `account_status`.
- Wholesalers can only edit/delete their own products and view orders belonging to them.
- Retailers can only view published products from approved wholesalers with active subscriptions.
- Retailers can only view/modify their own carts and orders.
- Only `ADMIN` accounts can approve wholesalers, manage categories/plans, or verify subscriptions.

### 10. How to Securely Create the First Administrator
Public admin registration is disabled. To create your first Admin account:
1. Open **Supabase Dashboard → Authentication → Users → Add user → Create new user**.
2. Enter your Admin email and a strong password, and check **Auto Confirm User**.
3. Open **SQL Editor** and run `supabase/admin_provisioning.sql` after replacing `admin@yourdomain.com` with your email.
4. Log in at `/admin/login`.

---

### 11. How to Test Separate User Accounts (End-to-End Verification Checklist)
Register separate real accounts (using different emails) and verify all 15 scenarios:
1. Register **Wholesaler A** via `/register` (select Wholesaler).
2. Register **Wholesaler B** via `/register` (select Wholesaler).
3. Log in at `/admin/login` → go to **User & Seller Approvals** → **Approve** Wholesaler A and Wholesaler B.
4. Log in as Wholesaler A → **Subscription Plan** → submit a plan request, then verify/activate it from Admin → **Subscriptions & Plans**. Repeat for Wholesaler B.
5. Wholesaler A creates and publishes Product 1 (with images, MOQ, stock, and bulk pricing tiers).
6. Wholesaler B creates and publishes Product 2.
7. Register/Log in as **Retailer A** on a separate device or incognito window.
8. Verify that products from **both Wholesaler A and Wholesaler B** appear together in the common marketplace (`/`).
9. Verify Wholesaler A cannot edit Wholesaler B's product (RLS blocks unauthorized `UPDATE`/`DELETE`).
10. Verify Retailer A cannot edit wholesaler products.
11. Add products from Wholesaler A and Wholesaler B into Retailer A's cart (`/cart`).
12. Place the order at `/cart` and verify **two separate supplier orders** are created (`OM-...`), stock decreases, and `stock_movements` records are written.
13. Test MOQ & stock validation by entering a quantity below MOQ or above available stock.
14. Test subscription product limit & expiry enforcement (publishing fails once active count reaches plan limit or subscription expires).
15. Verify `/admin` redirects or rejects non-admin accounts.

---

### 12. How to Connect GitHub
1. Create a private repository on GitHub.
2. Verify `.env` is listed in `.gitignore` (it is already ignored—never push `.env`!).
3. Run:
   ```bash
   git init
   git add .
   git commit -m "Initial OM Open Market setup"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

---

### 13. How to Deploy Using Hostinger
OM supports both **Hostinger Node.js Web App Hosting** (recommended) and **Hostinger Shared Web Hosting (Static)**:

#### Option A: Hostinger Node.js Web App Hosting (Full-Stack with `server.ts`)
1. In Hostinger **hPanel → Websites → Add Website → Node.js Web App** (or connect GitHub repo).
2. Set Node.js version to **20 or 22**.
3. Configure Environment Variables in hPanel:
   - `NODE_ENV=production`
   - `PORT=3000` (or the port assigned by Hostinger)
   - `VITE_SUPABASE_URL=...`
   - `VITE_SUPABASE_ANON_KEY=...`
   - `SUPABASE_URL=...`
   - `SUPABASE_SERVICE_ROLE_KEY=...`
4. Build command:
   ```bash
   npm install && npm run build
   ```
5. Start command:
   ```bash
   npm start
   ```

#### Option B: Hostinger Shared Hosting (Static `dist/` Upload)
Because all critical atomic operations (multi-supplier checkout, stock updates, order status transitions) also run directly via Supabase PostgreSQL RPCs with RLS:
1. Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` locally (do NOT put `SUPABASE_SERVICE_ROLE_KEY` anywhere in frontend).
2. Run `npm run build`.
3. Upload the contents of the generated `dist/` folder into `public_html/` via Hostinger File Manager.
4. Create a `.htaccess` file inside `public_html/` so React Router URLs work on page refresh:
   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /index.html [L]
   </IfModule>
   ```

---

### 14. How to Configure a Custom Domain & HTTPS
1. In Hostinger hPanel → **Domains**, point your domain to your Hostinger hosting plan.
2. Enable **Free SSL (HTTPS)** in hPanel → **Security → SSL**.
3. In **Supabase Dashboard → Authentication → URL Configuration**:
   - Set **Site URL** to `https://yourdomain.com`
   - Add **Redirect URLs**: `https://yourdomain.com/**` and `https://yourdomain.com/reset-password`

---

### 15. Database Backup Strategy & Troubleshooting
- **Backups**: Enable daily automated backups in Supabase (Pro plan) or export periodic SQL backups using `pg_dump` with your Supabase connection string.
- **Troubleshooting**:
  - *"Supabase is not configured" screen*: Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in `.env` and restart the server (`npm run dev` / rebuild `npm run build`).
  - *"Row-level security policy violation"*: Ensure all 4 SQL migrations in `supabase/migrations/` were executed in order `001` → `004`.
  - *"Email not confirmed" on login*: Either click the verification link in your inbox, or for testing in Supabase Dashboard → Authentication → Providers → Email, adjust confirmation settings.
  - *"Your wholesaler business must be approved"*: Log in at `/admin/login` and approve the wholesaler under **User & Seller Approvals**, then verify/activate their subscription under **Subscriptions & Plans**.
