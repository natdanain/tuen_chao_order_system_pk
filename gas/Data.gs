/** Sheet + value helpers. Every sheet is a table: row 1 = headers, one record per row. */

const TZ = 'Asia/Bangkok';
const SHEETS = { menu: 'Menu', settings: 'Settings', codes: 'Codes', customers: 'Customers', orders: 'Orders' };
const STATUS = { NEW: 'ใหม่', MAKING: 'กำลังทำ', READY: 'พร้อมส่ง', DONE: 'ส่งแล้ว', CANCEL: 'ยกเลิก' };

function table_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet "' + name + '" — run setup() first');
  const values = sh.getDataRange().getValues();
  const head = (values.shift() || []).map(h => String(h).trim());
  const rows = values.map((r, i) => {
    const o = { _row: i + 2 };
    head.forEach((h, j) => { if (h) o[h] = r[j]; });
    return o;
  });
  return { sh, head, rows };
}

function update_(t, row, patch) {
  Object.keys(patch).forEach(k => {
    const c = t.head.indexOf(k);
    if (c < 0) return;
    t.sh.getRange(row._row, c + 1).setValue(cell_(patch[k]));
    row[k] = patch[k];
  });
}

function append_(t, obj) {
  t.sh.appendRow(t.head.map(h => (h in obj ? cell_(obj[h]) : '')));
}

// Keep strings as typed: stops "0812345678" losing its 0, "07:30" turning into a time,
// and user text starting with "=" being run as a formula.
function cell_(v) {
  return typeof v === 'string' && /^[=+\-@\d']/.test(v) ? "'" + v : v;
}

function str_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, v.getFullYear() < 1900 ? 'HH:mm' : 'yyyy-MM-dd');
  return v == null ? '' : String(v).trim();
}
function num_(v) { return Number(v) || 0; }
function bool_(v) { return v === true || /^(true|yes|y|1|ใช่|เปิด)$/i.test(str_(v)); }
function on_(v) { return v === '' || v == null ? true : bool_(v); } // blank "active" cell = on
function list_(v, sep) { return str_(v).split(sep).map(x => x.trim()).filter(Boolean); }
function fmt_(d, pattern) { return Utilities.formatDate(d, TZ, pattern); }

