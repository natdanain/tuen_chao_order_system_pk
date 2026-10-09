/** Run setup() once from the Apps Script editor. Safe to re-run: it only adds what is missing. */

const HEADERS = {
  Menu: ['id', 'category', 'name', 'price', 'bestRank', 'colors', 'imageUrl', 'active', 'sweetOff', 'nameEn', 'categoryEn'],
  Settings: ['key', 'value', 'note'],
  Codes: ['code', 'amount', 'label', 'newCustomerOnly', 'maxUses', 'used', 'active',
    'labelEn', 'minCups', 'startDate', 'endDate', 'perCustomer', 'banner'],
  Customers: ['userId', 'displayName', 'phone', 'orders', 'stamps', 'freeCups', 'lastMode', 'lastLoc', 'lastDrop', 'lastLocNote', 'firstOrderAt', 'lastOrderAt'],
  Orders: ['orderNo', 'createdAt', 'status', 'paid', 'date', 'slot', 'mode', 'location', 'drop', 'locNote', 'displayName', 'phone',
    'itemsText', 'cups', 'subtotal', 'discount', 'deliveryFee', 'total', 'pay', 'code', 'usedFreeCup', 'note',
    'stampsEarned', 'items', 'userId', 'receipt', 'notified', 'lang'],
};

const DEFAULT_SETTINGS = [
  ['shopName', 'ตื่นเช้า', 'ชื่อร้าน'],
  ['shopSub', 'TUEN_CHAO · Home Cafe', 'คำโปรยใต้ชื่อร้าน'],
  ['acceptingOrders', 'TRUE', 'TRUE = เปิดรับออเดอร์ / FALSE = ปิดชั่วคราว'],
  ['closedMessage', 'ตอนนี้ร้านปิดรับออเดอร์ชั่วคราว แล้วพบกันใหม่นะคะ', 'ข้อความตอนปิดรับ'],
  ['asapToday', 'FALSE', 'TRUE = สั่งวันนี้ไม่ต้องเลือกเวลา ส่งทันทีที่พร้อม / FALSE = วันนี้ก็เลือกรอบส่งจาก slots'],
  ['openTime', '', 'เวลาร้านเริ่มรับออเดอร์ของวันนี้ เช่น 07:00 (เว้นว่าง = รับตลอด)'],
  ['todayLastOrder', '14:00', 'สั่งของวันนี้ได้ถึงกี่โมง (เว้นว่าง = ไม่จำกัด)'],
  ['closedDates', '', 'วันหยุดพิเศษ รูปแบบ 2026-10-13 คั่นด้วย , (ปิดทั้งวัน ไม่ให้เลือกวันนั้น)'],
  ['slots', '06:30,07:30,08:30,09:30', 'รอบส่ง คั่นด้วย ,'],
  ['preorderOnlySlots', '06:30', 'รอบที่ต้องสั่งล่วงหน้าเท่านั้น (วันนี้เลือกไม่ได้) คั่นด้วย ,'],
  ['cutoffMinutes', '30', 'ต้องสั่งก่อนถึงรอบกี่นาที (30 = สั่งก่อน 7:00 ส่ง 7:30)'],
  ['daysAhead', '2', 'ให้สั่งล่วงหน้ากี่วัน (นับวันนี้ด้วย)'],
  ['closedWeekdays', '', 'วันหยุดประจำ 0=อา 1=จ … 6=ส คั่นด้วย , (เว้นว่าง = ไม่มี)'],
  ['maxCupsPerSlot', '0', 'รับได้สูงสุดกี่แก้วต่อรอบ (0 = ไม่จำกัด)'],
  ['allowPickup', 'FALSE', 'ให้ลูกค้าเลือกรับเองที่ร้านได้'],
  ['locations', 'คอนโด ศุภาลัย ซิตี้รีสอร์ท แจ้งวัฒนะ', 'สถานที่ส่ง คั่นด้วย | (มีที่เดียว = ไม่ต้องให้ลูกค้าเลือก)'],
  ['dropOptions', 'ส่งที่ห้อง|ล็อคเกอร์ส่งอาหาร', 'วิธีส่ง คั่นด้วย | (ตัวแรก = ค่าเริ่มต้น)'],
  ['roomRequiredFor', 'ส่งที่ห้อง', 'วิธีส่งที่ต้องกรอกชั้นและเลขห้อง คั่นด้วย | (วิธีอื่นช่องนี้จะกดไม่ได้)'],
  ['enableCodes', 'TRUE', 'แสดงช่องโค้ดส่วนลด (โค้ดอยู่ในชีต Codes)'],
  ['enableStamps', 'FALSE', 'เปิดบัตรสะสมแต้ม (ปิด = ไม่แสดงและไม่สะสม)'],
  ['deliveryFee', '0', 'ค่าส่ง (บาท)'],
  ['sweetness', '100%|75%|50%|0%', 'ระดับความหวาน คั่นด้วย |'],
  ['sweetRecommended', '75%', 'ระดับความหวานที่ขึ้นป้าย "แนะนำ" และเลือกไว้ให้ก่อน'],
  ['extras', 'แยกน้ำแข็ง=5|เพิ่มช็อต=15|เปลี่ยนเป็นนมโอ๊ต=15', 'ตัวเลือกเพิ่ม ชื่อ=ราคา คั่นด้วย |'],
  ['extrasOff', 'เพิ่มช็อต|เปลี่ยนเป็นนมโอ๊ต', 'ตัวเลือกเพิ่มที่ขึ้นสีเทา "ไม่พร้อมให้บริการ" คั่นด้วย |'],
  ['promptpay', '', 'เบอร์พร้อมเพย์หรือเลขบัตรประชาชน (ใช้สร้าง QR)'],
  ['firstOrderPromptPayOnly', 'TRUE', 'ออเดอร์แรกต้องโอนพร้อมเพย์'],
  ['stampGoal', '10', 'สะสมครบกี่แก้วได้ฟรี 1 แก้ว'],
  ['receiptMode', 'push', 'push = ร้านส่งใบเสร็จเอง (ใช้โควตาข้อความ) / reply = ตอบกลับฟรี (ต้องตั้ง webhook)'],
  ['adminTo', '', 'userId หรือ groupId ที่รับแจ้งเตือนออเดอร์ใหม่ (เว้นว่าง = ไม่แจ้ง)'],
  ['notifyCustomerOnStatus', 'TRUE', 'แจ้งลูกค้าเมื่อเปลี่ยนสถานะเป็น พร้อมส่ง / ยกเลิก'],
  // English display text — lists must be in the same order as the Thai ones
  ['shopSubEn', 'TUEN_CHAO · Home Cafe', 'คำโปรยภาษาอังกฤษ'],
  ['closedMessageEn', 'We are not taking orders right now. See you soon!', 'ข้อความตอนปิดรับ (อังกฤษ)'],
  ['locationsEn', 'Supalai City Resort Chaengwattana', 'สถานที่ส่ง (อังกฤษ) เรียงตาม locations'],
  ['dropOptionsEn', 'To my room|Food locker', 'วิธีส่ง (อังกฤษ) เรียงตาม dropOptions'],
  ['extrasEn', 'Ice on the side|Extra shot|Oat milk', 'ชื่อตัวเลือกเพิ่ม (อังกฤษ) เรียงตาม extras'],
];

