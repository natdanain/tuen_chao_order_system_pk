const CFG = window.ADMIN_CONFIG || {};
const DEMO = new URLSearchParams(location.search).has("demo");
const $ = (q, el=document) => el.querySelector(q);
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const S = { tab:"dashboard", data:null, idToken:"", date:new Date().toISOString().slice(0,10), status:"", busy:false, modal:null, poll:null };
const STATUS = ["ใหม่","รอตรวจสอบ","กำลังทำ","พร้อมส่ง","กำลังส่ง","ส่งแล้ว","ยกเลิก"];

async function api(action, data={}){
  if(DEMO) return window.AdminDemoApi(action,data);
  const res = await fetch(CFG.GAS_URL,{method:"POST",body:JSON.stringify({action,idToken:S.idToken,...data})});
  const body = await res.json().catch(()=>({ok:false,error:"คำตอบจากเซิร์ฟเวอร์ไม่ถูกต้อง"}));
  if(!body.ok) throw new Error(body.error || "เกิดข้อผิดพลาด");
  return body;
}
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("on"); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove("on"),2600); }
function fatal(msg){ $("#app").innerHTML=`<div class="fatal"><h1>เปิดหลังร้านไม่ได้</h1><p>${esc(msg)}</p></div>`; }
function isOwner(){ return S.data?.admin?.role === "OWNER"; }

async function boot(){
  try{
    if(DEMO){ S.idToken="demo"; S.data=await api("adminInit",{date:S.date}); render(); return; }
    if(!CFG.LIFF_ID) throw new Error("ยังไม่ได้ใส่ LIFF ID ของแอดมินใน admin-config.js");
    if(!CFG.GAS_URL) throw new Error("ยังไม่ได้ใส่ Apps Script URL ใน admin-config.js");
    await liff.init({liffId:CFG.LIFF_ID,withLoginOnExternalBrowser:true});
    if(!liff.isLoggedIn()){ liff.login({redirectUri:location.href}); return; }
    S.idToken=liff.getIDToken();
    if(!S.idToken) throw new Error("ไม่พบ LINE ID token กรุณาปิดแล้วเปิดหน้านี้ใหม่");
    S.data=await api("adminInit",{date:S.date});
    render(); startPolling();
  }catch(e){ fatal(e.message || String(e)); }
}

function startPolling(){
  clearInterval(S.poll);
  S.poll=setInterval(()=>{ if(!document.hidden && !S.busy && ["dashboard","orders"].includes(S.tab)) refresh(false); },15000);
}

async function refresh(show=true){
  if(S.busy) return; S.busy=true;
  try{
    if(S.tab==="orders") S.data.orders=(await api("adminListOrders",{date:S.date,status:S.status})).orders;
    else { const r=await api("adminInit",{date:S.date}); S.data={...S.data,...r}; }
    render(); if(show) toast("อัปเดตแล้ว");
  }catch(e){ toast(e.message); }
  finally{ S.busy=false; }
}

function nav(){
  const tabs=[["dashboard","⌂","ภาพรวม"],["orders","▤","ออเดอร์"],["menu","☕","เมนู"]];
  if(isOwner()) tabs.push(["settings","⚙","ตั้งค่า"],["staff","♟","พนักงาน"]);
  return `<nav class="nav">${tabs.map(x=>`<button data-tab="${x[0]}" class="${S.tab===x[0]?"on":""}"><b>${x[1]}</b>${x[2]}</button>`).join("")}</nav>`;
}
function render(){
  const a=S.data.admin;
  $("#app").innerHTML=`<div class="shell"><header class="top"><div class="topin"><div class="brand">ตช</div><div><h1>ตื่นเช้า · หลังร้าน</h1><small>${esc(a.displayName||"ผู้ดูแลร้าน")}${DEMO?" · DEMO":""}</small></div><span class="role">${a.role}</span></div></header>${nav()}<div class="content">${page()}</div></div>${S.modal?modal():""}`;
  bind();
}
function page(){ return ({dashboard:dashboardPage,orders:ordersPage,menu:menuPage,settings:settingsPage,staff:staffPage}[S.tab]||dashboardPage)(); }
function pageHead(title,extra=""){ return `<div class="pagehead"><h2>${title}</h2><div>${extra}<button class="refresh" data-action="refresh">↻ รีเฟรช</button></div></div>`; }

