/**
 * ตื่นเช้า (TUEN_CHAO) — backend for the LIFF order page.
 * One web-app URL serves two callers:
 *   - the LIFF page:  POST {action, idToken, ...}
 *   - LINE webhook:   POST {destination, events:[...]}   (only needed when receiptMode = reply)
 */

const ACTIONS = { init: init_, checkCode: checkCode_, order: order_, pushReceipt: pushReceipt_ };

// Language of customer-facing text for the current request ('th' | 'en'), set from body.lang.
// The sheet always stores Thai; English only changes what the customer reads.
let LANG_ = 'th';

function doGet() {
  return json_({ ok: true, service: 'home-cafe' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (_) { return json_({ ok: false, error: 'bad request' }); }
  if (Array.isArray(body.events)) {
    handleWebhook_(body.events);
    return json_({ ok: true });
  }
  LANG_ = body.lang === 'en' ? 'en' : 'th';
  try {
    const fn = ACTIONS[body.action];
    if (!fn) fail_('unknown action');
    return json_(Object.assign({ ok: true }, fn(body)));
  } catch (err) {
    if (!err.user) console.error(err && err.stack || err);
    return json_({ ok: false, error: err.user ? err.message : LANG_ === 'en' ? 'Something went wrong. Please try again.' : 'ระบบขัดข้อง ลองใหม่อีกครั้ง' });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Error whose message is safe to show the customer, in Thai or (when given) English. */
function fail_(th, en) {
  const e = new Error(LANG_ === 'en' && en ? en : th);
  e.user = true;
  throw e;
}

// ---------- actions ----------

function init_(b) {
  const user = auth_(b.idToken);
  const s = settings_();
  const c = findCustomer_(user.userId).row;
  return { config: publicConfig_(s), customer: customerView_(c, user) };
}

function publicConfig_(s) {
  return {
    shopName: s.shopName, shopSub: s.shopSub,
    acceptingOrders: s.acceptingOrders, closedMessage: s.closedMessage,
    // English display text; same order as the Thai lists (values sent back are always the Thai ones)
    en: {
      shopSub: s.shopSubEn, closedMessage: s.closedMessageEn,
      locations: s.locationsEn, dropOptions: s.dropOptionsEn, extras: s.extrasEn,
    },
    allowPickup: s.allowPickup, locations: s.locations, deliveryFee: s.deliveryFee,
    dropOptions: s.dropOptions, roomRequiredFor: s.roomRequiredFor,
    enableCodes: s.enableCodes, enableStamps: s.enableStamps, extrasOff: s.extrasOff,
    sweetness: s.sweetness, sweetRecommended: s.sweetRecommended, extras: s.extras,
    bankName: s.bankName, bankAccountName: s.bankAccountName,
    bankAccountNo: s.bankAccountNo, bankQrUrl: s.bankQrUrl,
    firstOrderTransferOnly: s.firstOrderTransferOnly,
    stampGoal: s.stampGoal, receiptMode: s.receiptMode,
    codeBanners: s.enableCodes ? codeBanners_() : [],
    menu: menu_(), days: days_(s),
  };
}

function customerView_(c, user) {
  return {
    name: c ? str_(c.displayName) || user.name : user.name,
    phone: c ? str_(c.phone) : '',
    orders: c ? num_(c.orders) : 0,
    stamps: c ? num_(c.stamps) : 0,
    freeCups: c ? num_(c.freeCups) : 0,
    lastMode: c ? str_(c.lastMode) : '',
    lastLoc: c ? str_(c.lastLoc) : '',
    lastDrop: c ? str_(c.lastDrop) : '',
    lastLocNote: c ? str_(c.lastLocNote) : '',
  };
}

function checkCode_(b) {
  const user = auth_(b.idToken);
  if (!settings_().enableCodes) fail_('ตอนนี้ยังไม่เปิดใช้โค้ดส่วนลด', 'Discount codes are not available right now.');
  const c = findCustomer_(user.userId).row;
  const code = findCode_(b.code, { isFirst: !c || num_(c.orders) === 0, userId: user.userId, orders: table_(SHEETS.orders) });
  return { code: { code: code.code, amount: code.amount, minCups: code.minCups, label: code.label, labelEn: code.labelEn } };
}

/** Creates an order. The client only sends choices; every price is recomputed here. */
function order_(b) {
  const user = auth_(b.idToken);
  const o = b.order || {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) fail_('ร้านกำลังรับออเดอร์อื่นอยู่ ลองกดอีกครั้ง', 'The shop is busy with another order. Please tap again.');
  let s, order, cust;
  try {
    s = settings_();
    if (!s.acceptingOrders) fail_(s.closedMessage, s.closedMessageEn);
    const ot = table_(SHEETS.orders);
    const ct = table_(SHEETS.customers);
    const c = ct.rows.find(r => str_(r.userId) === user.userId);
    const isFirst = !c || num_(c.orders) === 0;

    if (o.mode !== 'deliver' && o.mode !== 'pickup') fail_('เลือกวิธีรับเครื่องดื่มอีกครั้ง', 'Please choose how to receive your drinks again.');
    if (o.mode === 'pickup' && !s.allowPickup) fail_('ตอนนี้ร้านยังไม่เปิดให้รับเองที่ร้าน', 'Pick-up is not available right now.');
    const mode = o.mode;
    const deliver = mode === 'deliver';
    const loc = !deliver ? '' : s.locations.length === 1 ? s.locations[0] : str_(o.loc);
    if (deliver && s.locations.indexOf(loc) < 0) fail_('เลือกสถานที่ส่งอีกครั้ง', 'Please choose the delivery place again.');
    const drop = deliver && s.dropOptions.length ? str_(o.drop) : '';
    if (deliver && s.dropOptions.length && s.dropOptions.indexOf(drop) < 0) fail_('เลือกวิธีส่งอีกครั้ง', 'Please choose the delivery option again.');
    // With drop options, the room field only exists for drops in roomRequiredFor (e.g. not for the food locker)
    const roomField = deliver && (!s.dropOptions.length || s.roomRequiredFor.indexOf(drop) >= 0);
    const locNote = roomField ? str_(o.locNote).slice(0, 100) : '';
    if (roomField && s.dropOptions.length && !locNote) fail_('กรอกเลขห้องด้วยนะคะ', 'Please enter your floor and room number.');
    const phone = str_(o.phone).replace(/\D/g, '');
    if (!/^0\d{8,9}$/.test(phone)) fail_('เบอร์โทรไม่ถูกต้อง', 'Invalid phone number.');

    const menu = {};
    menu_().forEach(m => { menu[m.id] = m; });
    const extraPrice = new Map(s.extras.filter(([n]) => s.extrasOff.indexOf(n) < 0));
    const extraEn = n => s.extrasEn[s.extras.findIndex(e => e[0] === n)] || '';
    if (!Array.isArray(o.items) || !o.items.length) fail_('ยังไม่มีเครื่องดื่มในตะกร้า', 'Your cart is empty.');
    if (o.items.length > 30) fail_('รายการเยอะเกินไป ทักแชทร้านได้เลย', 'Too many items. Please message the shop in chat.');
    const items = o.items.map(it => {
      const m = menu[str_(it.id)];
      if (!m) fail_('มีเมนูที่หมดแล้ว ลบออกจากตะกร้าแล้วสั่งใหม่', 'Some items are no longer on the menu. Please remove them and order again.');
      if (!m.available) fail_(m.name + ' ไม่พร้อมให้บริการตอนนี้ ลบออกจากตะกร้าแล้วสั่งใหม่',
        (m.nameEn || m.name) + ' is not available right now. Please remove it and order again.');
      const qty = Math.floor(Number(it.qty));
      if (!(qty >= 1 && qty <= 20)) fail_('จำนวนแก้วไม่ถูกต้อง', 'Invalid quantity.');
      const sweet = str_(it.sweet);
      if (s.sweetness.length && (s.sweetness.indexOf(sweet) < 0 || m.sweetOff.indexOf(sweet) >= 0)) fail_('เลือกระดับความหวานของ ' + m.name + ' อีกครั้ง',
        'Please choose the sweetness for ' + (m.nameEn || m.name) + ' again.');
      // extras: [thaiName, price, englishName]
      const extras = Array.from(new Set((it.extras || []).map(str_)))
        .filter(n => extraPrice.has(n)).map(n => [n, extraPrice.get(n), extraEn(n)]);
      const unit = m.price + extras.reduce((a, e) => a + e[1], 0);
      return { id: m.id, name: m.name, nameEn: m.nameEn, base: m.price, qty, sweet, extras, note: str_(it.note).slice(0, 100), unit, total: unit * qty };
    });
    const cups = items.reduce((a, l) => a + l.qty, 0);

    const day = days_(s, ot).filter(d => d.date === str_(o.date))[0];
    let slotTime;
    if (day && day.asap) {
      if (!day.open) {
        if (day.reason === 'notYet') fail_('ร้านเปิดรับ ' + day.openTime + ' น. ตอนนี้สั่งล่วงหน้าได้นะคะ',
          'We start taking orders at ' + day.openTime + '. You can pre-order for another day.');
        fail_('วันนี้ปิดรับออเดอร์แล้ว สั่งล่วงหน้าได้นะคะ', 'We have stopped taking orders for today. You can pre-order for another day.');
      }
      slotTime = ASAP;
    } else {
      const slot = day && day.slots.filter(x => x.time === str_(o.slot))[0];
      if (!slot || !slot.open) fail_('รอบนี้ปิดรับแล้ว เลือกรอบใหม่อีกครั้ง', 'This delivery time is closed. Please choose another time.');
      if (slot.left != null && cups > slot.left) fail_('รอบ ' + slot.time + ' น. รับได้อีก ' + slot.left + ' แก้ว',
        'Only ' + slot.left + ' more drinks can be made for ' + slot.time + '.');
      slotTime = slot.time;
    }

    const subtotal = items.reduce((a, l) => a + l.total, 0);
    const useFree = !!o.useFree;
    if (useFree && !(s.enableStamps && c && num_(c.freeCups) > 0)) fail_('ยังไม่มีสิทธิ์แก้วฟรี', 'You have no free drink yet.');
    const freeDisc = useFree ? Math.max.apply(null, items.map(l => l.base)) : 0;
    if (str_(o.code) && !s.enableCodes) fail_('ตอนนี้ยังไม่เปิดใช้โค้ดส่วนลด', 'Discount codes are not available right now.');
    // re-checked here (not trusted from checkCode): still live, not used by this customer yet, enough cups
    const code = str_(o.code) ? findCode_(o.code, { isFirst, userId: user.userId, orders: ot, cups }) : null;
    const discount = Math.min(subtotal, freeDisc + (code ? code.amount : 0));
    const deliveryFee = mode === 'deliver' ? s.deliveryFee : 0;
    const total = subtotal - discount + deliveryFee;
    const pay = o.pay === 'cash' ? 'cash' : 'bank';
    if (pay === 'cash' && isFirst && s.firstOrderTransferOnly) fail_('ออเดอร์แรกชำระผ่านการโอนบัญชีกสิกรก่อนนะคะ', 'Your first order must be paid by KBank transfer.');

    const now = new Date();
    const prefix = 'ORD-' + fmt_(now, 'yyyyMMdd') + '-';
    const seq = ot.rows.reduce((mx, r) => {
      const no = str_(r.orderNo);
      return no.indexOf(prefix) === 0 ? Math.max(mx, Number(no.slice(prefix.length)) || 0) : mx;
    }, 0) + 1;
    const earned = s.enableStamps ? Math.max(0, cups - (useFree ? 1 : 0)) : 0;

    order = {
      orderNo: prefix + String(seq).padStart(3, '0'), createdAt: now, status: STATUS.NEW, paid: false,
      date: day.date, slot: slotTime, mode, location: loc, drop, locNote,
      displayName: user.name, phone, itemsText: itemsText_(items), cups,
      subtotal, discount, deliveryFee, total, pay, code: code ? code.code : '', usedFreeCup: useFree,
      note: str_(o.note).slice(0, 300), stampsEarned: earned,
      items: JSON.stringify(items), userId: user.userId, receipt: '', notified: '', lang: LANG_,
    };
    append_(ot, order);
    if (code) update_(code.t, code.row, { used: num_(code.row.used) + 1 });

    let stamps = (c ? num_(c.stamps) : 0) + earned;
    const freeCups = (c ? num_(c.freeCups) : 0) - (useFree ? 1 : 0) + Math.floor(stamps / s.stampGoal);
    stamps = stamps % s.stampGoal;
    const patch = {
      displayName: user.name || (c ? str_(c.displayName) : ''), phone,
      orders: (c ? num_(c.orders) : 0) + 1, stamps, freeCups,
      lastMode: mode, lastLoc: loc, lastDrop: drop, lastLocNote: locNote, lastOrderAt: now,
    };
    if (c) update_(ct, c, patch);
    else append_(ct, Object.assign({ userId: user.userId, firstOrderAt: now }, patch));
    cust = { orders: patch.orders, stamps, freeCups };
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  if (s.adminTo) {
    try { push_(s.adminTo, [{ type: 'text', text: adminText_(order) }]); } catch (e) { console.error(e); }
  }
  let receiptSent = false;
  if (s.receiptMode === 'push') {
    try { receiptSent = sendReceipt_(order.orderNo, user.userId, null); } catch (e) { console.error(e); }
  }
  return { order: publicOrder_(order, s, LANG_), customer: cust, receiptSent };
}

/** Fallback for receiptMode = reply when the LIFF page could not send the confirm message itself. */
function pushReceipt_(b) {
  const user = auth_(b.idToken);
  return { sent: sendReceipt_(str_(b.orderNo), user.userId, null) };
}

function adminText_(o) {
  const po = publicOrder_(o, null, 'th'); // the shop always reads Thai
  return '🛎 ออเดอร์ใหม่ ' + po.no + (o.lang === 'en' ? ' (ลูกค้าใช้ภาษาอังกฤษ)' : '') + '\n' +
    (o.mode === 'deliver' ? 'ส่ง ' : 'รับ ') + po.when + '\n📍 ' + po.where + '\n\n' +
    o.itemsText + '\n\n' +
    'ยอด ' + o.total + ' บาท · ' + (o.pay === 'cash' ? 'เงินสด' : 'โอนบัญชีกสิกร') +
    (o.code ? ' (โค้ด ' + o.code + ' −' + o.discount + ')' : '') + '\n' +
    '👤 ' + o.displayName + ' ' + o.phone +
    (o.note ? '\n📝 ' + o.note : '');
}

// ---------- owner edits the Orders sheet (installable onEdit trigger, see setup) ----------

function onOrderEdit(e) {
  try {
    const sh = e.range.getSheet();
    if (sh.getName() !== SHEETS.orders || e.range.getLastRow() < 2) return;
    const t = table_(SHEETS.orders);
    const statusCol = t.head.indexOf('status') + 1;
    const paidCol = t.head.indexOf('paid') + 1;
    const touchesStatus = e.range.getColumn() <= statusCol && e.range.getLastColumn() >= statusCol;
    const touchesPaid = e.range.getColumn() <= paidCol && e.range.getLastColumn() >= paidCol;
    if (!touchesStatus && !touchesPaid) return;
    const s = settings_();
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      for (let r = Math.max(2, e.range.getRow()); r <= e.range.getLastRow(); r++) {
        const row = t.rows[r - 2];
        if (!row || !str_(row.userId)) continue;
        if (touchesPaid && str_(row.pay) !== 'cash' && bool_(row.paid) &&
            (str_(row.status) === STATUS.NEW || str_(row.status) === STATUS.VERIFYING)) {
          update_(t, row, { status: STATUS.MAKING });
        }
        handleStatus_(t, row, s);
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error(err && err.stack || err);
  }
}

function handleStatus_(t, r, s) {
  const status = str_(r.status);
  const supported = [STATUS.VERIFYING, STATUS.MAKING, STATUS.READY, STATUS.DELIVERING, STATUS.DONE, STATUS.CANCEL];
  if (supported.indexOf(status) < 0) return;
  const done = str_(r.notified).split(',').filter(Boolean);
  if (done.indexOf(status) >= 0) return;
  if (status === STATUS.CANCEL) revertOrder_(r, s);
  update_(t, r, { notified: done.concat(status).join(',') });
  if (!s.notifyCustomerOnStatus) return;
  const no = str_(r.orderNo);
  const en = str_(r.lang) === 'en';
  const where = whereText_(r, s, en ? 'en' : 'th');
  let text;
  if (status === STATUS.VERIFYING) {
    text = en ? '🧾 We received the slip for order ' + no + ' and are checking the payment.'
      : '🧾 ได้รับสลิปของออเดอร์ ' + no + ' แล้วค่ะ กำลังตรวจสอบยอดนะคะ';
  } else if (status === STATUS.MAKING) {
    text = en ? '✅ Payment confirmed for order ' + no + '. We are making your drinks now.'
      : '✅ ยืนยันยอดออเดอร์ ' + no + ' แล้วค่ะ ร้านกำลังทำเครื่องดื่มให้นะคะ';
  } else if (status === STATUS.READY) {
    text = str_(r.mode) === 'pickup'
      ? (en ? '☕ Order ' + no + ' is ready. Come and pick it up!' : '☕ ออเดอร์ ' + no + ' พร้อมแล้ว มารับที่ร้านได้เลยค่ะ')
      : (en ? '☕ Order ' + no + ' is ready and waiting for delivery.' : '☕ ออเดอร์ ' + no + ' พร้อมแล้ว กำลังรอจัดส่งค่ะ');
  } else if (status === STATUS.DELIVERING) {
    text = en ? '🛵 Order ' + no + ' is on its way to ' + where + '.'
      : '🛵 ออเดอร์ ' + no + ' กำลังไปส่งที่ ' + where + ' นะคะ';
  } else if (status === STATUS.DONE) {
    text = en ? '💛 Order ' + no + ' has been delivered. Thank you for supporting TUEN_CHAO. See you next time!'
      : '💛 ส่งออเดอร์ ' + no + ' เรียบร้อยแล้ว ขอบคุณที่อุดหนุนตื่นเช้านะคะ แล้วพบกันใหม่ค่ะ';
  } else {
    text = en ? 'Order ' + no + ' has been cancelled. If you have already paid, we will contact you here for a refund.'
      : 'ออเดอร์ ' + no + ' ถูกยกเลิกแล้ว หากชำระเงินไปแล้ว ร้านจะติดต่อคืนเงินทางแชทนี้นะคะ';
  }
  push_(str_(r.userId), [{ type: 'text', text }]);
}

/** Give back stamps / free cup / code use when an order is cancelled. */
function revertOrder_(r, s) {
  const { t, row: c } = findCustomer_(str_(r.userId));
  if (c) {
    let stamps = num_(c.stamps) - num_(r.stampsEarned);
    let free = num_(c.freeCups) + (bool_(r.usedFreeCup) ? 1 : 0);
    while (stamps < 0 && free > 0) { free--; stamps += s.stampGoal; }
    update_(t, c, { stamps: Math.max(0, stamps), freeCups: free, orders: Math.max(0, num_(c.orders) - 1) });
  }
  const code = str_(r.code).toUpperCase();
  if (code) {
    const ct = table_(SHEETS.codes);
    const row = ct.rows.find(x => str_(x.code).toUpperCase() === code);
    if (row) update_(ct, row, { used: Math.max(0, num_(row.used) - 1) });
  }
}
