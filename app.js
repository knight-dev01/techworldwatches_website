/* =========================================================
   TECH WORLD WATCH — app.js
   ---------------------------------------------------------
   Frontend : HTML / CSS / Vanilla JavaScript (no React)
   Database : SQLite via SQL.js 1.10.3 (WebAssembly)
   Storage  : localStorage key "watchDB_file" (base64 of the .db)
   ---------------------------------------------------------
   No backend, no Node.js, no npm. Open index.html directly.
   ========================================================= */
"use strict";

/* ----------------------------- Constants ----------------------------- */
const SQLJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js";
const SQLJS_LOCAL = "vendor/sql-wasm.js";
const WASM_CDN = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm";

const DB_STORAGE_KEY = "watchDB_file";   // localStorage: base64 encoded SQLite file
const CART_KEY = "cart";                 // localStorage: cart items
const MESSAGES_KEY = "tw_contact_messages";
const ORDERS_KEY = "tw_orders";          // localStorage: simulated checkout orders
const ADMIN_SESSION_KEY = "tw_admin_session";

/* Simulated staff account for the demo admin gate. */
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin123";

const PLACEHOLDER_IMG =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
      '<rect width="800" height="600" fill="#efe9db"/>' +
      '<circle cx="400" cy="290" r="120" fill="none" stroke="#c9b98d" stroke-width="10"/>' +
      '<path d="M400 200v95l65 40" fill="none" stroke="#c9b98d" stroke-width="10" stroke-linecap="round"/>' +
      '<text x="400" y="490" font-family="Arial" font-size="26" fill="#a89568" text-anchor="middle">TECH WORLD WATCH</text>' +
    "</svg>"
  );

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS watches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  image TEXT NOT NULL,
  category TEXT DEFAULT 'luxury',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`;

/* The 6 seeded watches — inserted once, only into an empty table. */
const SEED_WATCHES = [
  { name: "Rolex Submariner", price: 85000, image: "assets/watch-1.jpg", category: "luxury" },
  { name: "Apple Watch Ultra 2", price: 120000, image: "assets/watch-2.jpg", category: "smart" },
  { name: "Casio G-Shock GA-2100", price: 45000, image: "assets/watch-3.jpg", category: "sport" },
  { name: "Patek Philippe Nautilus", price: 250000, image: "assets/watch-4.jpg", category: "luxury" },
  { name: "Omega Seamaster", price: 95000, image: "assets/watch-5.jpg", category: "luxury" },
  { name: "Audemars Piguet Royal Oak", price: 180000, image: "assets/watch-6.jpg", category: "luxury" }
];

/* ----------------------------- App state ----------------------------- */
const state = {
  SQL: null,
  db: null,
  watches: [],
  filter: "all",
  cart: [],
  lastQuery: "SELECT * FROM watches",
  lastRows: 0,
  log: [],
  ready: false,
  lastFocused: null
};

/* ----------------------------- DOM helpers ----------------------------- */
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const naira = (value) => "\u20A6" + Number(value).toLocaleString("en-NG");

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toast(message, type) {
  const stack = $("#toastStack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " is-error" : "");
  el.innerHTML = '<span aria-hidden="true">' + (type === "error" ? "\u26A0\uFE0F" : "\u2714\uFE0F") + "</span><span>" + escapeHtml(message) + "</span>";
  stack.appendChild(el);
  window.setTimeout(() => {
    el.classList.add("is-leaving");
    window.setTimeout(() => el.remove(), 240);
  }, 3200);
}

/* ----------------------------- Base64 <-> bytes ----------------------------- */
function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000; // avoid "Maximum call stack size exceeded"
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ----------------------------- SQL.js loading ----------------------------- */
function loadScript(src, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const existing = $$("script").some((s) => s.src === src);
    if (existing) return resolve();
    const script = document.createElement("script");
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Timed out loading " + src));
    }, timeoutMs);

    script.src = src;
    script.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new Error("Failed to load " + src));
    };
    document.head.appendChild(script);
  });
}

/**
 * Loads the SQL.js runtime.
 * 1. Tries the mandatory CDN.
 * 2. Falls back to the bundled copy in /vendor (works fully offline).
 * 3. Feeds the WebAssembly binary inline, so no extra fetch is needed
 *    and the page works from a file:// URL.
 */
async function bootSqlJs() {
  if (typeof window.initSqlJs !== "function") {
    try {
      await loadScript(SQLJS_CDN);
      console.info("[SQL.js] Loaded from CDN.");
    } catch (cdnError) {
      console.warn("[SQL.js] CDN unavailable, using bundled copy.", cdnError.message);
      await loadScript(SQLJS_LOCAL);
    }
  }

  if (typeof window.initSqlJs !== "function") {
    throw new Error("SQL.js runtime is not available.");
  }

  if (window.SQL_WASM_BASE64) {
    try {
      const wasmBinary = base64ToBytes(window.SQL_WASM_BASE64);
      return await window.initSqlJs({ wasmBinary });
    } catch (wasmError) {
      console.warn("[SQL.js] Inline WASM failed, falling back to network WASM.", wasmError);
    }
  }

  return window.initSqlJs({ locateFile: (file) => WASM_CDN.replace("sql-wasm.wasm", file) });
}

/* ----------------------------- Database core ----------------------------- */
function logQuery(sql, rows, ms) {
  state.lastQuery = sql;
  state.lastRows = rows;
  state.log.unshift({ sql, rows, ms: ms == null ? null : Number(ms.toFixed(2)) });
  state.log = state.log.slice(0, 30);
  renderSqlLine();
  renderSqlLog();
}

function rowsFromResult(result) {
  if (!result || !result.length) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

/** Reads a SELECT and records it in the SQL log. */
function select(sql, params) {
  const started = performance.now();
  const result = state.db.exec(sql, params);
  const rows = rowsFromResult(result);
  logQuery(sql, rows.length, performance.now() - started);
  return rows;
}

function createTableIfNeeded() {
  const started = performance.now();
  state.db.run(CREATE_TABLE_SQL);
  logQuery("CREATE TABLE IF NOT EXISTS watches ( ... )", 0, performance.now() - started);
}

function seedIfEmpty() {
  const count = select("SELECT COUNT(*) AS total FROM watches")[0].total;
  if (count > 0) return;

  const started = performance.now();
  state.db.run("BEGIN");
  const stmt = state.db.prepare("INSERT INTO watches (name, price, image, category) VALUES (?, ?, ?, ?)");
  try {
    SEED_WATCHES.forEach((w) => stmt.run([w.name, w.price, w.image, w.category]));
  } finally {
    stmt.free();
  }
  state.db.run("COMMIT");
  logQuery("INSERT INTO watches — " + SEED_WATCHES.length + " seed rows", SEED_WATCHES.length, performance.now() - started);
  console.info("[DB] Seeded", SEED_WATCHES.length, "watches.");
}

/**
 * initDB()
 * - loads sql.js
 * - loads the saved .db from localStorage (key "watchDB_file") if present
 * - otherwise creates a brand new database, table and seed rows
 */
async function initDB() {
  const SQL = await bootSqlJs();
  state.SQL = SQL;

  const saved = localStorage.getItem(DB_STORAGE_KEY);
  if (saved) {
    try {
      state.db = new SQL.Database(base64ToBytes(saved));
      console.info("[DB] Existing database restored from localStorage.");
    } catch (err) {
      console.error("[DB] Saved file is corrupt — creating a new database.", err);
      state.db = new SQL.Database();
    }
  } else {
    state.db = new SQL.Database();
    console.info("[DB] No saved database found — created a new SQLite database.");
  }

  createTableIfNeeded();
  seedIfEmpty();
  saveDB();

  state.ready = true;
  displayWatches();
  renderDbTable();
  updateDbStatus();
}

/** Persists db.export() to localStorage as base64. */
function saveDB() {
  if (!state.db) return;
  try {
    const bytes = state.db.export();
    localStorage.setItem(DB_STORAGE_KEY, bytesToBase64(bytes));
    return true;
  } catch (err) {
    console.error("[DB] Could not save to localStorage.", err);
    toast("Could not save database (browser storage may be full).", "error");
    return false;
  }
}

/* ----------------------------- Rendering: products ----------------------------- */
function displayWatches() {
  if (!state.ready) return;
  // This is the exact query the project brief asks for:
  // products are rendered from SQL, never from a hardcoded array.
  const rows = select("SELECT * FROM watches");
  state.watches = rows;
  renderProducts();
  updateResultCount();
}

function currentWatches() {
  return state.filter === "all"
    ? state.watches
    : state.watches.filter((w) => String(w.category).toLowerCase() === state.filter);
}

function updateResultCount() {
  const total = state.watches.length;
  const shown = currentWatches().length;
  const el = $("#resultCount");
  if (el) {
    el.textContent = state.filter === "all"
      ? total + " watch" + (total === 1 ? "" : "es") + " in the database"
      : shown + " of " + total + " watches \u00B7 " + state.filter;
  }
  const stat = $("#statCount");
  if (stat) stat.textContent = total;
}

function renderProducts() {
  const grid = $("#productGrid");
  const empty = $("#gridEmpty");
  if (!grid) return;

  grid.setAttribute("aria-busy", "false");

  if (!state.ready) {
    grid.innerHTML =
      '<p class="grid-empty" style="grid-column:1/-1">Loading the local database\u2026</p>';
    if (empty) empty.hidden = true;
    return;
  }

  const watches = currentWatches();
  if (!watches.length) {
    grid.innerHTML = "";
    if (empty) {
      empty.hidden = false;
      empty.textContent =
        state.filter === "all"
          ? "The database is empty. Add a watch from the Admin panel."
          : "No watches in the \u201C" + state.filter + "\u201D category yet. Try another filter or add one from the Admin panel.";
    }
    return;
  }
  if (empty) empty.hidden = true;

  grid.innerHTML = watches
    .map((w, index) => {
      const img = escapeHtml(w.image || PLACEHOLDER_IMG);
      const name = escapeHtml(w.name);
      const cat = escapeHtml(w.category || "luxury");
      return (
        '<article class="product-card" style="animation-delay:' + Math.min(index * 55, 330) + 'ms">' +
          '<div class="card-thumb">' +
            '<img src="' + img + '" alt="' + name + '" loading="lazy" data-fallback="1">' +
            '<span class="badge">' + cat + "</span>" +
          "</div>" +
          '<div class="card-body">' +
            "<h3>" + name + "</h3>" +
            '<p class="card-price">' + naira(w.price) + "<small>Free Lagos delivery</small></p>" +
            '<div class="card-actions">' +
              '<button class="btn btn-dark" type="button" data-action="add" data-id="' + w.id + '">Add to Cart</button>' +
              '<button class="btn btn-outline" type="button" data-action="view" data-id="' + w.id + '">View</button>' +
            "</div>" +
          "</div>" +
        "</article>"
      );
    })
    .join("");

  $$("#productGrid img[data-fallback]").forEach((img) => {
    img.addEventListener("error", () => {
      img.removeAttribute("data-fallback");
      img.src = PLACEHOLDER_IMG;
    }, { once: true });
  });
}

/* ----------------------------- Rendering: DB console ----------------------------- */
function renderSqlLine() {
  const q = $("#lastQuery");
  const r = $("#lastRows");
  if (q) q.textContent = state.lastQuery;
  if (r) r.textContent = state.lastRows;
}

function renderSqlLog() {
  const list = $("#sqlLogList");
  if (!list) return;
  if (!state.log.length) {
    list.innerHTML = '<li class="sql-log-empty">No queries yet.</li>';
    return;
  }
  list.innerHTML = state.log
    .map((entry) => {
      const time = entry.ms == null ? "" : " <b>" + entry.ms + " ms</b>";
      return "<li><code>" + escapeHtml(entry.sql) + "</code> \u2014 " + entry.rows + " row(s)" + time + "</li>";
    })
    .join("");
}

function renderDbTable() {
  const tbody = $("#dbRows");
  if (!tbody) return;
  if (!state.ready) {
    tbody.innerHTML = '<tr><td colspan="7">Loading\u2026</td></tr>';
    return;
  }
  if (!state.watches.length) {
    tbody.innerHTML = '<tr><td colspan="7">No rows in <code>watches</code>.</td></tr>';
    return;
  }
  tbody.innerHTML = state.watches
    .map((w) =>
      "<tr>" +
        "<td>" + w.id + "</td>" +
        '<td class="td-name" title="' + escapeHtml(w.name) + '">' + escapeHtml(w.name) + "</td>" +
        '<td class="td-price">' + naira(w.price) + "</td>" +
        '<td class="td-image" title="' + escapeHtml(w.image) + '">' + escapeHtml(w.image) + "</td>" +
        "<td>" + escapeHtml(w.category || "luxury") + "</td>" +
        "<td>" + escapeHtml(w.created_at) + "</td>" +
        '<td><button class="row-delete" type="button" data-delete="' + w.id + '">Delete</button></td>' +
      "</tr>"
    )
    .join("");
}

function updateDbStatus(extraError) {
  const el = $("#dbStatus");
  if (!el) return;
  if (extraError) {
    el.classList.add("is-error");
    el.innerHTML = '<span class="dot" aria-hidden="true"></span> Database error';
    return;
  }
  el.classList.remove("is-error");
  el.innerHTML =
    '<span class="dot" aria-hidden="true"></span> SQL.js 1.10.3 ready \u00B7 ' +
    state.watches.length + " rows";
}

/* ----------------------------- Insert / delete / export / reset ----------------------------- */
function insertWatch(name, price, image) {
  if (!state.ready) {
    toast("Database is still starting up.", "error");
    return false;
  }

  const cleanName = String(name || "").trim();
  const cleanImage = String(image || "").trim();
  const cleanPrice = Math.round(Number(price));

  if (!cleanName) {
    toast("Please enter a watch name.", "error");
    return false;
  }
  if (!Number.isFinite(cleanPrice) || cleanPrice <= 0) {
    toast("Price must be a positive whole number.", "error");
    return false;
  }
  if (!cleanImage) {
    toast("Please enter an image URL or path.", "error");
    return false;
  }

  const started = performance.now();
  state.db.run("INSERT INTO watches (name, price, image) VALUES (?, ?, ?)", [cleanName, cleanPrice, cleanImage]);
  logQuery("INSERT INTO watches (name, price, image) VALUES (\u201C" + cleanName + "\u201D, " + cleanPrice + ", \u2026)", state.db.getRowsModified(), performance.now() - started);

  saveDB();
  displayWatches();
  renderDbTable();
  updateDbStatus();
  toast("Watch inserted into the SQLite database.");
  return true;
}

function deleteWatch(id) {
  if (!state.ready) return;
  const row = state.watches.find((w) => Number(w.id) === Number(id));
  const label = row ? "\u201C" + row.name + "\u201D" : "this watch";
  if (!window.confirm("Delete " + label + " from the database?")) return;

  const started = performance.now();
  state.db.run("DELETE FROM watches WHERE id = ?", [Number(id)]);
  logQuery("DELETE FROM watches WHERE id = " + Number(id), state.db.getRowsModified(), performance.now() - started);

  saveDB();
  displayWatches();
  renderDbTable();
  updateDbStatus();
  toast("Row deleted. The change is saved.");
}

function exportDB() {
  if (!state.db) return;
  const data = state.db.export(); // Uint8Array of a real SQLite file
  const blob = new Blob([data], { type: "application/x-sqlite3" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "techworld_watches.db";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast("Exported techworld_watches.db \u2014 open it in DB Browser for SQLite.");
}

function resetDB() {
  if (!state.ready) return;
  if (!window.confirm("Reset the database? All rows will be deleted and the 6 seed watches restored.")) return;

  const started = performance.now();
  state.db.run("DROP TABLE IF EXISTS watches");
  state.db.run(CREATE_TABLE_SQL);
  logQuery("DROP TABLE IF EXISTS watches; " + CREATE_TABLE_SQL.replace(/\s+/g, " "), 0, performance.now() - started);

  seedIfEmpty();
  saveDB();
  displayWatches();
  renderDbTable();
  updateDbStatus();
  toast("Database reset to the 6 seed watches.");
}

/* ----------------------------- Filtering ----------------------------- */
function setFilter(filter) {
  state.filter = filter;
  $$("#filterChips .chip").forEach((chip) => {
    const active = chip.dataset.filter === filter;
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-pressed", active ? "true" : "false");
  });
  renderProducts();
  updateResultCount();
}

/* ----------------------------- Cart ----------------------------- */
function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    state.cart = Array.isArray(raw) ? raw.filter((i) => i && i.id != null && i.qty > 0) : [];
  } catch (err) {
    console.warn("[Cart] Could not read cart, starting empty.", err);
    state.cart = [];
  }
  renderCart();
}

function persistCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  } catch (err) {
    console.warn("[Cart] Could not save cart.", err);
  }
  renderCart();
}

function cartCount() {
  return state.cart.reduce((sum, item) => sum + item.qty, 0);
}

function cartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function addToCart(id) {
  const watch = state.watches.find((w) => Number(w.id) === Number(id));
  if (!watch) {
    toast("That watch is no longer in the database.", "error");
    return;
  }

  const existing = state.cart.find((item) => Number(item.id) === Number(id));
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({
      id: Number(watch.id),
      name: watch.name,
      price: Number(watch.price),
      image: watch.image,
      qty: 1
    });
  }
  persistCart();

  const btn = $("#cartToggle");
  if (btn) {
    btn.classList.remove("is-bump");
    void btn.offsetWidth; // restart animation
    btn.classList.add("is-bump");
  }
  toast(watch.name + " added to cart.");
}

function changeQty(id, delta) {
  const item = state.cart.find((i) => Number(i.id) === Number(id));
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    state.cart = state.cart.filter((i) => Number(i.id) !== Number(id));
  }
  persistCart();
}

function removeFromCart(id) {
  state.cart = state.cart.filter((i) => Number(i.id) !== Number(id));
  persistCart();
}

function clearCart() {
  if (!state.cart.length) return;
  state.cart = [];
  persistCart();
  toast("Cart cleared.");
}

function renderCart() {
  const badge = $("#cartCount");
  if (badge) badge.textContent = cartCount();

  const totalEl = $("#cartTotal");
  if (totalEl) totalEl.textContent = naira(cartTotal());

  const list = $("#cartItems");
  if (!list) return;

  if (!state.cart.length) {
    list.innerHTML =
      '<div class="cart-empty">' +
        '<svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
          '<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 8H6" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<circle cx="10" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/>' +
        "</svg>" +
        "<p>Your cart is empty.<br />Pick a timepiece from the collection.</p>" +
      "</div>";
    return;
  }

  list.innerHTML = state.cart
    .map((item) => {
      return (
        '<div class="cart-item">' +
          '<img src="' + escapeHtml(item.image || PLACEHOLDER_IMG) + '" alt="' + escapeHtml(item.name) + '">' +
          "<div>" +
            "<h4>" + escapeHtml(item.name) + "</h4>" +
            "<p>" + naira(item.price) + "</p>" +
            '<div class="qty-row">' +
              '<button class="qty-btn" type="button" data-cart="dec" data-id="' + item.id + '" aria-label="Decrease quantity">\u2212</button>' +
              '<span class="qty-value">' + item.qty + "</span>" +
              '<button class="qty-btn" type="button" data-cart="inc" data-id="' + item.id + '" aria-label="Increase quantity">+</button>' +
            "</div>" +
          "</div>" +
          '<button class="cart-remove" type="button" data-cart="remove" data-id="' + item.id + '">Remove</button>' +
        "</div>"
      );
    })
    .join("");
}

/* ----------------------------- Layer helpers ----------------------------- */
/* Every overlay is hidden with the [hidden] attribute; CSS guarantees it wins
   over display rules, so the cart stays closable. */
function anyLayerOpen() {
  return ["#cartDrawer", "#productModal", "#checkoutModal", "#adminLogin", "#guideModal"]
    .some((selector) => {
      const el = $(selector);
      return el && !el.hidden;
    });
}

function syncScrollLock() {
  document.body.style.overflow = anyLayerOpen() ? "hidden" : "";
}

function restoreFocus() {
  const el = state.lastFocused;
  state.lastFocused = null;
  if (el && typeof el.focus === "function" && el.offsetParent !== null) el.focus();
}

/* ----------------------------- Drawers / modals ----------------------------- */
function openCart() {
  state.lastFocused = document.activeElement;
  renderCart();
  $("#cartOverlay").hidden = false;
  $("#cartDrawer").hidden = false;
  syncScrollLock();
  const closeBtn = $("#cartClose");
  if (closeBtn) closeBtn.focus();
}

function closeCart() {
  $("#cartOverlay").hidden = true;
  $("#cartDrawer").hidden = true;
  syncScrollLock();
  if (!anyLayerOpen()) restoreFocus();
}

function openProduct(id) {
  const watch = state.watches.find((w) => Number(w.id) === Number(id));
  if (!watch) return;

  state.lastFocused = document.activeElement;
  $("#modalImage").src = watch.image || PLACEHOLDER_IMG;
  $("#modalImage").alt = watch.name;
  $("#modalCategory").textContent = watch.category || "luxury";
  $("#modalTitle").textContent = watch.name;
  $("#modalPrice").textContent = naira(watch.price);
  $("#modalMeta").innerHTML =
    "Added to the local database on <strong>" + escapeHtml(watch.created_at) + "</strong><br />" +
    "Row reference: <code>watches.id = " + watch.id + "</code>";
  $("#modalAdd").dataset.id = watch.id;

  $("#productOverlay").hidden = false;
  $("#productModal").hidden = false;
  syncScrollLock();
  $("#modalClose").focus();
}

function closeProduct() {
  $("#productOverlay").hidden = true;
  $("#productModal").hidden = true;
  syncScrollLock();
  if (!anyLayerOpen()) restoreFocus();
}

/* ----------------------------- Contact form (localStorage) ----------------------------- */
function saveMessage(name, email, message) {
  let messages = [];
  try {
    messages = JSON.parse(localStorage.getItem(MESSAGES_KEY) || "[]");
    if (!Array.isArray(messages)) messages = [];
  } catch (err) {
    messages = [];
  }
  messages.push({ name, email, message, sentAt: new Date().toISOString() });
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
}

function handleContactSubmit(event) {
  event.preventDefault();
  const name = $("#contactName").value.trim();
  const email = $("#contactEmail").value.trim();
  const message = $("#contactMessage").value.trim();
  const note = $("#contactNote");
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

  if (!name || !email || !message) {
    note.textContent = "Please fill in your name, email and message.";
    note.classList.add("is-error");
    return;
  }
  if (!emailOk) {
    note.textContent = "That email address does not look right.";
    note.classList.add("is-error");
    return;
  }

  try {
    saveMessage(name, email, message);
  } catch (err) {
    console.warn("[Contact] Could not save message locally.", err);
    note.textContent = "Could not save your message locally.";
    note.classList.add("is-error");
    return;
  }

  note.classList.remove("is-error");
  note.textContent = "Thanks " + name + "! Your message is saved locally. We will be in touch.";
  event.target.reset();
  toast("Message saved to localStorage.");
}

/* ----------------------------- Admin panel gate (demo only) ----------------------------- */
function adminUnlocked() {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
  } catch (err) {
    return false;
  }
}

function openAdminPanel(scrollToPanel) {
  if (!state.ready) {
    toast("The database is still starting up.", "error");
    return;
  }
  if (!adminUnlocked()) {
    openAdminLogin();
    return;
  }

  const panel = $("#admin");
  panel.hidden = false;
  const navLink = $("#adminNavLink");
  if (navLink) navLink.classList.add("is-unlocked");

  if (scrollToPanel) {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    panel.classList.remove("is-flash");
    void panel.offsetWidth;
    panel.classList.add("is-flash");
    window.setTimeout(() => panel.classList.remove("is-flash"), 1500);
  }
}

function openAdminLogin() {
  state.lastFocused = document.activeElement;
  $("#adminNote").textContent = "";
  $("#adminNote").classList.remove("is-error");
  $("#adminUser").value = ADMIN_USER;
  $("#adminPass").value = "";
  $("#adminOverlay").hidden = false;
  $("#adminLogin").hidden = false;
  syncScrollLock();
  $("#adminPass").focus();
}

function closeAdminLogin() {
  $("#adminOverlay").hidden = true;
  $("#adminLogin").hidden = true;
  syncScrollLock();
  if (!anyLayerOpen()) restoreFocus();
}

function handleAdminLogin(event) {
  event.preventDefault();
  const user = $("#adminUser").value.trim();
  const pass = $("#adminPass").value;
  const note = $("#adminNote");

  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    note.textContent = "Incorrect demo credentials. Use admin / admin123.";
    note.classList.add("is-error");
    const modal = $("#adminLogin");
    modal.classList.remove("is-shake");
    void modal.offsetWidth;
    modal.classList.add("is-shake");
    return;
  }

  try {
    sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
  } catch (err) {
    console.warn("[Admin] Could not persist the demo session.", err);
  }

  note.textContent = "";
  note.classList.remove("is-error");
  closeAdminLogin();
  openAdminPanel(true);
  toast("Admin panel unlocked \u2014 database console is now visible.");
}

function lockAdminPanel() {
  $("#admin").hidden = true;
  const navLink = $("#adminNavLink");
  if (navLink) navLink.classList.remove("is-unlocked");
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch (err) {
    /* ignore */
  }
  toast("Admin panel locked. Visitors cannot see the database console.");
}

/* ----------------------------- Lecturer guide ----------------------------- */
function openGuide() {
  state.lastFocused = document.activeElement;
  $("#guideOverlay").hidden = false;
  $("#guideModal").hidden = false;
  syncScrollLock();
  $("#guideClose").focus();
}

function closeGuide() {
  $("#guideOverlay").hidden = true;
  $("#guideModal").hidden = true;
  syncScrollLock();
  if (!anyLayerOpen()) restoreFocus();
}

/* ----------------------------- Demo checkout ----------------------------- */
function readOrders() {
  try {
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function nextOrderNumber() {
  return "TWW-" + String(readOrders().length + 1).padStart(4, "0");
}

function saveOrder(order) {
  const orders = readOrders();
  orders.push(order);
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  } catch (err) {
    console.warn("[Checkout] Could not save the demo order.", err);
  }
}

function renderCheckoutSummary() {
  const list = $("#checkoutItems");
  if (!list) return;
  list.innerHTML = state.cart
    .map(
      (item) =>
        "<li><span><b>" + escapeHtml(item.name) + "</b> \u00D7 " + item.qty + "</span>" +
        "<em>" + naira(item.price * item.qty) + "</em></li>"
    )
    .join("");
  $("#checkoutSubtotal").textContent = naira(cartTotal());
  $("#checkoutTotal").textContent = naira(cartTotal());
}

function openCheckout() {
  if (!state.cart.length) {
    toast("Your cart is empty.", "error");
    return;
  }

  // Close the cart drawer, keep the scroll locked, open the checkout dialog.
  $("#cartOverlay").hidden = true;
  $("#cartDrawer").hidden = true;
  state.lastFocused = $("#cartToggle");

  const form = $("#checkoutForm");
  form.reset(); // restores the predetermined demo customer details
  $("#checkoutFormWrap").hidden = false;
  $("#checkoutSuccess").hidden = true;
  $("#checkoutNote").textContent = "";
  $("#checkoutNote").classList.remove("is-error");
  const btn = $("#placeOrderBtn");
  btn.disabled = false;
  btn.textContent = "Place Demo Order";

  renderCheckoutSummary();
  $("#checkoutOverlay").hidden = false;
  $("#checkoutModal").hidden = false;
  syncScrollLock();
  $("#coName").focus();
}

function closeCheckout() {
  $("#checkoutOverlay").hidden = true;
  $("#checkoutModal").hidden = true;
  syncScrollLock();
  if (!anyLayerOpen()) restoreFocus();
}

function showCheckoutSuccess(order) {
  $("#checkoutFormWrap").hidden = true;
  $("#checkoutSuccess").hidden = false;
  $("#successName").textContent = order.customer.name.split(" ")[0] || "friend";
  $("#successOrder").textContent = order.number;
  $("#successPayment").textContent = order.payment;
  $("#successTotal").textContent = naira(order.total);
  $("#successContinue").focus();
}

function handlePlaceOrder(event) {
  event.preventDefault();
  const note = $("#checkoutNote");
  const name = $("#coName").value.trim();
  const phone = $("#coPhone").value.trim();
  const email = $("#coEmail").value.trim();
  const address = $("#coAddress").value.trim();
  const paymentInput = document.querySelector('input[name="pay"]:checked');
  const payment = paymentInput ? paymentInput.value : "Card ending 4242";
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  const phoneOk = /^[0-9+()\-\s]{7,20}$/.test(phone);

  if (!state.cart.length) {
    note.textContent = "Your cart is empty.";
    note.classList.add("is-error");
    return;
  }
  if (!name || !phone || !email || !address) {
    note.textContent = "Please complete the delivery details.";
    note.classList.add("is-error");
    return;
  }
  if (!emailOk) {
    note.textContent = "That email address does not look right.";
    note.classList.add("is-error");
    return;
  }
  if (!phoneOk) {
    note.textContent = "Please enter a valid phone number.";
    note.classList.add("is-error");
    return;
  }

  const btn = $("#placeOrderBtn");
  btn.disabled = true;
  btn.textContent = "Processing demo payment\u2026";
  note.classList.remove("is-error");
  note.textContent = "Contacting the demo payment gateway\u2026";

  // Predetermined fake delay so the flow feels like a real checkout.
  window.setTimeout(() => {
    const order = {
      number: nextOrderNumber(),
      items: state.cart.map((item) => ({ ...item })),
      total: cartTotal(),
      customer: { name, phone, email, address },
      payment,
      placedAt: new Date().toISOString(),
      status: "demo-confirmed"
    };

    saveOrder(order);
    showCheckoutSuccess(order);

    // The demo order is complete, so empty the cart.
    state.cart = [];
    persistCart();
    toast("Demo order " + order.number + " confirmed. No payment was taken.");
  }, 1400);
}

function finishCheckout() {
  const number = $("#successOrder").textContent;
  closeCheckout();
  toast("Order " + number + " saved to localStorage[\"tw_orders\"].");
  const products = $("#products");
  if (products) products.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ----------------------------- Navigation ----------------------------- */
function setupNav() {
  const toggle = $("#navToggle");
  const nav = $("#primaryNav");

  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  $$(".nav-link", nav).forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });

  // Highlight the section currently in view.
  const links = $$(".nav-link", nav);
  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((link) => {
            link.classList.toggle("is-active", link.getAttribute("href") === "#" + entry.target.id);
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach((section) => observer.observe(section));
  }

  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();
}

/* ----------------------------- Wiring ----------------------------- */
function setupEvents() {
  // Product grid: add to cart / view
  $("#productGrid").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === "add") addToCart(id);
    if (button.dataset.action === "view") openProduct(id);
  });

  // Filters
  $("#filterChips").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (chip) setFilter(chip.dataset.filter);
  });

  // Admin console: insert
  const form = $("#insertForm");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const ok = insertWatch($("#adminName").value, $("#adminPrice").value, $("#adminImage").value);
    if (ok) {
      form.reset();
      $("#adminName").focus();
    }
  });

  // Admin console: SQL log toggle
  const logToggle = $("#logToggle");
  const sqlLog = $("#sqlLog");
  logToggle.addEventListener("click", () => {
    const show = sqlLog.hidden;
    sqlLog.hidden = !show;
    logToggle.textContent = show ? "Hide SQL Log" : "Show SQL Log";
    logToggle.setAttribute("aria-expanded", String(show));
    if (show) renderSqlLog();
  });

  $("#clearLogBtn").addEventListener("click", () => {
    state.log = [];
    renderSqlLog();
    toast("SQL log cleared.");
  });

  $("#exportBtn").addEventListener("click", exportDB);
  $("#resetBtn").addEventListener("click", resetDB);

  // Delete row inside DB table
  $("#dbRows").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-delete]");
    if (button) deleteWatch(button.dataset.delete);
  });

  // Cart
  $("#cartToggle").addEventListener("click", openCart);
  $("#cartClose").addEventListener("click", closeCart);
  $("#cartOverlay").addEventListener("click", closeCart);
  $("#clearCartBtn").addEventListener("click", clearCart);
  $("#checkoutBtn").addEventListener("click", openCheckout);

  $("#cartItems").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-cart]");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.cart === "inc") changeQty(id, 1);
    if (button.dataset.cart === "dec") changeQty(id, -1);
    if (button.dataset.cart === "remove") removeFromCart(id);
  });

  // Demo checkout dialog
  $("#checkoutClose").addEventListener("click", closeCheckout);
  $("#checkoutOverlay").addEventListener("click", closeCheckout);
  $("#checkoutForm").addEventListener("submit", handlePlaceOrder);
  $("#successContinue").addEventListener("click", finishCheckout);
  $("#successClose").addEventListener("click", closeCheckout);

  // Admin gate + panel
  $("#adminNavLink").addEventListener("click", (event) => {
    event.preventDefault();
    $("#primaryNav").classList.remove("is-open");
    $("#navToggle").setAttribute("aria-expanded", "false");
    openAdminPanel(true);
  });
  $$("[data-admin-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openAdminPanel(true);
    });
  });
  $$("[data-scroll-console]").forEach((button) => {
    button.addEventListener("click", () => openAdminPanel(true));
  });
  $("#adminForm").addEventListener("submit", handleAdminLogin);
  $("#adminClose").addEventListener("click", closeAdminLogin);
  $("#adminOverlay").addEventListener("click", closeAdminLogin);
  $("#adminLock").addEventListener("click", lockAdminPanel);

  // Lecturer guide
  $("#guideOpen").addEventListener("click", openGuide);
  $("#guideFab").addEventListener("click", openGuide);
  $("#guideClose").addEventListener("click", closeGuide);
  $("#guideDismiss").addEventListener("click", closeGuide);
  $("#guideOverlay").addEventListener("click", closeGuide);
  $("#guideConsole").addEventListener("click", () => {
    closeGuide();
    openAdminPanel(true);
  });
  $("#guideExport").addEventListener("click", () => {
    exportDB();
  });

  // Product detail modal
  $("#modalClose").addEventListener("click", closeProduct);
  $("#productOverlay").addEventListener("click", closeProduct);
  $("#modalAdd").addEventListener("click", (event) => {
    addToCart(event.currentTarget.dataset.id);
    closeProduct();
  });

  // Contact form
  $("#contactForm").addEventListener("submit", handleContactSubmit);

  // Escape closes the top-most overlays
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!$("#checkoutModal").hidden) closeCheckout();
    if (!$("#adminLogin").hidden) closeAdminLogin();
    if (!$("#guideModal").hidden) closeGuide();
    if (!$("#cartDrawer").hidden) closeCart();
    if (!$("#productModal").hidden) closeProduct();
  });
}

/* ----------------------------- Boot ----------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  setupNav();
  setupEvents();
  loadCart();

  try {
    renderProducts(); // "loading" state
    await initDB();
    if (adminUnlocked()) openAdminPanel(false); // keep the panel open on refresh
    console.info("[App] Ready. Database size:", state.db.export().length, "bytes.");
    toast("Local SQLite database ready.");
  } catch (err) {
    console.error("[App] Database failed to start.", err);
    updateDbStatus(true);
    renderProducts();
    const grid = $("#productGrid");
    if (grid) {
      grid.setAttribute("aria-busy", "false");
      grid.innerHTML =
        '<div class="grid-empty" style="grid-column:1/-1">' +
          "<strong>The local database could not start.</strong><br />" +
          "Check that the <code>vendor</code> folder is next to <code>index.html</code>, " +
          "then reload the page." +
        "</div>";
    }
    toast("Database failed to start. See the browser console.", "error");
  }
});