function dashboardPage(){
  const d=S.data.dashboard;
  return `${pageHead("ภาพรวมวันนี้")}<div class="stats">
    ${stat("ออเดอร์ทั้งหมด",d.total)}${stat("ออเดอร์ใหม่",d.newOrders,"hot")}${stat("กำลังทำ",d.making)}${stat("พร้อมส่ง",d.ready,"good")}${stat("รอตรวจยอด",d.unpaid,"hot")}
  </div><div class="panel"><div class="switchrow"><div><h3>${d.acceptingOrders?"ร้านเปิดรับออเดอร์":"ร้านปิดรับออเดอร์"}</h3><small>${isOwner()?"ลูกค้าจะเห็นสถานะนี้ทันทีเมื่อเปิดหน้าใหม่":"เฉพาะ OWNER เท่านั้นที่เปลี่ยนได้"}</small></div><label class="switch"><input id="shop-open" type="checkbox" ${d.acceptingOrders?"checked":""} ${isOwner()?"":"disabled"}><i></i></label></div></div>
  <div class="panel"><h3>งานที่ต้องดู</h3><p>รอตรวจสอบสลิป <b>${d.verifying}</b> ออเดอร์ · กำลังส่ง <b>${d.delivering}</b> ออเดอร์</p><p class="hint">ข้อมูลรีเฟรชอัตโนมัติทุก 15 วินาที · ล่าสุด ${esc((S.data.serverTime||"").slice(11))}</p></div>`;
}
function stat(label,n,cls=""){ return `<div class="stat ${cls}"><small>${label}</small><b>${n}</b></div>`; }

function ordersPage(){
  const extra=`<input class="date" id="order-date" type="date" value="${esc(S.date)}"> `;
  return `${pageHead("ออเดอร์",extra)}<div class="filters"><button data-status="" class="${!S.status?"on":""}">ทั้งหมด</button>${STATUS.map(x=>`<button data-status="${x}" class="${S.status===x?"on":""}">${x}</button>`).join("")}</div><div class="orders">${S.data.orders.length?S.data.orders.map(orderCard).join(""):`<div class="empty">ยังไม่มีออเดอร์ในวันที่เลือก</div>`}</div>`;
}
function orderCard(o){
  const where=o.mode==="pickup"?"รับที่ร้าน":[o.location,o.drop,o.locNote].filter(Boolean).join(" · ");
  const badge=o.status==="ใหม่"?"new":o.status==="กำลังทำ"?"making":o.status==="ส่งแล้ว"?"done":o.status==="ยกเลิก"?"cancel":"";
  return `<article class="order" data-order="${esc(o.orderNo)}"><div class="orderhead"><div><h3>${esc(o.orderNo)}</h3><small>${esc(o.slot)} น. · ${esc(o.displayName)} · ${esc(o.phone)}</small></div><span class="badge ${badge}">${esc(o.status)}</span></div><div class="where">📍 ${esc(where)}</div><div class="items">${o.items.map(i=>`<div class="item"><div><b>${i.qty}× ${esc(i.name)}</b><small>${esc([i.sweet,...i.extras,i.note].filter(Boolean).join(" · "))}</small></div><span>${i.total}</span></div>`).join("")}</div>${o.note?`<div class="note">📝 ${esc(o.note)}</div>`:""}<div class="tot"><span>${o.pay==="cash"?"เงินสด":"โอนบัญชีกสิกร"}${o.code?` · ${esc(o.code)}`:""}</span><span>${o.total} บาท</span></div><div class="actions"><select data-status-change ${o.status==="ยกเลิก"?"disabled":""}>${STATUS.map(x=>`<option ${x===o.status?"selected":""}>${x}</option>`).join("")}</select><label class="paid"><input data-paid type="checkbox" ${o.paid?"checked":""} ${o.status==="ยกเลิก"||o.pay==="cash"?"disabled":""}> รับเงินแล้ว</label></div></article>`;
}

function menuPage(){
  return `${pageHead("เมนูขาย")}<div class="menulist">${S.data.menu.map(m=>`<article class="menurow" data-menu="${esc(m.id)}"><img src="${esc(m.imageUrl)}" alt="" onerror="this.style.visibility='hidden'"><div><h3>${esc(m.name)}</h3><small>${esc(m.category)} · ${m.price} บาท</small>${isOwner()?`<button class="edit" data-edit-menu>แก้รายละเอียด</button>`:""}</div><label class="switch"><input data-menu-active type="checkbox" ${m.active?"checked":""}><i></i></label></article>`).join("")}</div>`;
}

