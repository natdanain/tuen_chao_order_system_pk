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
    cutoffMinutes: n('cutoffMinutes', 60),
    daysAhead: Math.max(1, n('daysAhead', 2)),
    closedWeekdays: list_(raw.closedWeekdays, ',').map(Number),
    maxCupsPerSlot: n('maxCupsPerSlot', 0),
    asapToday: bool_(raw.asapToday),
    todayLastOrder: normTime_(raw.todayLastOrder),
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
  };
}

function menu_() {
  return table_(SHEETS.menu).rows
    .filter(r => str_(r.id) && str_(r.name) && on_(r.active))
    .map(r => ({
      id: str_(r.id),
      cat: str_(r.category) || 'เมนู',
      name: str_(r.name),
      price: num_(r.price),
      best: num_(r.bestRank),
      img: /^https:\/\//.test(str_(r.imageUrl)) ? str_(r.imageUrl) : '',
      sweetOff: list_(r.sweetOff, '|'), // sweetness levels this drink can't be made at
      layers: list_(r.colors, '|')
        .map(x => { const [c, h] = x.split(':'); return [str_(c), Number(h) || 0]; })
        .filter(([c]) => /^#?[0-9a-zA-Z]+$/.test(c)),
    }));
}

/** Delivery days with each slot's open/closed state, computed in Bangkok time. */
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
    if (i === 0 && s.asapToday) {
      // Today = deliver as soon as it's ready, no slot to pick; open until todayLastOrder
      const open = !s.todayLastOrder || nowMin < toMin_(s.todayLastOrder);
      const note = !open ? 'ปิดรับวันนี้แล้ว' : s.todayLastOrder ? 'สั่งได้ถึง ' + s.todayLastOrder + ' น.' : '';
      out.push({ date, label: thaiDay_(d), rel: 'วันนี้', asap: true, open, note, slots: [] });
      continue;
    }
    const slots = s.slots.map(t => {
      const close = toMin_(t) - s.cutoffMinutes;
      if (i === 0 && nowMin >= close) return { time: t, open: false, note: 'ปิดรับแล้ว' };
      if (s.maxCupsPerSlot > 0) {
        const left = Math.max(0, s.maxCupsPerSlot - (used[date + ' ' + t] || 0));
        if (!left) return { time: t, open: false, note: 'เต็มแล้ว' };
        return { time: t, open: true, left, note: 'เหลือ ' + left + ' แก้ว · ก่อน ' + fromMin_(close) };
      }
      return { time: t, open: true, note: 'สั่งก่อน ' + fromMin_(close) };
    });
    out.push({ date, label: thaiDay_(d), rel: i === 0 ? 'วันนี้' : i === 1 ? 'พรุ่งนี้' : '', slots });
  }
  return out;
}

function findCustomer_(userId) {
  const t = table_(SHEETS.customers);
  return { t, row: t.rows.find(r => str_(r.userId) === userId) || null };
}

function findCode_(raw, isFirst) {
  const code = str_(raw).toUpperCase();
  const t = table_(SHEETS.codes);
  const row = t.rows.find(r => str_(r.code).toUpperCase() === code);
  if (!row || !on_(row.active)) fail_('ไม่พบโค้ด "' + code + '" ลองตรวจตัวสะกดอีกครั้ง');
  if (bool_(row.newCustomerOnly) && !isFirst) fail_('โค้ดนี้ใช้ได้เฉพาะออเดอร์แรก');
  const max = num_(row.maxUses);
  if (max && num_(row.used) >= max) fail_('โค้ดนี้ถูกใช้ครบจำนวนแล้ว');
  const amount = num_(row.amount);
  return { t, row, code, amount, label: str_(row.label) || 'ลด ' + amount + ' บาท' };
}

// ---------- order text for receipts / notifications ----------

function optsText_(l) { return [l.sweet].concat(l.extras.map(e => e[0]), [l.note]).filter(Boolean).join(' · '); }
function itemsText_(items) {
  return items.map(l => { const o = optsText_(l); return l.qty + '× ' + l.name + (o ? ' (' + o + ')' : ''); }).join('\n');
}
const ASAP = 'ทันที'; // stored in Orders.slot for same-day orders without a time slot

function whenText_(o) {
  const t = normTime_(o.slot);
  return thaiDay_(dateFromStr_(str_(o.date))) + ' · ' + (t ? t + ' น.' : 'เร็วที่สุด');
}
function whereText_(o) {
  if (str_(o.mode) === 'pickup') return 'รับที่ร้าน';
  return str_(o.location) + (str_(o.drop) ? ' · ' + str_(o.drop) : '') + (str_(o.locNote) ? ' (' + str_(o.locNote) + ')' : '');
}

/** Order as shown to the customer (LIFF done screen + Flex receipt). Accepts a sheet row or a fresh record. */
function publicOrder_(o) {
  const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
  return {
    no: str_(o.orderNo),
    when: whenText_(o),
    where: whereText_(o),
    mode: str_(o.mode),
    items: items.map(l => ({ qty: l.qty, name: l.name, opts: optsText_(l), total: l.total })),
    subtotal: num_(o.subtotal),
    discount: num_(o.discount),
    deliveryFee: num_(o.deliveryFee),
    total: num_(o.total),
    pay: str_(o.pay),
  };
}
