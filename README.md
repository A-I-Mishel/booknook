# BookNook

BookNook is an Express (Node.js) application with EJS pages, backed by Firebase Firestore for data storage and `firebase-admin` for server-side access. Sessions use `cookie-session` (stateless, signed cookie) so the app runs on serverless platforms like Vercel.

## Setup

1. Install Node.js 18 or newer.
2. Place your Firebase Admin SDK key at `serviceAccountKey.json` (already present, git-ignored).
3. Copy `.env.example` to `.env` and set a strong `SESSION_SECRET`.
4. Install dependencies:

```powershell
npm install
```

5. (Optional) Seed the database:

```powershell
node seed.js
```

6. Start the app:

```powershell
npm start
```

Open `http://localhost:3000`.

## Routes

**Pages**
- Storefront: `/`, `/book/:id`, `/cart`, `/payment`
- Account: `/login`, `/register`, `/profile`, `/wishlist`, `/orders`, `/orders/:id`
- Admin: `/admin` (dashboard), `/admin/books`, `/admin/books/new`, `/admin/books/:id/edit`, `/admin/orders`

**API**
- Books: `GET /api/books`, `GET /api/books/search?q=...`, `GET /api/books/:id/reviews`, `POST /api/books/:id/reviews` (auth), `POST /api/books` (admin), `PUT /api/books/:id` (admin), `DELETE /api/books/:id` (admin)
- Cart: `GET /api/cart`, `POST /api/cart/add`, `POST /api/cart/update`, `POST /api/cart/remove`
- Wishlist: `GET /api/wishlist`, `POST /api/wishlist/add`, `POST /api/wishlist/remove`
- Addresses: `POST /api/addresses`, `POST /api/addresses/delete`
- Orders: `POST /api/orders` (mock payment, decrements stock), `POST /api/admin/orders/:id/status` (admin)
- Auth: `GET /api/auth/logout`

## Data model (Firestore)

- `users` — full_name, email, password (bcrypt), role, addresses[], wishlist[], created_at
- `books` — title, author, price, genre, description, isbn, publisher, publishYear, stock, cover_image, featured, bestseller, rating, ratingCount
- `genres` — genre_name
- `carts/user_{id}` — items[] (snapshot of bookId, title, author, price, cover_image, quantity)
- `orders` — userId, items[], totals, status (pending→processing→shipped→delivered/cancelled), payment (mock), shippingAddress, phone, timestamps
- `reviews` — bookId, userId, userName, rating, comment, createdAt

## Seeding

`node seed.js` populates genres, sample books (with stock), sample reviews, and an admin user:

- **Admin login:** `admin@booknook.com` / `admin123`

> Payments are mocked (no real charge). Replace `POST /api/orders` with a payment provider (e.g. Stripe) before going live; never collect raw card data.

## Deploy to Vercel

This is an Express app deployed as a Vercel serverless function (see `vercel.json`). No `app.listen` is called when imported by Vercel.

1. Push this folder to a GitHub repo (or use the Vercel CLI from the project directory).
2. Import the repo in Vercel (or run `vercel` in the folder).
3. In Vercel → Project → Settings → Environment Variables, add:
   - `SESSION_SECRET` — a long random string
   - `NODE_ENV` — `production`
   - `FIREBASE_SERVICE_ACCOUNT` — the **entire contents of `serviceAccountKey.json` as a single-line JSON string** (the local file is git-ignored and not deployed, so this is required). Minify the JSON (no newlines) before pasting.
4. Deploy. The site is served from the function; `express.static` still serves `/assets`.

Notes:
- Sessions use `cookie-session` (stateless, signed cookie) so login survives across serverless instances.
- `serviceAccountKey.json` stays local only — never commit it. If it was ever shared, rotate it in the Firebase console.