const SEED = {
  Menu: [
    ['amr', 'กาแฟ', 'อเมริกาโน่', 65, '', '#2B1A10:62|#d8ecf4:12', 'https://natdanain.github.io/tuen_chao_order_system_pk/menu/americano.jpg', true, '', 'Americano', 'Coffee'],
    ['lat', 'กาแฟ', 'ลาเต้', 75, 3, '#EADBC8:42|#8A5A3B:26', 'https://natdanain.github.io/tuen_chao_order_system_pk/menu/latte.jpg', true, '', 'Latte', 'Coffee'],
    ['orn', 'กาแฟ', 'อเมริกาโน่ส้ม', 80, 2, '#E58A2C:40|#3A2416:26', 'https://natdanain.github.io/tuen_chao_order_system_pk/menu/orange-americano.jpg', true, '0%', 'Orange Americano', 'Coffee'],
    ['pmt', 'มัทฉะ', 'เคลียร์มัทฉะ', 90, '', '#4F7F2A:62', 'https://natdanain.github.io/tuen_chao_order_system_pk/menu/clear-matcha.jpg', true, '', 'Clear Matcha', 'Matcha'],
    ['mat', 'มัทฉะ', 'มัทฉะลาเต้', 90, 4, '#F2EFE6:30|#6E9A47:36', 'https://natdanain.github.io/tuen_chao_order_system_pk/menu/matcha-latte.jpg', true, '', 'Matcha Latte', 'Matcha'],
    ['mcw', 'มัทฉะ', 'มัทฉะน้ำมะพร้าว', 90, '', '#EEF3E8:38|#5E8F33:28', 'https://natdanain.github.io/tuen_chao_order_system_pk/menu/matcha-coconut.jpg', true, '', 'Matcha Coconut Water', 'Matcha'],
    ['tht', 'ชา', 'ชาไทย', 59, '', '#E07A33:66', 'https://natdanain.github.io/tuen_chao_order_system_pk/menu/thai-tea.jpg', true, '0%', 'Thai Tea', 'Tea'],
    ['blt', 'ชา', 'ชาดำเย็น (ชาใส)', 59, '', '#7A2E0E:60|#d8ecf4:8', 'https://natdanain.github.io/tuen_chao_order_system_pk/menu/black-tea.jpg', true, '', 'Iced Black Tea (no milk)', 'Tea'],
    ['grt', 'ชา', 'ชาเขียว', 59, '', '#A3C56E:66', 'https://natdanain.github.io/tuen_chao_order_system_pk/menu/green-tea.jpg', true, '0%', 'Green Tea', 'Tea'],
    ['coa', 'อื่น ๆ', 'โกโก้', 65, 1, '#5C3A2A:66', 'https://natdanain.github.io/tuen_chao_order_system_pk/menu/cocoa.jpg', true, '0%', 'Cocoa', 'Others'],
    ['pnk', 'อื่น ๆ', 'นมชมพู (นมเย็น)', 59, '', '#F4A9BE:66', 'https://natdanain.github.io/tuen_chao_order_system_pk/menu/pink-milk.jpg', true, '0%', 'Pink Milk (iced milk)', 'Others'],
  ],
  // code, amount, label, newCustomerOnly, maxUses, used, active, labelEn, minCups, startDate, endDate, perCustomer, banner
  Codes: [
    ['OPEN10', 10, 'โปรเปิดร้าน ซื้อ 2 แก้ว ลด 10 บาท', false, '', 0, true,
      'Opening promo: buy 2 drinks, get 10 THB off', 2, '', '', 'day', true],
    ['NEW10', 10, 'ลูกค้าใหม่ ลด 10 บาท', true, '', 0, false, 'New customer: 10 THB off', 1, '', '', 'once', false],
  ],
};

