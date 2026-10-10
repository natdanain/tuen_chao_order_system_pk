/** Admin API for the kitchen/owner LIFF page. Every action verifies the LINE ID token and role. */

const ADMIN_ROLES = { OWNER: 'OWNER', KITCHEN: 'KITCHEN' };
const ADMIN_SETTINGS = [
  'acceptingOrders', 'closedMessage', 'slots', 'preorderOnlySlots', 'cutoffMinutes',
  'closedDates', 'maxCupsPerSlot', 'allowPickup', 'bankName', 'bankAccountName',
  'bankAccountNo', 'bankQrUrl', 'enableCodes', 'enableStamps',
];

function requireAdmin_(body, allowedRoles) {
  const user = auth_(body.idToken);
  const ownerId = adminOwnerId_();
  let role = '';
  if (isAdminOwner_(user.userId)) {
    role = ADMIN_ROLES.OWNER;
  } else {
    const row = table_(SHEETS.admins).rows.find(r =>
      str_(r.userId) === user.userId && bool_(r.active));
    role = row ? str_(row.role).toUpperCase() : '';
  }
  if (!ownerId) fail_('ยังไม่ได้ตั้งค่า ADMIN_OWNER_USER_ID ใน Script properties');
  if (!role || allowedRoles.indexOf(role) < 0) fail_('ไม่มีสิทธิ์ใช้งานหน้าจอแอดมิน');
  return { userId: user.userId, displayName: user.name || '', role };
}

function owner_(body) { return requireAdmin_(body, [ADMIN_ROLES.OWNER]); }
function staff_(body) { return requireAdmin_(body, [ADMIN_ROLES.OWNER, ADMIN_ROLES.KITCHEN]); }

function adminInit_(body) {
  const admin = staff_(body);
  touchAdmin_(admin);
  return adminState_(admin, str_(body.date) || today_());
}

function adminState_(admin, date) {
  const s = settings_();
  const orders = adminOrdersFor_(date, '');
  return {
    admin,
    serverTime: fmt_(new Date(), "yyyy-MM-dd'T'HH:mm:ss"),
    dashboard: dashboard_(orders, s),
    orders,
    menu: adminMenu_(),
    settings: adminSettingsView_(),
    statuses: Object.keys(STATUS).map(k => STATUS[k]),
  };
}

function adminListOrders_(body) {
  const admin = staff_(body);
  const date = str_(body.date) || today_();
  return { admin, date, orders: adminOrdersFor_(date, str_(body.status)) };
}

function adminOrdersFor_(date, status) {
  return table_(SHEETS.orders).rows
    .filter(r => (!date || str_(r.date) === date) && (!status || str_(r.status) === status))
    .sort((a, b) => orderTime_(b) - orderTime_(a))
    .slice(0, 200)
    .map(adminOrderView_);
}

function orderTime_(r) {
  return r.createdAt instanceof Date ? r.createdAt.getTime() : 0;
}

function adminOrderView_(r) {
  let items = [];
  try { items = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []); } catch (_) {}
  return {
    orderNo: str_(r.orderNo),
    createdAt: r.createdAt instanceof Date ? fmt_(r.createdAt, "yyyy-MM-dd'T'HH:mm:ss") : str_(r.createdAt),
    status: str_(r.status), paid: bool_(r.paid), date: str_(r.date), slot: str_(r.slot),
    mode: str_(r.mode), location: str_(r.location), drop: str_(r.drop), locNote: str_(r.locNote),
    displayName: str_(r.displayName), phone: str_(r.phone), cups: num_(r.cups),
    subtotal: num_(r.subtotal), discount: num_(r.discount), deliveryFee: num_(r.deliveryFee),
    total: num_(r.total), pay: str_(r.pay), code: str_(r.code), note: str_(r.note),
    items: items.map(x => ({
      name: str_(x.name), qty: num_(x.qty), sweet: str_(x.sweet), note: str_(x.note),
      extras: (x.extras || []).map(e => Array.isArray(e) ? str_(e[0]) : str_(e)), total: num_(x.total),
    })),
  };
}

