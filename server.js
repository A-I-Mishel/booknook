require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const { admin, db, firebaseError } = require('./firebase');

const app = express();
// Trust Vercel's edge proxy so req.secure is true on https.
// Without this, cookie-session with secure:true silently drops
// the session cookie in production (login/signup never stick).
app.set('trust proxy', 1);
const port = Number(process.env.PORT || 3000);
const deliveryFee = 50;
const FieldValue = admin.firestore.FieldValue;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(cookieSession({
  name: 'booknook_session',
  keys: [process.env.SESSION_SECRET || 'booknook-development-secret'],
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
}));

app.use(async (req, res, next) => {
  res.locals.userId = (req.session && req.session.userId) || null;
  res.locals.isAdmin = false;
  res.locals.userName = null;
  if (!db) return next();
  if (req.session.userId) {
    try {
      const u = await db.collection('users').doc(req.session.userId).get();
      if (u.exists) {
        const data = u.data();
        res.locals.isAdmin = data.role === 'admin';
        res.locals.userName = data.full_name;
      }
    } catch (_) { /* ignore */ }
  }
  next();
});

// Health check must work even when Firestore isn't configured,
// so Vercel / uptime checks can verify the function booted.
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    dbReady: !!db,
    ...(firebaseError ? { firebaseError: firebaseError.message } : {}),
  });
});

// If Firebase failed to init, don't crash the serverless function
// (FUNCTION_INVOCATION_FAILED). Show a friendly config error instead.
app.use((req, res, next) => {
  if (db) return next();
  if (req.path === '/api/health' || req.path.startsWith('/assets')) return next();
  const message = firebaseError
    ? `Server misconfigured: ${firebaseError.message}`
    : 'Server misconfigured: Firebase credentials missing.';
  if (req.accepts('json') && !req.accepts('html')) {
    return res.status(500).json({ success: false, error: message });
  }
  return res.status(500).render('error', { code: 500, message });
});

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  if (!res.locals.isAdmin) return res.status(403).render('error', { code: 403, message: 'Admin access required' });
  next();
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function ts(value) {
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime() || 0;
}

/* ----------------------------- Cart helpers ----------------------------- */

async function getCartDoc(userId) {
  return db.collection('carts').doc(`user_${userId}`);
}

async function getCart(userId) {
  const cartDoc = await (await getCartDoc(userId)).get();
  const items = cartDoc.exists ? (cartDoc.data().items || []) : [];
  const enriched = items.map((it) => ({
    ...it,
    subtotal: Number(it.price) * Number(it.quantity),
  }));
  const subtotal = enriched.reduce((sum, i) => sum + i.subtotal, 0);
  return { items: enriched, subtotal, cartId: `user_${userId}` };
}

/* ----------------------------- Pages ----------------------------- */

app.get('/', async (req, res, next) => {
  try {
    const genresSnap = await db.collection('genres').get();
    const genres = genresSnap.docs.map((d) => d.data().genre_name);
    res.render('index', { genres });
  } catch (error) { next(error); }
});

app.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const genresSnap = await db.collection('genres').get();
    const genres = genresSnap.docs.map((d) => d.data().genre_name);
    res.render('search', { q, genres });
  } catch (error) { next(error); }
});

app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', async (req, res, next) => {
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');
  if (!email || !password) return res.render('login', { error: 'All fields are required' });
  try {
    const snap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snap.empty) return res.render('login', { error: 'Invalid credentials' });
    const userDoc = snap.docs[0];
    const user = userDoc.data();
    if (!(await bcrypt.compare(password, user.password))) return res.render('login', { error: 'Invalid credentials' });
    req.session.userId = userDoc.id;
    await userDoc.ref.update({ last_login: FieldValue.serverTimestamp() });
    res.redirect('/');
  } catch (error) { next(error); }
});

