/** LINE Platform: ID-token check, Messaging API, webhook, Flex receipt. */

function prop_(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw new Error('Missing script property ' + k);
  return v;
}

/** Verifies the LIFF ID token with LINE and returns {userId, name}. Cached until the token expires. */
function auth_(idToken) {
  if (!idToken) fail_('กรุณาเปิดหน้านี้จาก LINE', 'Please open this page from LINE.');
  const cache = CacheService.getScriptCache();
  const key = 'tok_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    payload: { id_token: idToken, client_id: prop_('LINE_LOGIN_CHANNEL_ID') },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    console.warn('id token rejected', res.getContentText());
    fail_('เซสชันหมดอายุ ปิดแล้วเปิดหน้านี้ใหม่อีกครั้ง', 'Your session has expired. Please close and reopen this page.');
  }
  const j = JSON.parse(res.getContentText());
  const user = { userId: j.sub, name: j.name || '' };
  const ttl = Math.max(60, Math.min(21600, j.exp - Math.floor(Date.now() / 1000)));
  cache.put(key, JSON.stringify(user), ttl);
  return user;
}

function lineApi_(path, payload) {
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/' + path, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + prop_('LINE_CHANNEL_ACCESS_TOKEN') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('LINE ' + path + ' ' + res.getResponseCode() + ': ' + res.getContentText());
}
function push_(to, messages) { lineApi_('push', { to, messages }); }
function reply_(replyToken, messages) { lineApi_('reply', { replyToken, messages }); }

/**
 * Apps Script cannot read request headers, so X-Line-Signature is not verified.
 * State changes happen only after a reply via the event's replyToken succeeds;
 * LINE rejects that token unless the event is genuine.
 */
function handleWebhook_(events) {
  events.forEach(ev => {
    try {
      if (ev.type !== 'message' || !ev.message) return;
      const src = ev.source || {};
      if (ev.message.type === 'image' && src.userId) {
        const ot = table_(SHEETS.orders);
        const r = ot.rows.slice().reverse().find(x => str_(x.userId) === src.userId &&
          str_(x.pay) !== 'cash' && !bool_(x.paid) && str_(x.status) !== STATUS.CANCEL && str_(x.status) !== STATUS.DONE);
        if (!r) return;
        const en = str_(r.lang) === 'en';
        const no = str_(r.orderNo);
        reply_(ev.replyToken, [{ type: 'text', text: en
          ? '🧾 We received your slip for order ' + no + '. We are checking the payment and will update you here.'
          : '🧾 ได้รับสลิปของออเดอร์ ' + no + ' แล้วค่ะ กำลังตรวจสอบยอด แล้วจะแจ้งผลในแชทนี้นะคะ' }]);
        const notified = str_(r.notified).split(',').filter(Boolean);
        update_(ot, r, {
          status: STATUS.VERIFYING,
          notified: notified.indexOf(STATUS.VERIFYING) >= 0 ? notified.join(',') : notified.concat(STATUS.VERIFYING).join(','),
        });
        return;
      }
      if (ev.message.type !== 'text') return;
      const text = ev.message.text.trim();
      const m = /(?:ยืนยันออเดอร์|Confirm order)\s+(ORD-\d{8}-\d{3})/i.exec(text);
      if (m && src.userId) {
        sendReceipt_(m[1], src.userId, ev.replyToken);
      } else if (/^(แต้ม|สะสมแต้ม)$/.test(text) && src.userId) {
        const s = settings_();
        if (!s.enableStamps) return;
        const c = findCustomer_(src.userId).row;
        reply_(ev.replyToken, [stampMsg_(c ? num_(c.stamps) : 0, c ? num_(c.freeCups) : 0, s.stampGoal, 'th')]);
      } else if (/^(myid|ไอดี)$/i.test(text)) {
        // Helper for setup: tells the owner what to put in Settings → adminTo
        reply_(ev.replyToken, [{ type: 'text', text: src.type + ' id:\n' + (src.groupId || src.roomId || src.userId) }]);
      }
    } catch (e) {
      console.error(e && e.stack || e);
    }
  });
}

/** Sends the Flex receipt + stamp card. replyToken = null → push (skipped if a receipt was already sent). */
function sendReceipt_(orderNo, userId, replyToken) {
  const s = settings_();
  const ot = table_(SHEETS.orders);
  const r = ot.rows.find(x => str_(x.orderNo) === orderNo && str_(x.userId) === userId);
  if (!r) return false;
  if (!replyToken && str_(r.receipt)) return true;
  const lang = str_(r.lang) === 'en' ? 'en' : 'th';
  const msgs = [receiptFlex_(publicOrder_(r, s, lang), s)];
  if (s.enableStamps) {
    const c = findCustomer_(userId).row;
    msgs.push(stampMsg_(c ? num_(c.stamps) : 0, c ? num_(c.freeCups) : 0, s.stampGoal, lang));
  }
  if (replyToken) reply_(replyToken, msgs); else push_(userId, msgs);
  update_(ot, r, { receipt: replyToken ? 'reply' : 'push' });
  return true;
}