function settingsPage(){
  if(!isOwner()) return ""; const x=S.data.settings;
  return `${pageHead("ตั้งค่าร้าน")}<form id="settings-form" class="panel formgrid two">
    ${field("ข้อความเมื่อร้านปิด","closedMessage",x.closedMessage)}${field("รอบส่ง คั่นด้วย ,","slots",x.slots)}${field("รอบ Pre-order คั่นด้วย ,","preorderOnlySlots",x.preorderOnlySlots)}${field("ปิดรับก่อนรอบ (นาที)","cutoffMinutes",x.cutoffMinutes,"number")}${field("วันหยุดพิเศษ YYYY-MM-DD","closedDates",x.closedDates)}${field("จำนวนแก้วสูงสุดต่อรอบ (0 = ไม่จำกัด)","maxCupsPerSlot",x.maxCupsPerSlot,"number")}${field("ธนาคาร","bankName",x.bankName)}${field("ชื่อบัญชี","bankAccountName",x.bankAccountName)}${field("เลขบัญชี","bankAccountNo",x.bankAccountNo)}${field("URL รูป QR","bankQrUrl",x.bankQrUrl)}
    <label class="paid"><input name="allowPickup" type="checkbox" ${boolv(x.allowPickup)?"checked":""}> อนุญาตรับเองที่ร้าน</label><label class="paid"><input name="enableCodes" type="checkbox" ${boolv(x.enableCodes)?"checked":""}> เปิดโค้ดส่วนลด</label><label class="paid"><input name="enableStamps" type="checkbox" ${boolv(x.enableStamps)?"checked":""}> เปิดสะสมแต้ม</label><button class="btn" type="submit">บันทึกการตั้งค่า</button>
  </form>`;
}
function field(label,name,value,type="text"){ return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(value)}"></div>`; }
function boolv(v){ return v===true || /^(true|1|yes|เปิด)$/i.test(String(v)); }

function staffPage(){
  if(!isOwner()) return ""; const rows=S.data.staff||[];
  return `${pageHead("พนักงาน")}<div class="panel"><button class="btn" data-add-staff>+ เพิ่มพนักงาน</button><p class="hint">ให้พนักงานพิมพ์ “ไอดี” ในแชท LINE ร้าน แล้วนำ user ID ที่ขึ้นต้นด้วย U มาเพิ่ม</p>${rows.map(x=>`<div class="staffrow"><div><b>${esc(x.displayName||"ยังไม่ตั้งชื่อ")} · ${esc(x.role)}</b><code>${esc(x.userId)}</code></div>${x.systemOwner?`<span class="badge done">เจ้าของหลัก</span>`:`<button data-staff-toggle="${esc(x.userId)}" data-active="${x.active}">${x.active?"ปิดสิทธิ์":"เปิดสิทธิ์"}</button>`}</div>`).join("")}</div>`;
}

function modal(){
  if(S.modal.type==="menu"){
    const m=S.data.menu.find(x=>x.id===S.modal.id);
    return `<div class="modalbg"><form class="modal" id="menu-form"><div class="modalhead"><h2>แก้เมนู ${esc(m.name)}</h2><button type="button" class="close" data-close>×</button></div><div class="formgrid two">${field("ชื่อไทย","name",m.name)}${field("ชื่ออังกฤษ","nameEn",m.nameEn)}${field("หมวดไทย","category",m.category)}${field("หมวดอังกฤษ","categoryEn",m.categoryEn)}${field("ราคา","price",m.price,"number")}${field("ลำดับขายดี","bestRank",m.bestRank,"number")}${field("ระดับหวานที่ปิด คั่นด้วย |","sweetOff",m.sweetOff)}${field("URL รูป","imageUrl",m.imageUrl)}</div><div class="modalactions"><button type="button" class="btn ghost" data-close>ยกเลิก</button><button class="btn" type="submit">บันทึก</button></div></form></div>`;
  }
  return `<div class="modalbg"><form class="modal" id="staff-form"><div class="modalhead"><h2>เพิ่มพนักงาน</h2><button type="button" class="close" data-close>×</button></div><div class="formgrid">${field("LINE user ID","userId","")}${field("ชื่อพนักงาน","displayName","")}<div class="field"><label>บทบาท</label><select name="role"><option value="KITCHEN">KITCHEN · ครัว</option><option value="OWNER">OWNER · เจ้าของร้าน</option></select></div></div><div class="modalactions"><button type="button" class="btn ghost" data-close>ยกเลิก</button><button class="btn" type="submit">เพิ่มพนักงาน</button></div></form></div>`;
}