function normTime_(t) {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(str_(t));
  return m ? m[1].padStart(2, '0') + ':' + m[2] : '';
}
function toMin_(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function fromMin_(x) {
  x = ((x % 1440) + 1440) % 1440;
  return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
}

const WD_ = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const MO_ = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function weekday_(d) { return Number(fmt_(d, 'u')) % 7; } // 0 = Sunday
function thaiDay_(d) { return WD_[weekday_(d)] + ' ' + Number(fmt_(d, 'd')) + ' ' + MO_[Number(fmt_(d, 'M')) - 1]; }
function dateFromStr_(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }

function settings_() {
  const raw = {};
  DEFAULT_SETTINGS.forEach(([k, v]) => { raw[k] = v; });
  table_(SHEETS.settings).rows.forEach(r => { const k = str_(r.key); if (k) raw[k] = r.value; });
  const n = (k, d) => { const v = str_(raw[k]); return v === '' || isNaN(v) ? d : Number(v); };
  return {
    shopName: str_(raw.shopName),
    shopSub: str_(raw.shopSub),
    acceptingOrders: bool_(raw.acceptingOrders),
    closedMessage: str_(raw.closedMessage) || 'ร้านปิดรับออเดอร์ชั่วคราว',
    slots: list_(raw.slots, ',').map(normTime_).filter(Boolean).sort(),
    preorderOnlySlots: list_(raw.preorderOnlySlots, ',').map(normTime_).filter(Boolean),
    cutoffMinutes: n('cutoffMinutes', 60),
    daysAhead: Math.max(1, n('daysAhead', 2)),
    closedWeekdays: list_(raw.closedWeekdays, ',').map(Number),
    maxCupsPerSlot: n('maxCupsPerSlot', 0),
    asapToday: bool_(raw.asapToday),
    openTime: normTime_(raw.openTime),
    todayLastOrder: normTime_(raw.todayLastOrder),
    closedDates: list_(raw.closedDates, ',').map(str_),
    allowPickup: bool_(raw.allowPickup),
    locations: list_(raw.locations, '|'),
    dropOptions: list_(raw.dropOptions, '|'),
    roomRequiredFor: list_(raw.roomRequiredFor, '|'),
    enableCodes: bool_(raw.enableCodes),
    extrasOff: list_(raw.extrasOff, '|'),
    enableStamps: bool_(raw.enableStamps),
    deliveryFee: n('deliveryFee', 0),
    sweetness: list_(raw.sweetness, '|'),
    sweetRecommended: str_(raw.sweetRecommended),
    extras: list_(raw.extras, '|').map(x => { const [name, p] = x.split('='); return [name.trim(), Number(p) || 0]; }),
    promptpay: str_(raw.promptpay).replace(/\D/g, ''),
    firstOrderPromptPayOnly: bool_(raw.firstOrderPromptPayOnly),
    stampGoal: Math.max(1, n('stampGoal', 10)),
    receiptMode: str_(raw.receiptMode) === 'reply' ? 'reply' : 'push',
    adminTo: str_(raw.adminTo),
    notifyCustomerOnStatus: bool_(raw.notifyCustomerOnStatus),
    // English display text (same order as the Thai lists above)
    shopSubEn: str_(raw.shopSubEn),
    closedMessageEn: str_(raw.closedMessageEn),
    locationsEn: list_(raw.locationsEn, '|'),
    dropOptionsEn: list_(raw.dropOptionsEn, '|'),
    extrasEn: list_(raw.extrasEn, '|'),
  };
}

/** English text for a Thai list value (by position), falling back to the Thai value. */
function en_(thList, enList, value) {
  const i = (thList || []).indexOf(value);
  return (i >= 0 && enList && enList[i]) || value;
}

function menu_() {
  return table_(SHEETS.menu).rows
    .filter(r => str_(r.id) && str_(r.name))
    .map(r => ({
      id: str_(r.id),
      available: on_(r.active), // unticked = still listed, shown as "ไม่พร้อมให้บริการ"
      cat: str_(r.category) || 'เมนู',
      catEn: str_(r.categoryEn),
      name: str_(r.name),
      nameEn: str_(r.nameEn),
      price: num_(r.price),
      best: num_(r.bestRank),
      img: /^https:\/\//.test(str_(r.imageUrl)) ? str_(r.imageUrl) : '',
      sweetOff: list_(r.sweetOff, '|'), // sweetness levels this drink can't be made at
      layers: list_(r.colors, '|')
        .map(x => { const [c, h] = x.split(':'); return [str_(c), Number(h) || 0]; })
        .filter(([c]) => /^#?[0-9a-zA-Z]+$/.test(c)),
    }));
}

/**
 * Delivery days with each slot's open/closed state, computed in Bangkok time.
 * `reason` (notYet | over | closed | full) lets the page word closed states in either language;
 * `note` is the Thai wording of the same thing.
 */
function days_(s, ordersTable) {
  const now = new Date();
  const nowMin = Number(fmt_(now, 'H')) * 60 + Number(fmt_(now, 'm'));
  const used = {};
  if (s.maxCupsPerSlot > 0) {
    (ordersTable || table_(SHEETS.orders)).rows.forEach(r => {
      if (str_(r.status) === STATUS.CANCEL) return;
      const k = str_(r.date) + ' ' + normTime_(r.slot);
      used[k] = (used[k] || 0) + num_(r.cups);
    });
  }
  const out = [];
  for (let i = 0; out.length < s.daysAhead && i < 14; i++) {
    const d = new Date(now.getTime() + i * 864e5);
    if (s.closedWeekdays.indexOf(weekday_(d)) >= 0) continue;
    const date = fmt_(d, 'yyyy-MM-dd');
    if (s.closedDates.indexOf(date) >= 0) continue;
    if (i === 0 && s.asapToday) {
      // Today = deliver as soon as it's ready, no slot to pick; open from openTime until todayLastOrder
      const notYet = !!s.openTime && nowMin < toMin_(s.openTime);
      const over = !!s.todayLastOrder && nowMin >= toMin_(s.todayLastOrder);
      const open = !notYet && !over;
      const note = over ? 'ปิดรับวันนี้แล้ว'
        : notYet ? 'เปิดรับ ' + s.openTime + ' น.'
        : s.todayLastOrder ? 'สั่งได้ถึง ' + s.todayLastOrder + ' น.' : '';
      out.push({
        date, label: thaiDay_(d), rel: 'วันนี้', asap: true, open, note, slots: [],
        reason: over ? 'over' : notYet ? 'notYet' : '', openTime: s.openTime, lastOrder: s.todayLastOrder,
      });
      continue;
    }
    // Same-day slots close cutoffMinutes before delivery ("order by" time shown for today only);
    // preorderOnlySlots (e.g. 06:30) can only be booked on an earlier day.
    const slots = s.slots.map(t => {
      if (i === 0 && s.preorderOnlySlots.indexOf(t) >= 0) return { time: t, open: false, reason: 'preorder', note: 'สั่งล่วงหน้าเท่านั้น' };
      const by = toMin_(t) - s.cutoffMinutes;
      if (i === 0 && nowMin >= by) return { time: t, open: false, reason: 'closed', note: 'ปิดรับแล้ว' };
      const orderBy = i === 0 ? fromMin_(by) : '';
      const byNote = orderBy ? 'สั่งก่อน ' + orderBy + ' น.' : '';
      if (s.maxCupsPerSlot > 0) {
        const left = Math.max(0, s.maxCupsPerSlot - (used[date + ' ' + t] || 0));
        if (!left) return { time: t, open: false, reason: 'full', note: 'เต็มแล้ว' };
        return { time: t, open: true, left, orderBy, note: ['เหลือ ' + left + ' แก้ว', byNote].filter(Boolean).join(' · ') };
      }
      return { time: t, open: true, orderBy, note: byNote };
    });
    out.push({ date, label: thaiDay_(d), rel: i === 0 ? 'วันนี้' : 'สั่งล่วงหน้า', slots });
  }
  return out;
}

function findCustomer_(userId) {
  const t = table_(SHEETS.customers);
  return { t, row: t.rows.find(r => str_(r.userId) === userId) || null };
}

const today_ = () => fmt_(new Date(), 'yyyy-MM-dd');
// startDate / endDate may be typed as text or turned into real dates by Sheets; str_ normalises both
const codeLive_ = row => on_(row.active) &&
  (!str_(row.startDate) || today_() >= str_(row.startDate)) && (!str_(row.endDate) || today_() <= str_(row.endDate));

/** Has this customer already used the code? perCustomer: once = ever, day = today (cancelled orders don't count). */
function codeUsedBy_(code, perCustomer, userId, ordersTable) {
  if (perCustomer !== 'once' && perCustomer !== 'day') return false;
  return ordersTable.rows.some(r => str_(r.userId) === userId && str_(r.code).toUpperCase() === code &&
    str_(r.status) !== STATUS.CANCEL &&
    (perCustomer === 'once' || (r.createdAt instanceof Date && fmt_(r.createdAt, 'yyyy-MM-dd') === today_())));
}

/**
 * Validates a discount code for this customer. ctx = {isFirst, userId, orders, cups}
 * cups is only checked when given (the checkout re-checks with the real cart).
 */
function findCode_(raw, ctx) {
  const code = str_(raw).toUpperCase();
  const t = table_(SHEETS.codes);
  const row = t.rows.find(r => str_(r.code).toUpperCase() === code);
  if (!row || !codeLive_(row)) fail_('ไม่พบโค้ด "' + code + '" หรือโค้ดหมดเวลาแล้ว', 'Code "' + code + '" was not found or has expired.');
  if (bool_(row.newCustomerOnly) && !ctx.isFirst) fail_('โค้ดนี้ใช้ได้เฉพาะออเดอร์แรก', 'This code is for first orders only.');
  const max = num_(row.maxUses);
  if (max && num_(row.used) >= max) fail_('โค้ดนี้ถูกใช้ครบจำนวนแล้ว', 'This code has been fully used.');
  const per = str_(row.perCustomer).toLowerCase();
  if (codeUsedBy_(code, per, ctx.userId, ctx.orders)) {
    if (per === 'day') fail_('วันนี้คุณใช้โค้ดนี้ไปแล้ว พรุ่งนี้ใช้ได้อีกนะคะ', 'You have already used this code today. Try again tomorrow.');
    fail_('คุณใช้โค้ดนี้ไปแล้ว', 'You have already used this code.');
  }
  const minCups = Math.max(1, num_(row.minCups));
  if (ctx.cups != null && ctx.cups < minCups) fail_('โค้ด ' + code + ' ใช้ได้เมื่อซื้อครบ ' + minCups + ' แก้ว',
    'Code ' + code + ' needs at least ' + minCups + ' drinks.');
  const amount = num_(row.amount);
  return { t, row, code, amount, minCups, label: str_(row.label) || 'ลด ' + amount + ' บาท', labelEn: str_(row.labelEn) };
}

/** Codes to advertise on the order page (banner ticked, active, within dates). */
function codeBanners_() {
  return table_(SHEETS.codes).rows
    .filter(r => str_(r.code) && bool_(r.banner) && codeLive_(r))
    .map(r => ({ code: str_(r.code).toUpperCase(), label: str_(r.label), labelEn: str_(r.labelEn), end: str_(r.endDate) }));
}

// ---------- order text for receipts / notifications ----------

// lang 'en' uses the English names saved with the order (extras: [thai, price, english])
function optsText_(l, lang) {
  const ex = l.extras.map(e => (lang === 'en' && e[2]) || e[0]);
  return [l.sweet].concat(ex, [l.note]).filter(Boolean).join(' · ');
}
function itemsText_(items) {
  return items.map(l => { const o = optsText_(l); return l.qty + '× ' + l.name + (o ? ' (' + o + ')' : ''); }).join('\n');
}
const ASAP = 'ทันที'; // stored in Orders.slot for same-day orders without a time slot

function whenText_(o, lang) {
  const t = normTime_(o.slot);
  const d = dateFromStr_(str_(o.date));
  if (lang === 'en') return fmt_(d, 'EEE d MMM') + ' · ' + (t || 'As soon as ready');
  return thaiDay_(d) + ' · ' + (t ? t + ' น.' : 'เร็วที่สุด');
}
// s may be null for Thai (no translation needed)
function whereText_(o, s, lang) {
  const en = lang === 'en' && s;
  if (str_(o.mode) === 'pickup') return en ? 'Pick up at the shop' : 'รับที่ร้าน';
  const loc = en ? en_(s.locations, s.locationsEn, str_(o.location)) : str_(o.location);
  const drop = en ? en_(s.dropOptions, s.dropOptionsEn, str_(o.drop)) : str_(o.drop);
  const note = en ? str_(o.locNote).replace(/ชั้น\s*(\S+)\s*ห้อง\s*/, 'Floor $1, Room ') : str_(o.locNote);
  return loc + (drop ? ' · ' + drop : '') + (note ? ' (' + note + ')' : '');
}

/** Order as shown to the customer (LIFF done screen + Flex receipt). Accepts a sheet row or a fresh record. */
function publicOrder_(o, s, lang) {
  const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
  const en = lang === 'en';
  return {
    no: str_(o.orderNo),
    lang: en ? 'en' : 'th',
    when: whenText_(o, lang),
    where: whereText_(o, s, lang),
    mode: str_(o.mode),
    items: items.map(l => ({ qty: l.qty, name: (en && l.nameEn) || l.name, opts: optsText_(l, lang), total: l.total })),
    subtotal: num_(o.subtotal),
    discount: num_(o.discount),
    deliveryFee: num_(o.deliveryFee),
    total: num_(o.total),
    pay: str_(o.pay),
  };
}
