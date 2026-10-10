// Fake backend used when APP_CONFIG.GAS_URL is empty or the URL has ?demo — lets you preview the page in any browser.
window.DemoApi = (() => {
  const menu = [
    {id:"amr", cat:"กาแฟ", catEn:"Coffee", name:"อเมริกาโน่", nameEn:"Americano", price:65, best:0, img:"menu/americano.jpg", layers:[["#2B1A10",62],["#d8ecf4",12]]},
    {id:"lat", cat:"กาแฟ", catEn:"Coffee", name:"ลาเต้", nameEn:"Latte", price:75, best:3, img:"menu/latte.jpg", layers:[["#EADBC8",42],["#8A5A3B",26]]},
    {id:"orn", cat:"กาแฟ", catEn:"Coffee", name:"อเมริกาโน่ส้ม", nameEn:"Orange Americano", price:80, best:2, img:"menu/orange-americano.jpg", layers:[["#E58A2C",40],["#3A2416",26]], sweetOff:["0%"]},
    {id:"pmt", cat:"มัทฉะ", catEn:"Matcha", name:"เคลียร์มัทฉะ", nameEn:"Clear Matcha", price:90, best:0, img:"menu/clear-matcha.jpg", layers:[["#4F7F2A",62]]},
    {id:"mat", cat:"มัทฉะ", catEn:"Matcha", name:"มัทฉะลาเต้", nameEn:"Matcha Latte", price:90, best:4, img:"menu/matcha-latte.jpg", layers:[["#F2EFE6",30],["#6E9A47",36]]},
    {id:"mcw", cat:"มัทฉะ", catEn:"Matcha", name:"มัทฉะน้ำมะพร้าว", nameEn:"Matcha Coconut Water", price:90, best:0, img:"menu/matcha-coconut.jpg", layers:[["#EEF3E8",38],["#5E8F33",28]]},
    {id:"tht", cat:"ชา", catEn:"Tea", name:"ชาไทย", nameEn:"Thai Tea", price:59, best:0, img:"menu/thai-tea.jpg", layers:[["#E07A33",66]], sweetOff:["0%"]},
    {id:"blt", cat:"ชา", catEn:"Tea", name:"ชาดำเย็น (ชาใส)", nameEn:"Iced Black Tea (no milk)", price:59, best:0, img:"menu/black-tea.jpg", layers:[["#7A2E0E",60],["#d8ecf4",8]]},
    {id:"grt", cat:"ชา", catEn:"Tea", name:"ชาเขียว", nameEn:"Green Tea", price:59, best:0, img:"menu/green-tea.jpg", layers:[["#A3C56E",66]], sweetOff:["0%"]},
    {id:"coa", cat:"อื่น ๆ", catEn:"Others", name:"โกโก้", nameEn:"Cocoa", price:65, best:1, img:"menu/cocoa.jpg", layers:[["#5C3A2A",66]], sweetOff:["0%"]},
    {id:"pnk", cat:"อื่น ๆ", catEn:"Others", name:"นมชมพู (นมเย็น)", nameEn:"Pink Milk (iced milk)", price:59, best:0, img:"menu/pink-milk.jpg", layers:[["#F4A9BE",66]], sweetOff:["0%"]},
  ];
  const cfg = {
    shopName:"ตื่นเช้า", shopSub:"TUEN_CHAO · Home Cafe",
    acceptingOrders:true, closedMessage:"", allowPickup:false,
    locations:["คอนโด ศุภาลัย ซิตี้รีสอร์ท แจ้งวัฒนะ"], deliveryFee:0,
    dropOptions:["ส่งที่ห้อง","ล็อคเกอร์ส่งอาหาร"], roomRequiredFor:["ส่งที่ห้อง"],
    enableCodes:true, enableStamps:false, extrasOff:["เพิ่มช็อต","เปลี่ยนเป็นนมโอ๊ต"],
    sweetness:["100%","75%","50%","0%"], sweetRecommended:"75%",
    extras:[["แยกน้ำแข็ง",5],["เพิ่มช็อต",15],["เปลี่ยนเป็นนมโอ๊ต",15]],
    bankName:"ธนาคารกสิกรไทย", bankAccountName:"ตื่นเช้า โฮมคาเฟ่", bankAccountNo:"xxx-x-xxxxx-x",
    bankQrUrl:"", firstOrderTransferOnly:true, stampGoal:10, receiptMode:"push", menu,
    en:{
      shopSub:"TUEN_CHAO · Home Cafe", closedMessage:"We are not taking orders right now. See you soon!",
      locations:["Supalai City Resort Chaengwattana"], dropOptions:["To my room","Food locker"],
      extras:["Ice on the side","Extra shot","Oat milk"],
    },
  };
  // same rules as the sheet defaults: 06:30 is pre-order only, today's rounds close 30 min before
  const SLOTS = ["06:30","07:30","08:30","09:30"], PREORDER_ONLY = ["06:30"], CUTOFF = 30;
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const toMin = t => { const [h, m] = t.split(":").map(Number); return h*60 + m; };
  const fromMin = x => `${pad(Math.floor(x/60))}:${pad(x%60)}`;
  function days() {
    const now = new Date(), nowMin = now.getHours()*60 + now.getMinutes();
    return [0, 1].map(i => {
      const d = new Date(now); d.setDate(d.getDate() + i);
      return {date:ymd(d), rel:i ? "สั่งล่วงหน้า" : "วันนี้", slots:SLOTS.map(t => {
        if (i === 0 && PREORDER_ONLY.includes(t)) return {time:t, open:false, reason:"preorder"};
        const by = toMin(t) - CUTOFF;
        if (i === 0 && nowMin >= by) return {time:t, open:false, reason:"closed"};
        return {time:t, open:true, orderBy:i === 0 ? fromMin(by) : ""};
      })};
    });
  }
  // opening-promo code, same shape as a row in the Codes sheet (usable once per customer per day)
  const week = new Date(); week.setDate(week.getDate() + 6);
  const OPEN10 = {code:"OPEN10", amount:10, minCups:2, label:"โปรเปิดร้าน ซื้อ 2 แก้ว ลด 10 บาท", labelEn:"Opening promo: buy 2 drinks, get 10 THB off"};
  cfg.codeBanners = [{code:"OPEN10", label:OPEN10.label, labelEn:OPEN10.labelEn, end:ymd(week)}];
  const cust = {name:"ลูกค้าตัวอย่าง", phone:"", orders:0, stamps:3, freeCups:1, lastMode:"", lastLoc:"", lastLocNote:""};
  let seq = 0, codeUsedOn = "";
  const fail = (th, en, lang) => { throw new Error(lang === "en" ? en : th); };
  function checkCode(raw, lang, cups) {
    const c = String(raw || "").trim().toUpperCase();
    if (c !== "OPEN10") fail(`ไม่พบโค้ด "${c}" หรือโค้ดหมดเวลาแล้ว`, `Code "${c}" was not found or has expired.`, lang);
    if (codeUsedOn === ymd(new Date())) fail("วันนี้คุณใช้โค้ดนี้ไปแล้ว พรุ่งนี้ใช้ได้อีกนะคะ", "You have already used this code today. Try again tomorrow.", lang);
    if (cups != null && cups < OPEN10.minCups) fail(`โค้ด ${c} ใช้ได้เมื่อซื้อครบ ${OPEN10.minCups} แก้ว`, `Code ${c} needs at least ${OPEN10.minCups} drinks.`, lang);
    return OPEN10;
  }

  return async (action, data) => {
    await new Promise(r => setTimeout(r, 250));
    const en = data.lang === "en";
    if (action === "init") return {config:{...cfg, days:days()}, customer:{...cust}};
    if (action === "checkCode") return {code:checkCode(data.code, data.lang)};
    if (action === "order") {
      const o = data.order, ex = new Map(cfg.extras), names = cfg.extras.map(e => e[0]);
      const items = o.items.map(it => {
        const m = menu.find(x => x.id === it.id), extras = it.extras.map(n => [n, ex.get(n)]);
        const unit = m.price + extras.reduce((a, e) => a + e[1], 0);
        const exNames = it.extras.map(n => en ? cfg.en.extras[names.indexOf(n)] : n);
        return {qty:it.qty, name:en ? m.nameEn : m.name, base:m.price, opts:[it.sweet, ...exNames, it.note].filter(Boolean).join(" · "), total:unit*it.qty};
      });
      const subtotal = items.reduce((a, l) => a + l.total, 0);
      const free = o.useFree ? Math.max(...items.map(l => l.base)) : 0;
      const cups = items.reduce((a, l) => a + l.qty, 0), earned = cups - (o.useFree ? 1 : 0);
      const code = o.code ? checkCode(o.code, data.lang, cups) : null;
      if (code) codeUsedOn = ymd(new Date());
      const discount = Math.min(subtotal, free + (code ? code.amount : 0));
      cust.orders++; cust.phone = o.phone; cust.freeCups -= o.useFree ? 1 : 0;
      cust.stamps += earned; cust.freeCups += Math.floor(cust.stamps / cfg.stampGoal); cust.stamps %= cfg.stampGoal;
      const [y, mo, dd] = o.date.split("-").map(Number);
      const label = new Date(y, mo-1, dd).toLocaleDateString(en ? "en-GB" : "th-TH", {weekday:"short", day:"numeric", month:"short"});
      const loc = en ? cfg.en.locations[cfg.locations.indexOf(o.loc)] : o.loc;
      const drop = o.drop ? (en ? cfg.en.dropOptions[cfg.dropOptions.indexOf(o.drop)] : o.drop) : "";
      const note = en ? o.locNote.replace(/ชั้น\s*(\S+)\s*ห้อง\s*/, "Floor $1, Room ") : o.locNote;
      return {
        order:{no:`ORD-${o.date.replace(/-/g, "")}-${pad(++seq).padStart(3, "0")}`, lang:en ? "en" : "th",
          when:`${label} · ${o.slot ? (en ? o.slot : o.slot + " น.") : (en ? "As soon as ready" : "เร็วที่สุด")}`,
          where:o.mode === "pickup" ? (en ? "Pick up at the shop" : "รับที่ร้าน") : loc + (drop ? ` · ${drop}` : "") + (note ? ` (${note})` : ""),
          mode:o.mode, items, subtotal, discount, deliveryFee:0, total:subtotal - discount, pay:o.pay},
        customer:{orders:cust.orders, stamps:cust.stamps, freeCups:cust.freeCups}, receiptSent:false,
      };
    }
    if (action === "pushReceipt") return {sent:false};
    fail("unknown action", "unknown action", data.lang);
  };
})();
