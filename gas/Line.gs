/** LINE Platform: ID-token check, Messaging API, webhook, Flex receipt. */

function prop_(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw new Error('Missing script property ' + k);
  return v;
}

/** Verifies the LIFF ID token with LINE and returns {userId, name}. Cached until the token expires. */
function auth_(idToken) {
  if (!idToken) fail_('กรุณาเปิดหน้านี้จาก LINE');
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
    fail_('เซสชันหมดอายุ ปิดแล้วเปิดหน้านี้ใหม่อีกครั้ง');
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
 * That is acceptable here: every handler only *replies* via the event's replyToken,
 * which LINE rejects unless the event is genuine.
 */
function handleWebhook_(events) {
  events.forEach(ev => {
    try {
      if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
      const text = ev.message.text.trim();
      const src = ev.source || {};
      const m = /ยืนยันออเดอร์\s+(ORD-\d{8}-\d{3})/.exec(text);
      if (m && src.userId) {
        sendReceipt_(m[1], src.userId, ev.replyToken);
      } else if (/^(แต้ม|สะสมแต้ม)$/.test(text) && src.userId) {
        const s = settings_();
        if (!s.enableStamps) return;
        const c = findCustomer_(src.userId).row;
        reply_(ev.replyToken, [stampMsg_(c ? num_(c.stamps) : 0, c ? num_(c.freeCups) : 0, s.stampGoal)]);
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
  const msgs = [receiptFlex_(publicOrder_(r), s)];
  if (s.enableStamps) {
    const c = findCustomer_(userId).row;
    msgs.push(stampMsg_(c ? num_(c.stamps) : 0, c ? num_(c.freeCups) : 0, s.stampGoal));
  }
  if (replyToken) reply_(replyToken, msgs); else push_(userId, msgs);
  update_(ot, r, { receipt: replyToken ? 'reply' : 'push' });
  return true;
}

function stampMsg_(stamps, freeCups, goal) {
  return {
    type: 'text',
    text: 'บัตรสะสมแต้ม ' + stamps + '/' + goal + ' แก้ว\n' +
      '●'.repeat(Math.min(stamps, goal)) + '○'.repeat(Math.max(0, goal - stamps)) + '\n' +
      (freeCups ? '🎁 มีสิทธิ์แก้วฟรี ' + freeCups + ' แก้ว ใช้ได้ตอนสั่งครั้งถัดไป' : 'ครบ ' + goal + ' แก้ว รับฟรี 1 แก้ว'),
  };
}

function receiptFlex_(po, s) {
  const C = { ink: '#2A1E17', muted: '#7A6A5E', roast: '#4A2E21', pandan: '#3F7A4E', line: '#E6DDD2' };
  const baht = n => n.toLocaleString('en-US') + ' บาท';
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
  const body = [kv('รอบ', po.when), kv('สถานที่', po.where), sep].concat(items, [sep, kv('ยอดรวม', baht(po.subtotal))]);
  if (po.discount) body.push(kv('ส่วนลด', '−' + baht(po.discount), { color: C.pandan }));
  if (po.deliveryFee) body.push(kv('ค่าส่ง', baht(po.deliveryFee)));
  body.push(kv('ยอดชำระ', baht(po.total), { weight: 'bold', size: 'lg', color: C.roast }));

  const note = (text) => ({ type: 'text', text, size: 'xs', color: C.muted, wrap: true, align: 'center' });
  const footer = po.pay === 'promptpay' && s.promptpay && po.total > 0
    ? [{ type: 'image', url: 'https://promptpay.io/' + s.promptpay + '/' + po.total + '.png', size: 'lg', aspectRatio: '1:1' },
       note('สแกนจ่ายพร้อมเพย์ ' + po.total + ' บาท แล้วส่งสลิปในแชทนี้ได้เลย')]
    : [note(po.total <= 0 ? 'ไม่มียอดที่ต้องชำระ' : po.pay === 'cash' ? 'ชำระเงินสดตอนรับเครื่องดื่ม' : 'ร้านจะส่งช่องทางชำระเงินให้ในแชทนี้')];

  return {
    type: 'flex',
    altText: 'ออเดอร์ ' + po.no + ' · ' + po.total + ' บาท',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: C.roast, paddingAll: '16px', contents: [
          { type: 'text', text: (s.shopName || 'ใบสั่งซื้อ') + ' · ใบสั่งซื้อ', size: 'xs', color: '#E9C9A8' },
          { type: 'text', text: po.no, size: 'lg', weight: 'bold', color: '#FFFFFF' },
        ],
      },
      body: { type: 'box', layout: 'vertical', contents: body },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footer },
    },
  };
}