function dashboard_(orders, s) {
  const count = status => orders.filter(o => o.status === status).length;
  return {
    acceptingOrders: s.acceptingOrders,
    total: orders.filter(o => o.status !== STATUS.CANCEL).length,
    newOrders: count(STATUS.NEW), verifying: count(STATUS.VERIFYING), making: count(STATUS.MAKING),
    ready: count(STATUS.READY), delivering: count(STATUS.DELIVERING),
    unpaid: orders.filter(o => o.pay !== 'cash' && !o.paid && o.status !== STATUS.CANCEL).length,
  };
}

function adminMenu_() {
  return table_(SHEETS.menu).rows.filter(r => str_(r.id)).map(r => ({
    id: str_(r.id), category: str_(r.category), categoryEn: str_(r.categoryEn),
    name: str_(r.name), nameEn: str_(r.nameEn), price: num_(r.price),
    bestRank: str_(r.bestRank), imageUrl: str_(r.imageUrl), active: on_(r.active),
    sweetOff: str_(r.sweetOff), colors: str_(r.colors),
  }));
}

function adminUpdateOrderStatus_(body) {
  const admin = staff_(body);
  const orderNo = str_(body.orderNo);
  const next = str_(body.status);
  if (Object.keys(STATUS).map(k => STATUS[k]).indexOf(next) < 0) fail_('สถานะไม่ถูกต้อง');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let result, warning = '';
  try {
    const t = table_(SHEETS.orders);
    const row = t.rows.find(r => str_(r.orderNo) === orderNo);
    if (!row) fail_('ไม่พบออเดอร์ ' + orderNo);
    const before = { status: str_(row.status), paid: bool_(row.paid) };
    if (before.status === STATUS.CANCEL && next !== STATUS.CANCEL) fail_('ออเดอร์ที่ยกเลิกแล้วไม่สามารถเปลี่ยนสถานะได้');
    if (before.status !== next) {
      update_(t, row, { status: next });
      try { handleStatus_(t, row, settings_()); } catch (e) { warning = 'เปลี่ยนสถานะแล้ว แต่ส่ง LINE ไม่สำเร็จ'; console.error(e); }
      audit_(admin, 'ORDER_STATUS_CHANGED', 'order', orderNo, before, { status: next, paid: bool_(row.paid) });
    }
    result = adminOrderView_(row);
  } finally { lock.releaseLock(); }
  return { order: result, warning };
}

function adminSetPaid_(body) {
  const admin = staff_(body);
  const orderNo = str_(body.orderNo);
  const paid = body.paid === true;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let result, warning = '';
  try {
    const t = table_(SHEETS.orders);
    const row = t.rows.find(r => str_(r.orderNo) === orderNo);
    if (!row) fail_('ไม่พบออเดอร์ ' + orderNo);
    if (str_(row.status) === STATUS.CANCEL) fail_('ออเดอร์นี้ถูกยกเลิกแล้ว');
    const before = { status: str_(row.status), paid: bool_(row.paid) };
    const patch = { paid };
    if (paid && str_(row.pay) !== 'cash' &&
        (before.status === STATUS.NEW || before.status === STATUS.VERIFYING)) patch.status = STATUS.MAKING;
    update_(t, row, patch);
    if (patch.status) {
      try { handleStatus_(t, row, settings_()); } catch (e) { warning = 'ยืนยันยอดแล้ว แต่ส่ง LINE ไม่สำเร็จ'; console.error(e); }
    }
    audit_(admin, 'ORDER_PAID_CHANGED', 'order', orderNo, before,
      { status: str_(row.status), paid: bool_(row.paid) });
    result = adminOrderView_(row);
  } finally { lock.releaseLock(); }
  return { order: result, warning };
}

function adminToggleMenu_(body) {
  const admin = staff_(body);
  const id = str_(body.menuId);
  const active = body.active === true;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let result;
  try {
    const t = table_(SHEETS.menu);
    const row = t.rows.find(r => str_(r.id) === id);
    if (!row) fail_('ไม่พบเมนู ' + id);
    const before = { active: on_(row.active) };
    update_(t, row, { active });
    audit_(admin, 'MENU_AVAILABILITY_CHANGED', 'menu', id, before, { active });
    result = adminMenu_().find(m => m.id === id);
  } finally { lock.releaseLock(); }
  return { menu: result };
}

