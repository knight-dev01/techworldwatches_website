# TECH WORLD WATCHES

A complete **offline** luxury watch store built with HTML, CSS and vanilla JavaScript.

- **Frontend:** HTML, CSS and vanilla JavaScript only (no React, no build step)
- **Database:** a real **SQLite** database running in the browser through **SQL.js 1.10.3** (SQLite compiled to WebAssembly)
- **Persistence:** the database file is saved into `localStorage` as base64 and can be exported as a real `.db` file
- **No backend, no Node.js, no npm, no MySQL server** — just open `index.html`

---

## 1. How to run it

1. Keep the folder structure intact (see below).
2. **Double-click `index.html`** (or right-click → Open with → your browser).
3. That's it. No server, no installation.

> Works in Chrome, Edge, Firefox, Opera and Brave. It also works completely **offline**: the SQL.js runtime and the WebAssembly binary are bundled in the `vendor/` folder, and all images are stored in `assets/`.

### File structure

```
techworldwatches_website/
├── index.html                 # single-page site (all sections)
├── style.css                  # design system + responsive layout
├── app.js                     # SQL.js database logic + UI logic
├── README.md                  # this file
├── assets/                    # local watch photos (work offline)
│   ├── hero.jpg
│   ├── watch-1.jpg … watch-6.jpg
│   ├── gallery-1.jpg … gallery-6.jpg
│   └── fonts/                 # Poppins woff2 (bundled for offline use)
└── vendor/                    # SQL.js 1.10.3, bundled for offline use
    ├── sql-wasm.js            # SQL.js JavaScript runtime
    ├── sql-wasm.wasm          # SQLite WebAssembly binary
    └── sql-wasm-base64.js     # the same .wasm inline (lets file:// work)
```

---

## 2. Where is the "real database"?

The site uses **SQL.js**, which is the SQLite C library compiled to WebAssembly. It creates an actual SQLite database in memory, and `app.js` writes a copy of the database file to `localStorage` after every change.

| What | Where |
|---|---|
| Table | `watches` |
| Saved DB key | `localStorage["watchDB_file"]` (base64 of the whole `.db` file) |
| Cart key | `localStorage["cart"]` |
| Contact messages | `localStorage["tw_contact_messages"]` |
| Orders | `localStorage["tw_orders"]` |
| Admin session (tab only) | `sessionStorage["tw_admin_session"]` |
| Exported file | `techworld_watches.db` |

### Schema

```sql
CREATE TABLE IF NOT EXISTS watches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  image TEXT NOT NULL,
  category TEXT DEFAULT 'luxury',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Seed data (inserted automatically on first load)

| # | Name | Price (₦) | Category |
|---|---|---|---|
| 1 | Rolex Submariner | 85,000 | luxury |
| 2 | Apple Watch Ultra 2 | 120,000 | smart |
| 3 | Casio G-Shock GA-2100 | 45,000 | sport |
| 4 | Patek Philippe Nautilus | 250,000 | luxury |
| 5 | Omega Seamaster | 95,000 | luxury |
| 6 | Audemars Piguet Royal Oak | 180,000 | luxury |

---

## 3. Admin panel & database

> The database console is **hidden from normal visitors**. It lives inside a staff dashboard:
> click **Admin** and sign in with **`admin` / `admin123`**.

### A. Products come from SQL, not from a hardcoded array

1. Open the site and scroll to **Our Product**.
2. Each card is rendered from the query `SELECT * FROM watches` (see `displayWatches()` in `app.js`).
3. Open the **Admin** panel (credentials above) to reach the **Local Database Console (SQL.js)**.

### B. Database changes persist

1. In the admin console, type a name, a price and an image path (e.g. `assets/watch-1.jpg`).
2. Click **INSERT INTO DB** → a new card appears and the live line shows the last query and row count.
3. **Refresh the page (F5)** → sign in again and the new watch is still there, because the database file was saved to `localStorage`.

### C. Local Storage key

1. Press **F12** (or right-click → Inspect).
2. Go to **Application** → **Storage** → **Local Storage** → `file://` (your page).
3. You will see **`watchDB_file`** containing a long base64 string — that is the SQLite file itself.