app.get('/register', (req, res) => res.render('register', { error: null }));
app.post('/register', async (req, res, next) => {
  const name = String(req.body.full_name || '').trim();
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');
  const confirmation = String(req.body.confirm_password || '');
  if (!name || !email || !password || !confirmation) return res.render('register', { error: 'All fields are required' });
  if (password !== confirmation) return res.render('register', { error: 'Passwords do not match' });
  try {
    const existing = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!existing.empty) return res.render('register', { error: 'Email already registered' });
    const ref = await db.collection('users').add({
      full_name: name,
      email,
      password: await bcrypt.hash(password, 12),
      role: 'customer',
      addresses: [],
      wishlist: [],
      created_at: FieldValue.serverTimestamp(),
      last_login: null,
    });
    req.session.userId = ref.id;
    res.redirect('/');
  } catch (error) { next(error); }
});

app.get('/api/auth/logout', (req, res) => { req.session = null; res.redirect('/login'); });

app.get('/cart', requireLogin, async (req, res, next) => {
  try {
    const cart = await getCart(req.session.userId);
    res.render('cart', { ...cart, deliveryFee });
  } catch (error) { next(error); }
});

app.get('/payment', requireLogin, async (req, res, next) => {
  try {
    const cart = await getCart(req.session.userId);
    const userDoc = await db.collection('users').doc(req.session.userId).get();
    const addresses = userDoc.exists ? (userDoc.data().addresses || []) : [];
    const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0] || null;
    res.render('payment', { ...cart, deliveryFee, error: null, defaultAddress });
  } catch (error) { next(error); }
});

app.get('/wishlist', requireLogin, async (req, res, next) => {
  try {
    const userDoc = await db.collection('users').doc(req.session.userId).get();
    const wishlist = userDoc.exists ? (userDoc.data().wishlist || []) : [];
    const books = [];
    for (const bookId of wishlist) {
      const b = await db.collection('books').doc(String(bookId)).get();
      if (b.exists) books.push({ book_id: Number(b.id), ...b.data() });
    }
    res.render('wishlist', { books });
  } catch (error) { next(error); }
});

app.get('/profile', requireLogin, async (req, res, next) => {
  try {
    const userDoc = await db.collection('users').doc(req.session.userId).get();
    const data = userDoc.exists ? userDoc.data() : { addresses: [], wishlist: [] };
    res.render('profile', { addresses: data.addresses || [], wishlistCount: (data.wishlist || []).length });
  } catch (error) { next(error); }
});

app.get('/orders', requireLogin, async (req, res, next) => {
  try {
    const snap = await db.collection('orders').where('userId', '==', req.session.userId).get();
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
    res.render('orders', { orders });
  } catch (error) { next(error); }
});

app.get('/orders/:id', requireLogin, async (req, res, next) => {
  try {
    const d = await db.collection('orders').doc(req.params.id).get();
    if (!d.exists) return res.status(404).render('error', { code: 404, message: 'Order not found' });
    const order = { id: d.id, ...d.data() };
    if (order.userId !== req.session.userId && !res.locals.isAdmin) return res.status(403).render('error', { code: 403, message: 'Forbidden' });
    res.render('order', { order });
  } catch (error) { next(error); }
});

app.get('/book/:id', async (req, res, next) => {
  try {
    const bookId = Number(req.params.id);
    const bookSnap = await db.collection('books').doc(String(bookId)).get();
    if (!bookSnap.exists) return res.status(404).render('error', { code: 404, message: 'Book not found' });
    const book = { book_id: bookId, ...bookSnap.data() };
    const reviewsSnap = await db.collection('reviews').where('bookId', '==', bookId).get();
    const reviews = reviewsSnap.docs.map((d) => d.data()).sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
    let inWishlist = false;
    if (req.session.userId) {
      const u = await db.collection('users').doc(req.session.userId).get();
      inWishlist = u.exists && (u.data().wishlist || []).includes(bookId);
    }
    res.render('book', { book, reviews, inWishlist });
  } catch (error) { next(error); }
});

/* ----------------------------- Admin pages ----------------------------- */

app.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const [booksSnap, ordersSnap] = await Promise.all([
      db.collection('books').get(),
      db.collection('orders').get(),
    ]);
    const orders = ordersSnap.docs.map((d) => d.data());
    const revenue = orders.filter((o) => o.payment && o.payment.status === 'paid').reduce((s, o) => s + Number(o.total), 0);
    res.render('admin/dashboard', {
      bookCount: booksSnap.size,
      orderCount: ordersSnap.size,
      revenue: revenue.toFixed(2),
    });
  } catch (error) { next(error); }
});

