/** Run setup() once from the Apps Script editor. Safe to re-run: it only adds what is missing. */

const HEADERS = {
  Menu: ['id', 'category', 'name', 'price', 'bestRank', 'colors', 'imageUrl', 'active', 'sweetOff'],
  Settings: ['key', 'value', 'note'],
  Codes: ['code', 'amount', 'label', 'newCustomerOnly', 'maxUses', 'used', 'active'],
  Customers: ['userId', 'displayName', 'phone', 'orders', 'stamps', 'freeCups', 'lastMode', 'lastLoc', 'lastDrop', 'lastLocNote', 'firstOrderAt', 'lastOrderAt'],
  Orders: ['orderNo', 'createdAt', 'status', 'paid', 'date', 'slot', 'mode', 'location', 'drop', 'locNote', 'displayName', 'phone',
    'itemsText', 'cups', 'subtotal', 'discount', 'deliveryFee', 'total', 'pay', 'code', 'usedFreeCup', 'note',
    'stampsEarned', 'items', 'userId', 'receipt', 'notified'],
};

const DEFAULT_SETTINGS = [
  ['shopName', 'ตื่นเช้า', 'ชื่อร้าน'],
  ['shopSub', 'TUEN_CHAO · Home Cafe', 'คำโปรยใต้ชื่อร้าน'],
  ['acceptingOrders', 'TRUE', 'TRUE = เปิดรับออเดอร์ / FALSE = ปิดชั่วคราว'],
  ['closedMessage', 'ตอนนี้ร้านปิดรับออเดอร์ชั่วคราว แล้วพบกันใหม่นะคะ', 'ข้อความตอนปิดรับ'],
  ['asapToday', 'TRUE', 'TRUE = สั่งวันนี้ไม่ต้องเลือกเวลา ส่งทันทีที่พร้อม (รอบส่งใช้กับวันถัดไป)'],
  ['todayLastOrder', '14:00', 'สั่งของวันนี้ได้ถึงกี่โมง (เว้นว่าง = ไม่จำกัด)'],
  ['slots', '07:30,09:00,10:30,13:00,15:00', 'รอบส่ง คั่นด้วย ,'],
  ['cutoffMinutes', '60', 'ปิดรับก่อนถึงรอบกี่นาที'],
  ['daysAhead', '2', 'ให้สั่งล่วงหน้ากี่วัน (นับวันนี้ด้วย)'],
  ['closedWeekdays', '', 'วันหยุดประจำ 0=อา 1=จ … 6=ส คั่นด้วย , (เว้นว่าง = ไม่มี)'],
  ['maxCupsPerSlot', '0', 'รับได้สูงสุดกี่แก้วต่อรอบ (0 = ไม่จำกัด)'],
  ['allowPickup', 'FALSE', 'ให้ลูกค้าเลือกรับเองที่ร้านได้'],
  ['locations', 'คอนโด ศุภาลัย ซิตี้รีสอร์ท แจ้งวัฒนะ', 'สถานที่ส่ง คั่นด้วย | (มีที่เดียว = ไม่ต้องให้ลูกค้าเลือก)'],
  ['dropOptions', 'ส่งที่ห้อง|ล็อคเกอร์ส่งอาหาร', 'วิธีส่ง คั่นด้วย | (ตัวแรก = ค่าเริ่มต้น)'],
  ['roomRequiredFor', 'ส่งที่ห้อง', 'วิธีส่งที่ต้องกรอกเลขห้อง คั่นด้วย | (วิธีอื่นช่องเลขห้องจะกดไม่ได้)'],
  ['enableCodes', 'FALSE', 'แสดงช่องโค้ดส่วนลด'],
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
];

const SEED = {
  Menu: [
    ['amr', 'กาแฟ', 'อเมริกาโน่ (กาแฟสด)', 65, 1, '#2B1A10:62|#d8ecf4:12', '', true, ''],
    ['lat', 'กาแฟ', 'ลาเต้ (กาแฟสด)', 75, 3, '#EADBC8:42|#8A5A3B:26', '', true, ''],
    ['orn', 'กาแฟ', 'อเมริกาโน่ส้ม (กาแฟสด)', 80, 2, '#E58A2C:40|#3A2416:26', '', true, '0%'],
    ['pmt', 'มัทฉะ', 'เพียวมัทฉะ (เกรดพิธีการ)', 90, '', '#4F7F2A:62', '', true, ''],
    ['mat', 'มัทฉะ', 'มัทฉะลาเต้ (เกรดพรีเมียม)', 90, 4, '#F2EFE6:30|#6E9A47:36', '', true, ''],
    ['mcw', 'มัทฉะ', 'มัทฉะน้ำมะพร้าว (เกรดพรีเมียม)', 90, '', '#EEF3E8:38|#5E8F33:28', '', true, ''],
    ['tht', 'ชา', 'ชาไทย', 59, '', '#E07A33:66', '', true, '0%'],
    ['blt', 'ชา', 'ชาดำเย็น (ชาใส)', 59, '', '#7A2E0E:60|#d8ecf4:8', '', true, ''],
    ['grt', 'ชา', 'ชาเขียว', 59, '', '#A3C56E:66', '', true, '0%'],
    ['coa', 'อื่น ๆ', 'โกโก้', 65, '', '#5C3A2A:66', '', true, '0%'],
    ['pnk', 'อื่น ๆ', 'นมชมพู (นมเย็น)', 59, '', '#F4A9BE:66', '', true, '0%'],
  ],
  Codes: [['NEW10', 10, 'ลูกค้าใหม่ ลด 10 บาท', true, '', 0, true]],
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
  checkboxes_(SHEETS.codes, ['newCustomerOnly', 'active']);
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