### D. Exported `.db` file

1. Click **Export .db File** in the admin console.
2. Open `techworld_watches.db` with **DB Browser for SQLite** (https://sqlitebrowser.org/).
3. Browse the `watches` table — same rows, same schema.

### E. SQL log

- Click **Show SQL Log** in the console to see every query the page executed, with row counts and execution time (ms).
- **Reset DB** drops the table and re-creates it with the 6 seed watches.

### F. Checkout flow

1. Add a watch to the cart, open **Cart**, then click **Checkout**.
2. The dialog is prefilled with saved customer details (**Ifet Great**, card ending **4242**, free Lagos delivery).
3. Click **Place Order** — after a short payment delay you get an order number
   (`TWW-0001`, `TWW-0002`, …), a total and a confirmation screen.
4. The order is saved to `localStorage["tw_orders"]`; the cart is emptied.

### G. Lock the admin panel again

Click **Lock panel** in the admin dashboard (or close the tab). The console is hidden until the next sign-in.

---

## 4. Feature checklist

- [x] Nav bar: Home / Our Product / Gallery / Blog / Contact Us / Cart (0) + Admin entry
- [x] Hero with floating watch animation (`@keyframes float`) and gold glow
- [x] Product grid: 3 columns desktop, 1 column mobile, populated from SQL
- [x] Category badges, ₦ prices, Add to Cart, View (product modal)
- [x] **Hidden admin panel** with a staff login (`admin` / `admin123`) around the DB console
- [x] Database console: insert, SQL log, last query + row count, export `.db`, reset
- [x] Row preview table of the `watches` table with per-row delete
- [x] **Checkout**: prefilled customer, card ending 4242, order number, saved to `tw_orders`
- [x] Gallery: 6 image masonry layout
- [x] Blog: 3 articles
- [x] Contact form (validated, saved to `localStorage`), Lagos address
- [x] Cart drawer with quantity controls and total, persisted in `localStorage`
- [x] Fully responsive, mobile-first, smooth scrolling
- [x] Gold / black / white luxury theme, `border-radius: 12px`, soft shadows
- [x] Works offline, opens by double-clicking `index.html`, no console errors

---

## 5. How it works (short version)

```js
// 1. Start SQL.js
const SQL = await initSqlJs({ wasmBinary });        // no network fetch needed

// 2. Restore the saved database, or create a new one
const saved = localStorage.getItem("watchDB_file");
const db = saved ? new SQL.Database(base64ToBytes(saved)) : new SQL.Database();

// 3. Create the table if it does not exist, then seed once
db.run("CREATE TABLE IF NOT EXISTS watches ( ... )");

// 4. Read products with SQL
const result = db.exec("SELECT * FROM watches");

// 5. Insert with a prepared statement
db.run("INSERT INTO watches (name, price, image) VALUES (?, ?, ?)", [name, price, image]);

// 6. Persist the whole .db file as base64
localStorage.setItem("watchDB_file", bytesToBase64(db.export()));

// 7. Export a real SQLite file
const blob = new Blob([db.export()], { type: "application/x-sqlite3" });
```

SQL.js is loaded from the required CDN first
(`https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js`); if there is no
internet connection, the bundled copy in `vendor/sql-wasm.js` is used instead.

---

## 6. Notes

- **Clearing site data / localStorage wipes the database** (browsers treat it as temporary storage). Export the `.db` first if you need a backup.
- `localStorage` is per-browser and per-origin. Opening the file from a different path or browser gives you a fresh database.
- The **admin login is a client-side gate** (`admin` / `admin123`). It is not real authentication and must never be used to protect real data.
- The **Checkout** flow confirms orders and stores them in `localStorage`; no payment is processed and no data leaves the browser.
- All images are stored locally in `assets/`, so the gallery works without internet.