function adminUpdateMenu_(body) {
  const admin = owner_(body);
  const id = str_(body.menuId);
  const input = body.menu || {};
  const allowed = ['category', 'categoryEn', 'name', 'nameEn', 'price', 'bestRank', 'imageUrl', 'active', 'sweetOff', 'colors'];
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let result;
  try {
    const t = table_(SHEETS.menu);
    const row = t.rows.find(r => str_(r.id) === id);
    if (!row) fail_('ไม่พบเมนู ' + id);
    const patch = {};
    allowed.forEach(k => { if (Object.prototype.hasOwnProperty.call(input, k)) patch[k] = input[k]; });
    if ('name' in patch && !str_(patch.name)) fail_('ชื่อเมนูห้ามว่าง');
    if ('price' in patch) {
      const price = Number(patch.price);
      if (!isFinite(price) || price < 0) fail_('ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
      patch.price = price;
    }
    if ('bestRank' in patch && str_(patch.bestRank)) {
      const rank = Number(patch.bestRank);
      if (!Number.isInteger(rank) || rank < 1) fail_('ลำดับขายดีต้องเป็นจำนวนเต็มบวก');
      patch.bestRank = rank;
    }
    if ('imageUrl' in patch && str_(patch.imageUrl) && !/^https:\/\//i.test(str_(patch.imageUrl))) fail_('ลิงก์รูปต้องขึ้นต้นด้วย https://');
    if ('active' in patch) patch.active = patch.active === true;
    const before = adminMenu_().find(m => m.id === id);
    update_(t, row, patch);
    result = adminMenu_().find(m => m.id === id);
    audit_(admin, 'MENU_UPDATED', 'menu', id, before, result);
  } finally { lock.releaseLock(); }
  return { menu: result };
}

function adminSettingsView_() {
  const out = {};
  table_(SHEETS.settings).rows.forEach(r => {
    const key = str_(r.key);
    if (ADMIN_SETTINGS.indexOf(key) >= 0) out[key] = r.value;
  });
  return out;
}

function adminUpdateSettings_(body) {
  const admin = owner_(body);
  const input = body.settings || {};
  const keys = Object.keys(input).filter(k => ADMIN_SETTINGS.indexOf(k) >= 0);
  if (!keys.length) fail_('ไม่มีการตั้งค่าที่รองรับ');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let after;
  try {
    const t = table_(SHEETS.settings);
    const before = adminSettingsView_();
    keys.forEach(key => {
      const row = t.rows.find(r => str_(r.key) === key);
      if (!row) fail_('ไม่พบการตั้งค่า ' + key);
      let value = input[key];
      if (['acceptingOrders', 'allowPickup', 'enableCodes', 'enableStamps'].indexOf(key) >= 0) value = value === true ? 'TRUE' : 'FALSE';
      if (['cutoffMinutes', 'maxCupsPerSlot'].indexOf(key) >= 0) {
        value = Number(value);
        if (!isFinite(value) || value < 0) fail_(key + ' ต้องเป็นเลขตั้งแต่ 0 ขึ้นไป');
      }
      if (key === 'bankQrUrl' && str_(value) && !/^https:\/\//i.test(str_(value))) fail_('ลิงก์ QR ต้องขึ้นต้นด้วย https://');
      update_(t, row, { value });
    });
    after = adminSettingsView_();
    audit_(admin, 'SETTINGS_UPDATED', 'settings', keys.join(','), pick_(before, keys), pick_(after, keys));
  } finally { lock.releaseLock(); }
  return { settings: after, dashboard: dashboard_(adminOrdersFor_(today_(), ''), settings_()) };
}

function adminListStaff_(body) {
  const admin = owner_(body);
  return { admin, staff: adminStaffView_() };
}

function adminStaffView_() {
  const ownerId = adminOwnerId_();
  const rows = table_(SHEETS.admins).rows.filter(r => str_(r.userId)).map(r => ({
    userId: str_(r.userId), displayName: str_(r.displayName), role: str_(r.role), active: bool_(r.active),
    createdAt: str_(r.createdAt), createdBy: str_(r.createdBy), lastLoginAt: str_(r.lastLoginAt), systemOwner: false,
  }));
  if (ownerId) rows.unshift({ userId: ownerId, displayName: 'เจ้าของร้านหลัก', role: ADMIN_ROLES.OWNER, active: true, systemOwner: true });
  return rows;
}

function adminSaveStaff_(body) {
  const admin = owner_(body);
  const input = body.staff || {};
  const userId = str_(input.userId);
  const role = str_(input.role).toUpperCase();
  if (!/^U[0-9a-z_-]{10,}$/i.test(userId)) fail_('LINE user ID ไม่ถูกต้อง');
  if ([ADMIN_ROLES.OWNER, ADMIN_ROLES.KITCHEN].indexOf(role) < 0) fail_('บทบาทไม่ถูกต้อง');
  if (isAdminOwner_(userId)) fail_('บัญชีเจ้าของร้านหลักจัดการจากหน้านี้ไม่ได้');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const t = table_(SHEETS.admins);
    const row = t.rows.find(r => str_(r.userId) === userId);
    const before = row ? { displayName: str_(row.displayName), role: str_(row.role), active: bool_(row.active) } : null;
    const patch = { displayName: str_(input.displayName), role, active: input.active !== false };
    if (row) update_(t, row, patch);
    else append_(t, Object.assign({ userId, createdAt: new Date(), createdBy: admin.userId, lastLoginAt: '' }, patch));
    audit_(admin, row ? 'ADMIN_UPDATED' : 'ADMIN_CREATED', 'admin', userId, before, patch);
  } finally { lock.releaseLock(); }
  return { staff: adminStaffView_() };
}

function adminSetStaffActive_(body) {
  const admin = owner_(body);
  const userId = str_(body.userId);
  if (isAdminOwner_(userId)) fail_('ไม่สามารถปิดบัญชีเจ้าของร้านหลักได้');
  const t = table_(SHEETS.admins);
  const row = t.rows.find(r => str_(r.userId) === userId);
  if (!row) fail_('ไม่พบพนักงาน');
  const before = { active: bool_(row.active) };
  const after = { active: body.active === true };
  update_(t, row, after);
  audit_(admin, 'ADMIN_ACTIVE_CHANGED', 'admin', userId, before, after);
  return { staff: adminStaffView_() };
}

function adminListAuditLog_(body) {
  owner_(body);
  const rows = table_(SHEETS.audit).rows.slice().reverse().slice(0, 100).map(r => ({
    timestamp: str_(r.timestamp), displayName: str_(r.displayName), role: str_(r.role), action: str_(r.action),
    targetType: str_(r.targetType), targetId: str_(r.targetId), before: str_(r.before), after: str_(r.after),
  }));
  return { audit: rows };
}

function touchAdmin_(admin) {
  if (admin.role === ADMIN_ROLES.OWNER && isAdminOwner_(admin.userId)) return;
  const t = table_(SHEETS.admins);
  const row = t.rows.find(r => str_(r.userId) === admin.userId);
  if (row) update_(t, row, { displayName: admin.displayName || str_(row.displayName), lastLoginAt: new Date() });
}

function adminOwnerId_() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_OWNER_USER_ID') || '';
}

function isAdminOwner_(userId) {
  const id = str_(userId);
  return !!id && id === adminOwnerId_();
}

function audit_(admin, action, targetType, targetId, before, after) {
  append_(table_(SHEETS.audit), {
    timestamp: new Date(), userId: admin.userId, displayName: admin.displayName, role: admin.role,
    action, targetType, targetId, before: JSON.stringify(before == null ? null : before), after: JSON.stringify(after == null ? null : after),
  });
}

function pick_(obj, keys) {
  const out = {};
  keys.forEach(k => { out[k] = obj[k]; });
  return out;
}