app.get('/admin/books', requireAdmin, async (req, res, next) => {
  try {
    const snap = await db.collection('books').orderBy('book_id').get();
    const books = snap.docs.map((d) => ({ book_id: Number(d.id), ...d.data() }));
    res.render('admin/books', { books });
  } catch (error) { next(error); }
});

app.get('/admin/books/new', requireAdmin, (req, res) => res.render('admin/book-form', { book: null }));

app.get('/admin/books/:id/edit', requireAdmin, async (req, res, next) => {
  try {
    const d = await db.collection('books').doc(String(req.params.id)).get();
    if (!d.exists) return res.status(404).render('error', { code: 404, message: 'Book not found' });
    const book = { book_id: Number(d.id), ...d.data() };
    res.render('admin/book-form', { book });
  } catch (error) { next(error); }
});

app.get('/admin/orders', requireAdmin, async (req, res, next) => {
  try {
    const snap = await db.collection('orders').orderBy('createdAt', 'desc').get();
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.render('admin/orders', { orders });
  } catch (error) { next(error); }
});

/* ----------------------------- API: books ----------------------------- */

function sanitizeBook(data) {
  return {
    title: String(data.title || '').trim(),
    author: String(data.author || '').trim(),
    price: Number(data.price) || 0,
    genre: String(data.genre || '').trim(),
    description: String(data.description || '').trim(),
    isbn: String(data.isbn || '').trim(),
    publisher: String(data.publisher || '').trim(),
    publishYear: Number(data.publishYear) || null,
    stock: Math.max(0, parseInt(data.stock, 10) || 0),
    cover_image: String(data.cover_image || '').trim(),
    featured: data.featured === 'on' || data.featured === true,
    bestseller: data.bestseller === 'on' || data.bestseller === true,
  };
}

app.get('/api/books', async (req, res, next) => {
  const section = req.query.section || 'all';
  const genre = req.query.genre || 'all';
  try {
    let ref = db.collection('books');
    if (section === 'featured') ref = ref.where('featured', '==', true);
    else if (section === 'bestseller') ref = ref.where('bestseller', '==', true);
    else if (genre !== 'all') ref = ref.where('genre', '==', genre);
    const snap = await ref.get();
    const books = snap.docs.map((d) => ({
      book_id: Number(d.id),
      ...d.data(),
      price: Number(d.data().price),
      stock: Number(d.data().stock || 0),
      rating: Number(d.data().rating || 0),
    }));
    res.json(books);
  } catch (error) { next(error); }
});

app.get('/api/books/search', async (req, res, next) => {
  const query = String(req.query.q || '').trim().toLowerCase();
  try {
    const snap = await db.collection('books').get();
    const books = snap.docs
      .map((d) => ({ book_id: Number(d.id), ...d.data(), price: Number(d.data().price) }))
      .filter((b) =>
        (b.title || '').toLowerCase().includes(query) ||
        (b.author || '').toLowerCase().includes(query) ||
        (b.genre || '').toLowerCase().includes(query) ||
        (b.description || '').toLowerCase().includes(query) ||
        (b.isbn || '').toLowerCase().includes(query)
      );
    res.json(books);
  } catch (error) { next(error); }
});

app.post('/api/books', requireAdmin, async (req, res, next) => {
  try {
    const b = sanitizeBook(req.body);
    if (!b.title || !b.author || !b.price) return res.json({ success: false, message: 'Title, author and price are required' });
    const countSnap = await db.collection('books').get();
    const nextId = (countSnap.docs.map((d) => Number(d.id)).sort((a, b) => b - a)[0] || 0) + 1;
    await db.collection('books').doc(String(nextId)).set({
      ...b,
      book_id: nextId,
      images: b.cover_image ? [b.cover_image] : [],
      rating: 0,
      ratingCount: 0,
    });
    res.json({ success: true, message: 'Book added', book_id: nextId });
  } catch (error) { next(error); }
});

