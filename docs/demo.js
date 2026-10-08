// Fake backend used when APP_CONFIG.GAS_URL is empty or the URL has ?demo — lets you preview the page in any browser.
window.DemoApi = (() => {
  const menu = [
    {id:"amr", cat:"กาแฟ", name:"อเมริกาโน่ (กาแฟสด)", price:65, best:1, layers:[["#2B1A10",62],["#d8ecf4",12]]},
    {id:"lat", cat:"กาแฟ", name:"ลาเต้ (กาแฟสด)", price:75, best:3, layers:[["#EADBC8",42],["#8A5A3B",26]]},
    {id:"orn", cat:"กาแฟ", name:"อเมริกาโน่ส้ม (กาแฟสด)", price:80, best:2, layers:[["#E58A2C",40],["#3A2416",26]], sweetOff:["0%"]},
    {id:"pmt", cat:"มัทฉะ", name:"เพียวมัทฉะ (เกรดพิธีการ)", price:90, best:0, layers:[["#4F7F2A",62]]},
    {id:"mat", cat:"มัทฉะ", name:"มัทฉะลาเต้ (เกรดพรีเมียม)", price:90, best:4, layers:[["#F2EFE6",30],["#6E9A47",36]]},
    {id:"mcw", cat:"มัทฉะ", name:"มัทฉะน้ำมะพร้าว (เกรดพรีเมียม)", price:90, best:0, layers:[["#EEF3E8",38],["#5E8F33",28]]},
    {id:"tht", cat:"ชา", name:"ชาไทย", price:59, best:0, layers:[["#E07A33",66]], sweetOff:["0%"]},
    {id:"blt", cat:"ชา", name:"ชาดำเย็น (ชาใส)", price:59, best:0, layers:[["#7A2E0E",60],["#d8ecf4",8]]},
    {id:"grt", cat:"ชา", name:"ชาเขียว", price:59, best:0, layers:[["#A3C56E",66]], sweetOff:["0%"]},
    {id:"coa", cat:"อื่น ๆ", name:"โกโก้", price:65, best:0, layers:[["#5C3A2A",66]], sweetOff:["0%"]},
    {id:"pnk", cat:"อื่น ๆ", name:"นมชมพู (นมเย็น)", price:59, best:0, layers:[["#F4A9BE",66]], sweetOff:["0%"]},
  ];
  const cfg = {
    shopName:"ตื่นเช้า", shopSub:"TUEN_CHAO · Home Cafe",
    acceptingOrders:true, closedMessage:"", allowPickup:false,
    locations:["คอนโด ศุภาลัย ซิตี้รีสอร์ท แจ้งวัฒนะ"], deliveryFee:0,
    dropOptions:["ส่งที่ห้อง","ล็อคเกอร์ส่งอาหาร"], roomRequiredFor:["ส่งที่ห้อง"],
    enableCodes:false, enableStamps:false, extrasOff:["เพิ่มช็อต","เปลี่ยนเป็นนมโอ๊ต"],
    sweetness:["100%","75%","50%","0%"], sweetRecommended:"75%",
    extras:[["แยกน้ำแข็ง",5],["เพิ่มช็อต",15],["เปลี่ยนเป็นนมโอ๊ต",15]],
    promptpay:"0812345678", firstOrderPromptPayOnly:true, stampGoal:10, receiptMode:"push", menu,
  };
  const SLOTS = ["07:30","09:00","10:30","13:00","15:00"], CUTOFF = 60, TODAY_LAST = "14:00";
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const label = d => d.toLocaleDateString("th-TH", {weekday:"short", day:"numeric", month:"short"});
  function days() {
    const now = new Date(), nowMin = now.getHours()*60 + now.getMinutes();
    return [0, 1].map(i => {
      const d = new Date(now); d.setDate(d.getDate() + i);
      if (i === 0) {
        const [h, m] = TODAY_LAST.split(":").map(Number), open = nowMin < h*60 + m;
        return {date:ymd(d), label:label(d), rel:"วันนี้", asap:true, open, note:open ? `สั่งได้ถึง ${TODAY_LAST} น.` : "ปิดรับวันนี้แล้ว", slots:[]};
      }
      return {date:ymd(d), label:label(d), rel:i ? "พรุ่งนี้" : "วันนี้", slots:SLOTS.map(t => {
        const [h, m] = t.split(":").map(Number), close = h*60 + m - CUTOFF;
        return i === 0 && nowMin >= close
          ? {time:t, open:false, note:"ปิดรับแล้ว"}
          : {time:t, open:true, note:`สั่งก่อน ${pad(Math.floor(close/60))}:${pad(close%60)}`};
      })};
    });
  }
  const cust = {name:"ลูกค้าตัวอย่าง", phone:"", orders:0, stamps:3, freeCups:1, lastMode:"", lastLoc:"", lastLocNote:""};
  let seq = 0;
  const fail = msg => { throw new Error(msg); };

  return async (action, data) => {
    await new Promise(r => setTimeout(r, 250));
    if (action === "init") return {config:{...cfg, days:days()}, customer:{...cust}};
    if (action === "checkCode") {
      const c = String(data.code || "").trim().toUpperCase();
      if (c !== "NEW10") fail(c ? `ไม่พบโค้ด "${c}" ลองตรวจตัวสะกดอีกครั้ง` : "กรอกโค้ดก่อนกดใช้");
      if (cust.orders) fail("โค้ดนี้ใช้ได้เฉพาะออเดอร์แรก");
      return {code:{code:c, amount:10, label:"ลูกค้าใหม่ ลด 10 บาท"}};
    }
    if (action === "order") {
      const o = data.order, ex = new Map(cfg.extras);
      const items = o.items.map(it => {
        const m = menu.find(x => x.id === it.id), extras = it.extras.map(n => [n, ex.get(n)]);
        const unit = m.price + extras.reduce((a, e) => a + e[1], 0);
        return {qty:it.qty, name:m.name, base:m.price, opts:[it.sweet, ...it.extras, it.note].filter(Boolean).join(" · "), total:unit*it.qty};
      });
      const subtotal = items.reduce((a, l) => a + l.total, 0);
      const free = o.useFree ? Math.max(...items.map(l => l.base)) : 0;
      const discount = Math.min(subtotal, free + (o.code ? 10 : 0));
      const cups = items.reduce((a, l) => a + l.qty, 0), earned = cups - (o.useFree ? 1 : 0);
      const d = days().find(x => x.date === o.date);
      cust.orders++; cust.phone = o.phone; cust.freeCups -= o.useFree ? 1 : 0;
      cust.stamps += earned; cust.freeCups += Math.floor(cust.stamps / cfg.stampGoal); cust.stamps %= cfg.stampGoal;
      return {
        order:{no:`ORD-${o.date.replace(/-/g, "")}-${pad(++seq).padStart(3, "0")}`, when:`${d.label} · ${o.slot ? o.slot + " น." : "เร็วที่สุด"}`,
          where:o.mode === "pickup" ? "รับที่ร้าน" : o.loc + (o.drop ? ` · ${o.drop}` : "") + (o.locNote ? ` (${o.locNote})` : ""), mode:o.mode,
          items, subtotal, discount, deliveryFee:0, total:subtotal - discount, pay:o.pay},
        customer:{orders:cust.orders, stamps:cust.stamps, freeCups:cust.freeCups}, receiptSent:false,
      };
    }
    if (action === "pushReceipt") return {sent:false};
    fail("unknown action");
  };
})();