function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(HEADERS).forEach(name => {
    let sh = ss.getSheetByName(name);
    const isNew = !sh;
    if (!sh) sh = ss.insertSheet(name);
    ensureHeaders_(sh, HEADERS[name]);
    if (isNew && SEED[name]) sh.getRange(2, 1, SEED[name].length, SEED[name][0].length).setValues(SEED[name]);
  });

  // Settings: plain-text values, add any keys missing from an older sheet
  const st = ss.getSheetByName(SHEETS.settings);
  st.getRange('B:B').setNumberFormat('@');
  const have = table_(SHEETS.settings).rows.map(r => str_(r.key));
  const missing = DEFAULT_SETTINGS.filter(([k]) => have.indexOf(k) < 0);
  if (missing.length) st.getRange(st.getLastRow() + 1, 1, missing.length, 3).setValues(missing);

  checkboxes_(SHEETS.menu, ['active']);
  checkboxes_(SHEETS.codes, ['newCustomerOnly', 'active', 'banner']);
  addMissingCodes_();
  checkboxes_(SHEETS.orders, ['paid']);
  const ot = ss.getSheetByName(SHEETS.orders);
  ot.getRange(2, HEADERS.Orders.indexOf('status') + 1, ot.getMaxRows() - 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(STATUS).map(k => STATUS[k]), true).build());
  ot.getRange(2, HEADERS.Orders.indexOf('createdAt') + 1, ot.getMaxRows() - 1).setNumberFormat('dd/MM HH:mm');

  // Remove the empty default sheet
  ['Sheet1', 'ชีต1', 'แผ่นงาน1'].forEach(n => {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  installTrigger_();
  console.log('setup เสร็จแล้ว ✓ ต่อไป: ใส่ Script properties แล้ว Deploy เป็น Web app');
}

/** Run from the editor to replace every row in the Menu sheet with the menu in SEED above. */
function replaceMenu() {
  const t = table_(SHEETS.menu);
  if (t.rows.length) t.sh.getRange(2, 1, t.rows.length, t.sh.getLastColumn()).clearContent();
  const rows = SEED.Menu.map(r => t.head.map(h => {
    const i = HEADERS.Menu.indexOf(h);
    return i < 0 ? '' : r[i];
  }));
  t.sh.getRange(2, 1, rows.length, t.head.length).setValues(rows);
  console.log('อัปเดตเมนู ' + rows.length + ' รายการแล้ว ✓');
}

/** Adds the opening-promo code to an existing Codes sheet (other rows are left alone). */
function addMissingCodes_() {
  const t = table_(SHEETS.codes);
  const have = t.rows.map(r => str_(r.code).toUpperCase());
  SEED.Codes.filter(r => r[0] === 'OPEN10' && have.indexOf('OPEN10') < 0).forEach(r => {
    append_(t, HEADERS.Codes.reduce((o, h, i) => { o[h] = r[i]; return o; }, {}));
  });
}

function ensureHeaders_(sh, headers) {
  const lastCol = sh.getLastColumn();
  const cur = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  const add = headers.filter(h => cur.indexOf(h) < 0);
  if (add.length) sh.getRange(1, cur.filter(String).length + 1, 1, add.length).setValues([add]);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#F6F2EC');
}

function checkboxes_(name, cols) {
  const t = table_(name);
  cols.forEach(h => {
    const c = t.head.indexOf(h) + 1;
    if (c) t.sh.getRange(2, c, t.sh.getMaxRows() - 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  });
}

function installTrigger_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onOrderEdit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onOrderEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
}

/** Run from the editor to check the LINE token, and send a test message to adminTo. */
function testLine() {
  prop_('LINE_LOGIN_CHANNEL_ID');
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', {
    headers: { Authorization: 'Bearer ' + prop_('LINE_CHANNEL_ACCESS_TOKEN') }, muteHttpExceptions: true,
  });
  console.log('bot info', res.getResponseCode(), res.getContentText());
  const s = settings_();
  if (s.adminTo) {
    push_(s.adminTo, [{ type: 'text', text: 'ทดสอบจากระบบสั่งกาแฟ ✓' }]);
    console.log('ส่งข้อความทดสอบไปที่ adminTo แล้ว');
  }
}