app.put('/api/books/:id', requireAdmin, async (req, res, next) => {
  try {
    const ref = db.collection('books').doc(String(req.params.id));
    if (!(await ref.get()).exists) return res.json({ success: false, message: 'Book not found' });
    const b = sanitizeBook(req.body);
    await ref.update(b);
    res.json({ success: true, message: 'Book updated' });
  } catch (error) { next(error); }
});

app.delete('/api/books/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.collection('books').doc(String(req.params.id)).delete();
    res.json({ success: true, message: 'Book deleted' });
  } catch (error) { next(error); }
});

/* ----------------------------- API: cart ----------------------------- */

app.get('/api/cart', requireLogin, async (req, res, next) => {
  try {
    const cart = await getCart(req.session.userId);
    res.json({
      success: true,
      items: cart.items,
      subtotal: cart.subtotal,
      delivery_fee: deliveryFee,
      total: cart.subtotal + deliveryFee,
    });
  } catch (error) { next(error); }
});

app.post('/api/cart/add', requireLogin, async (req, res, next) => {
  const bookId = Number(req.body.book_id);
  if (!Number.isInteger(bookId) || bookId <= 0) return res.json({ success: false, message: 'Invalid book ID' });
  try {
    const bookSnap = await db.collection('books').doc(String(bookId)).get();
    if (!bookSnap.exists) return res.json({ success: false, message: 'Book not found' });
    const book = bookSnap.data();
    if (Number(book.stock || 0) <= 0) return res.json({ success: false, message: 'Book is out of stock' });
    const cartRef = await getCartDoc(req.session.userId);
    const cartSnap = await cartRef.get();
    const items = cartSnap.exists ? (cartSnap.data().items || []) : [];
    const existing = items.find((i) => i.bookId === bookId);
    if (existing) {
      if (existing.quantity + 1 > Number(book.stock || 0)) return res.json({ success: false, message: 'Not enough stock' });
      existing.quantity += 1;
    } else {
      items.push({
        bookId,
        title: book.title,
        author: book.author,
        price: Number(book.price),
        cover_image: book.cover_image,
        quantity: 1,
      });
    }
    await cartRef.set({ items }, { merge: true });
    res.json({ success: true, message: `${book.title} added to cart` });
  } catch (error) { next(error); }
});

app.post('/api/cart/update', requireLogin, async (req, res, next) => {
  const bookId = Number(req.body.book_id);
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(bookId) || bookId <= 0 || !Number.isInteger(quantity) || quantity < 0) {
    return res.json({ success: false, message: 'Invalid input' });
  }
  try {
    const cartRef = await getCartDoc(req.session.userId);
    const cartSnap = await cartRef.get();
    if (!cartSnap.exists) return res.json({ success: false, message: 'Cart is empty' });
    const items = cartSnap.data().items || [];
    const item = items.find((i) => i.bookId === bookId);
    if (!item) return res.json({ success: false, message: 'Item not found' });
    if (quantity === 0) {
      const idx = items.indexOf(item);
      items.splice(idx, 1);
    } else {
      const bookSnap = await db.collection('books').doc(String(bookId)).get();
      const stock = bookSnap.exists ? Number(bookSnap.data().stock || 0) : 0;
      if (quantity > stock) return res.json({ success: false, message: 'Not enough stock' });
      item.quantity = quantity;
    }
    await cartRef.set({ items }, { merge: true });
    res.json({ success: true, message: 'Cart updated' });
  } catch (error) { next(error); }
});

app.post('/api/cart/remove', requireLogin, async (req, res, next) => {
  const bookId = Number(req.body.book_id);
  if (!Number.isInteger(bookId) || bookId <= 0) return res.json({ success: false, message: 'Invalid input' });
  try {
    const cartRef = await getCartDoc(req.session.userId);
    const cartSnap = await cartRef.get();
    if (!cartSnap.exists) return res.json({ success: false, message: 'Cart is empty' });
    const items = (cartSnap.data().items || []).filter((i) => i.bookId !== bookId);
    await cartRef.set({ items }, { merge: true });
    res.json({ success: true, message: 'Item removed' });
  } catch (error) { next(error); }
});