function stampMsg_(stamps, freeCups, goal, lang) {
  const dots = '●'.repeat(Math.min(stamps, goal)) + '○'.repeat(Math.max(0, goal - stamps));
  const text = lang === 'en'
    ? 'Stamp card ' + stamps + '/' + goal + '\n' + dots + '\n' +
      (freeCups ? '🎁 ' + freeCups + ' free drink(s) to use on your next order' : 'Collect ' + goal + ' to get 1 free drink')
    : 'บัตรสะสมแต้ม ' + stamps + '/' + goal + ' แก้ว\n' + dots + '\n' +
      (freeCups ? '🎁 มีสิทธิ์แก้วฟรี ' + freeCups + ' แก้ว ใช้ได้ตอนสั่งครั้งถัดไป' : 'ครบ ' + goal + ' แก้ว รับฟรี 1 แก้ว');
  return { type: 'text', text };
}

const RECEIPT_TEXT_ = {
  th: {
    order: 'ใบสั่งซื้อ', when: 'รอบ', where: 'สถานที่', subtotal: 'ยอดรวม', discount: 'ส่วนลด', fee: 'ค่าส่ง', total: 'ยอดชำระ',
    baht: ' บาท', transfer: n => 'โอนยอด ' + n + ' บาท แล้วส่งสลิปในแชทนี้ได้เลย', account: 'เลขบัญชี', name: 'ชื่อบัญชี', none: 'ไม่มียอดที่ต้องชำระ',
    cash: 'ชำระเงินสดตอนรับเครื่องดื่ม', later: 'ร้านจะส่งช่องทางชำระเงินให้ในแชทนี้', alt: 'ออเดอร์ ',
  },
  en: {
    order: 'Order', when: 'Time', where: 'Deliver to', subtotal: 'Subtotal', discount: 'Discount', fee: 'Delivery', total: 'Total',
    baht: ' THB', transfer: n => 'Transfer ' + n + ' THB, then send the slip in this chat.', account: 'Account', name: 'Account name', none: 'Nothing to pay',
    cash: 'Pay cash when you receive your drinks', later: 'We will send payment details in this chat', alt: 'Order ',
  },
};

function receiptFlex_(po, s) {
  const L = RECEIPT_TEXT_[po.lang === 'en' ? 'en' : 'th'];
  const C = { ink: '#2A1E17', muted: '#7A6A5E', roast: '#4A2E21', pandan: '#3F7A4E', line: '#E6DDD2' };
  const baht = n => n.toLocaleString('en-US') + L.baht;
  const sep = { type: 'separator', margin: 'md', color: C.line };
  const kv = (k, v, style) => ({
    type: 'box', layout: 'horizontal', spacing: 'md', margin: 'sm', contents: [
      { type: 'text', text: k, size: 'sm', color: C.muted, flex: 0 },
      Object.assign({ type: 'text', text: v, size: 'sm', color: C.ink, align: 'end', wrap: true }, style || {}),
    ],
  });
  const items = po.items.map(l => ({
    type: 'box', layout: 'horizontal', spacing: 'md', margin: 'md', contents: [
      {
        type: 'box', layout: 'vertical', flex: 1, contents: [
          { type: 'text', text: l.qty + '× ' + l.name, size: 'sm', color: C.ink, wrap: true },
        ].concat(l.opts ? [{ type: 'text', text: l.opts, size: 'xs', color: C.muted, wrap: true }] : []),
      },
      { type: 'text', text: String(l.total), size: 'sm', color: C.ink, align: 'end', flex: 0 },
    ],
  }));
  const body = [kv(L.when, po.when), kv(L.where, po.where), sep].concat(items, [sep, kv(L.subtotal, baht(po.subtotal))]);
  if (po.discount) body.push(kv(L.discount, '−' + baht(po.discount), { color: C.pandan }));
  if (po.deliveryFee) body.push(kv(L.fee, baht(po.deliveryFee)));
  body.push(kv(L.total, baht(po.total), { weight: 'bold', size: 'lg', color: C.roast }));

  const note = (text) => ({ type: 'text', text, size: 'xs', color: C.muted, wrap: true, align: 'center' });
  const bankText = [s.bankName, s.bankAccountName ? L.name + ': ' + s.bankAccountName : '',
    s.bankAccountNo ? L.account + ': ' + s.bankAccountNo : '', L.transfer(po.total)].filter(Boolean).join('\n');
  const footer = po.pay !== 'cash' && po.total > 0 && (s.bankAccountNo || s.bankQrUrl)
    ? (s.bankQrUrl ? [{ type: 'image', url: s.bankQrUrl, size: 'lg', aspectRatio: '1:1' }] : []).concat(note(bankText))
    : [note(po.total <= 0 ? L.none : po.pay === 'cash' ? L.cash : L.later)];

  return {
    type: 'flex',
    altText: L.alt + po.no + ' · ' + po.total + L.baht,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: C.roast, paddingAll: '16px', contents: [
          { type: 'text', text: (s.shopName ? s.shopName + ' · ' : '') + L.order, size: 'xs', color: '#E9C9A8' },
          { type: 'text', text: po.no, size: 'lg', weight: 'bold', color: '#FFFFFF' },
        ],
      },
      body: { type: 'box', layout: 'vertical', contents: body },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footer },
    },
  };
}