function bind(){
  document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=async()=>{ S.tab=b.dataset.tab; S.modal=null; if(S.tab==="staff"&&!S.data.staff){ try{S.data.staff=(await api("adminListStaff")).staff}catch(e){toast(e.message)} } render(); });
  const ref=$("[data-action=refresh]"); if(ref) ref.onclick=()=>refresh();
  const od=$("#order-date"); if(od) od.onchange=()=>{S.date=od.value;refresh(false)};
  document.querySelectorAll("[data-status]").forEach(b=>b.onclick=()=>{S.status=b.dataset.status;refresh(false)});
  document.querySelectorAll("[data-status-change]").forEach(el=>el.onchange=()=>changeStatus(el));
  document.querySelectorAll("[data-paid]").forEach(el=>el.onchange=()=>setPaid(el));
  document.querySelectorAll("[data-menu-active]").forEach(el=>el.onchange=()=>toggleMenu(el));
  document.querySelectorAll("[data-edit-menu]").forEach(el=>el.onclick=()=>{S.modal={type:"menu",id:el.closest("[data-menu]").dataset.menu};render()});
  document.querySelectorAll("[data-close]").forEach(el=>el.onclick=()=>{S.modal=null;render()});
  const shop=$("#shop-open"); if(shop) shop.onchange=()=>saveSettings({acceptingOrders:shop.checked});
  const sf=$("#settings-form"); if(sf) sf.onsubmit=submitSettings;
  const mf=$("#menu-form"); if(mf) mf.onsubmit=submitMenu;
  const add=$("[data-add-staff]"); if(add) add.onclick=()=>{S.modal={type:"staff"};render()};
  const stf=$("#staff-form"); if(stf) stf.onsubmit=submitStaff;
  document.querySelectorAll("[data-staff-toggle]").forEach(b=>b.onclick=()=>toggleStaff(b));
}

async function changeStatus(el){
  const orderNo=el.closest("[data-order]").dataset.order, status=el.value;
  if(status==="ยกเลิก"&&!confirm(`ยืนยันยกเลิก ${orderNo}? ระบบจะคืนแต้มและสิทธิ์ส่วนลด`)){render();return}
  await mutate(()=>api("adminUpdateOrderStatus",{orderNo,status}),"เปลี่ยนสถานะแล้ว");
}
async function setPaid(el){ const orderNo=el.closest("[data-order]").dataset.order; await mutate(()=>api("adminSetPaid",{orderNo,paid:el.checked}),el.checked?"ยืนยันยอดแล้ว":"ยกเลิกการยืนยันยอดแล้ว"); }
async function toggleMenu(el){ const menuId=el.closest("[data-menu]").dataset.menu; await mutate(()=>api("adminToggleMenu",{menuId,active:el.checked}),el.checked?"เปิดขายเมนูแล้ว":"ปิดขายเมนูแล้ว",true); }
async function saveSettings(settings){ await mutate(()=>api("adminUpdateSettings",{settings}),"บันทึกแล้ว"); }
async function submitSettings(e){ e.preventDefault(); const f=new FormData(e.currentTarget), settings={}; ["closedMessage","slots","preorderOnlySlots","cutoffMinutes","closedDates","maxCupsPerSlot","bankName","bankAccountName","bankAccountNo","bankQrUrl"].forEach(k=>settings[k]=f.get(k)||""); ["allowPickup","enableCodes","enableStamps"].forEach(k=>settings[k]=f.has(k)); await saveSettings(settings); }
async function submitMenu(e){ e.preventDefault(); const f=new FormData(e.currentTarget), menu={}; ["name","nameEn","category","categoryEn","price","bestRank","sweetOff","imageUrl"].forEach(k=>menu[k]=f.get(k)||""); const id=S.modal.id; S.modal=null; await mutate(()=>api("adminUpdateMenu",{menuId:id,menu}),"บันทึกเมนูแล้ว",true); }
async function submitStaff(e){ e.preventDefault(); const f=new FormData(e.currentTarget); const staff={userId:f.get("userId"),displayName:f.get("displayName"),role:f.get("role"),active:true}; S.modal=null; await mutate(async()=>{const r=await api("adminSaveStaff",{staff});S.data.staff=r.staff;return r},"เพิ่มพนักงานแล้ว"); }
async function toggleStaff(b){ const active=b.dataset.active!=="true"; await mutate(async()=>{const r=await api("adminSetStaffActive",{userId:b.dataset.staffToggle,active});S.data.staff=r.staff;return r},active?"เปิดสิทธิ์แล้ว":"ปิดสิทธิ์แล้ว"); }
async function mutate(fn,msg,full=false){
  if(S.busy)return; S.busy=true;
  try{ const r=await fn(); if(r.warning) toast(r.warning); else toast(msg); if(full||S.tab!=="staff"){const fresh=await api("adminInit",{date:S.date});S.data={...S.data,...fresh};if(S.tab==="orders"&&S.status)S.data.orders=(await api("adminListOrders",{date:S.date,status:S.status})).orders} render(); }
  catch(e){toast(e.message);render()} finally{S.busy=false}
}

boot();