/* ----------------------------- API: wishlist ----------------------------- */

app.get('/api/wishlist', requireLogin, async (req, res, next) => {
  try {
    const u = await db.collection('users').doc(req.session.userId).get();
    res.json({ success: true, wishlist: u.exists ? (u.data().wishlist || []) : [] });
  } catch (error) { next(error); }
});

async function setWishlist(userId, bookId, add) {
  const ref = db.collection('users').doc(userId);
  const u = await ref.get();
  const list = u.exists ? (u.data().wishlist || []) : [];
  const set = new Set(list);
  if (add) set.add(bookId); else set.delete(bookId);
  await ref.update({ wishlist: Array.from(set) });
}

app.post('/api/wishlist/add', requireLogin, async (req, res, next) => {
  const bookId = Number(req.body.book_id);
  if (!Number.isInteger(bookId) || bookId <= 0) return res.json({ success: false, message: 'Invalid book ID' });
  try {
    await setWishlist(req.session.userId, bookId, true);
    res.json({ success: true, message: 'Added to wishlist' });
  } catch (error) { next(error); }
});

app.post('/api/wishlist/remove', requireLogin, async (req, res, next) => {
  const bookId = Number(req.body.book_id);
  if (!Number.isInteger(bookId) || bookId <= 0) return res.json({ success: false, message: 'Invalid book ID' });
  try {
    await setWishlist(req.session.userId, bookId, false);
    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (error) { next(error); }
});

/* ----------------------------- API: reviews ----------------------------- */

app.get('/api/books/:id/reviews', async (req, res, next) => {
  try {
    const snap = await db.collection('reviews').where('bookId', '==', Number(req.params.id)).get();
    const reviews = snap.docs.map((d) => d.data()).sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
    res.json({ success: true, reviews });
  } catch (error) { next(error); }
});

app.post('/api/books/:id/reviews', requireLogin, async (req, res, next) => {
  const bookId = Number(req.params.id);
  const rating = Number(req.body.rating);
  const comment = String(req.body.comment || '').trim();
  if (![1, 2, 3, 4, 5].includes(rating)) return res.json({ success: false, message: 'Rating must be 1-5' });
  try {
    const bookSnap = await db.collection('books').doc(String(bookId)).get();
    if (!bookSnap.exists) return res.json({ success: false, message: 'Book not found' });
    const userDoc = await db.collection('users').doc(req.session.userId).get();
    const userName = userDoc.exists ? userDoc.data().full_name : 'Anonymous';
    await db.collection('reviews').add({
      bookId,
      userId: req.session.userId,
      userName,
      rating,
      comment,
      createdAt: FieldValue.serverTimestamp(),
    });
    await recomputeRating(bookId);
    res.json({ success: true, message: 'Review submitted' });
  } catch (error) { next(error); }
});

async function recomputeRating(bookId) {
  const snap = await db.collection('reviews').where('bookId', '==', bookId).get();
  const ratings = snap.docs.map((d) => d.data().rating);
  const count = ratings.length;
  const avg = count ? ratings.reduce((a, b) => a + b, 0) / count : 0;
  await db.collection('books').doc(String(bookId)).update({
    rating: Math.round(avg * 10) / 10,
    ratingCount: count,
  });
}

/* ----------------------------- API: addresses ----------------------------- */

app.post('/api/addresses', requireLogin, async (req, res, next) => {
  const { name, phone, line1, city, zip } = req.body;
  const isDefault = req.body.isDefault === 'on' || req.body.isDefault === true;
  if (![name, phone, line1, city].every((v) => String(v || '').trim())) {
    return res.json({ success: false, message: 'All address fields are required' });
  }
  try {
    const ref = db.collection('users').doc(req.session.userId);
    const u = await ref.get();
    const addresses = u.exists ? (u.data().addresses || []) : [];
    const newAddress = { id: genId(), name: String(name).trim(), phone: String(phone).trim(), line1: String(line1).trim(), city: String(city).trim(), zip: String(zip || '').trim(), isDefault };
    if (isDefault) addresses.forEach((a) => (a.isDefault = false));
    if (!addresses.length) newAddress.isDefault = true;
    addresses.push(newAddress);
    await ref.update({ addresses });
    res.json({ success: true, message: 'Address saved' });
  } catch (error) { next(error); }
});

app.post('/api/addresses/delete', requireLogin, async (req, res, next) => {
  const addressId = String(req.body.addressId || '');
  if (!addressId) return res.json({ success: false, message: 'Invalid address' });
  try {
    const ref = db.collection('users').doc(req.session.userId);
    const u = await ref.get();
    const addresses = (u.exists ? u.data().addresses || [] : []).filter((a) => a.id !== addressId);
    await ref.update({ addresses });
    res.json({ success: true, message: 'Address removed' });
  } catch (error) { next(error); }
});

/* ----------------------------- API: orders ----------------------------- */

app.post('/api/orders', requireLogin, async (req, res, next) => {
  const { name, address, phone, addressId } = req.body;
  if (!name || !phone) return res.json({ success: false, message: 'Name and phone are required' });
  try {
    const cart = await getCart(req.session.userId);
    if (!cart.items.length) return res.json({ success: false, message: 'Cart is empty' });

    let shippingAddress = String(address || '').trim();
    if (addressId) {
      const u = await db.collection('users').doc(req.session.userId).get();
      const addr = u.exists && (u.data().addresses || []).find((a) => a.id === String(addressId));
      if (addr) shippingAddress = `${addr.line1}, ${addr.city} ${addr.zip}`;
    }
    if (!shippingAddress) return res.json({ success: false, message: 'Delivery address is required' });

    const total = cart.subtotal + deliveryFee;
    const orderRef = db.collection('orders').doc();

    await admin.firestore().runTransaction(async (t) => {
      for (const item of cart.items) {
        const bookRef = db.collection('books').doc(String(item.bookId));
        const bookSnap = await t.get(bookRef);
        if (!bookSnap.exists) throw new Error(`Book ${item.bookId} not found`);
        const stock = Number(bookSnap.data().stock || 0);
        if (stock < item.quantity) throw new Error(`Not enough stock for ${bookSnap.data().title}`);
        t.update(bookRef, { stock: stock - item.quantity });
      }
      t.set(orderRef, {
        userId: req.session.userId,
        customerName: String(name).trim(),
        items: cart.items.map((i) => ({ bookId: i.bookId, title: i.title, author: i.author, price: i.price, quantity: i.quantity, cover_image: i.cover_image })),
        subtotal: cart.subtotal,
        deliveryFee,
        total,
        status: 'pending',
        payment: { method: 'mock', status: 'paid', transactionId: genId(), paidAt: FieldValue.serverTimestamp() },
        shippingAddress,
        phone: String(phone).trim(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    const cartRef = await getCartDoc(req.session.userId);
    await cartRef.set({ items: [] }, { merge: true });

    res.json({ success: true, message: 'Order placed successfully', orderId: orderRef.id });
  } catch (error) {
    res.json({ success: false, message: error.message || 'Could not place order' });
  }
});

/* ----------------------------- API: admin order status ----------------------------- */

const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

app.post('/api/admin/orders/:id/status', requireAdmin, async (req, res, next) => {
  const status = String(req.body.status || '');
  if (!ORDER_STATUSES.includes(status)) return res.json({ success: false, message: 'Invalid status' });
  try {
    const ref = db.collection('orders').doc(req.params.id);
    if (!(await ref.get()).exists) return res.json({ success: false, message: 'Order not found' });
    await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
    res.json({ success: true, message: 'Order updated' });
  } catch (error) { next(error); }
});

/* ----------------------------- Error handling ----------------------------- */

app.use((req, res) => {
  res.status(404).render('error', { code: 404, message: 'Page not found' });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  if (req.accepts('json')) return res.status(500).json({ success: false, error: 'Server error' });
  res.status(500).render('error', { code: 500, message: 'Something went wrong' });
});

if (require.main === module) app.listen(port, () => console.log(`BookNook running at http://localhost:${port}`));
module.exports = app;
