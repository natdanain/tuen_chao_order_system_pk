window.AdminDemoApi = (() => {
  const today = new Date().toISOString().slice(0,10);
  const menu = [
    {id:"lat",category:"กาแฟ",categoryEn:"Coffee",name:"ลาเต้",nameEn:"Latte",price:75,bestRank:3,imageUrl:"menu/latte.jpg",active:true,sweetOff:"",colors:""},
    {id:"mat",category:"มัทฉะ",categoryEn:"Matcha",name:"มัทฉะลาเต้",nameEn:"Matcha Latte",price:90,bestRank:4,imageUrl:"menu/matcha-latte.jpg",active:true,sweetOff:"",colors:""},
    {id:"coa",category:"อื่น ๆ",categoryEn:"Others",name:"โกโก้",nameEn:"Cocoa",price:65,bestRank:1,imageUrl:"menu/cocoa.jpg",active:false,sweetOff:"0%",colors:""}
  ];
  const orders = [
    {orderNo:"ORD-DEMO-003",createdAt:today+"T08:41:00",status:"ใหม่",paid:false,date:today,slot:"09:30",mode:"deliver",location:"คอนโด ศุภาลัย",drop:"ส่งที่ห้อง",locNote:"ชั้น 15 ห้อง 319",displayName:"ลูกค้าทดสอบ",phone:"0812345678",cups:2,subtotal:165,discount:10,deliveryFee:0,total:155,pay:"bank",code:"OPEN10",note:"วางหน้าห้องได้เลย",items:[{name:"ลาเต้",qty:1,sweet:"75%",extras:[],note:"",total:75},{name:"มัทฉะลาเต้",qty:1,sweet:"75%",extras:[],note:"",total:90}]},
    {orderNo:"ORD-DEMO-002",createdAt:today+"T08:15:00",status:"กำลังทำ",paid:true,date:today,slot:"09:30",mode:"deliver",location:"คอนโด ศุภาลัย",drop:"ล็อคเกอร์ส่งอาหาร",locNote:"",displayName:"Nina",phone:"0899999999",cups:1,subtotal:65,discount:0,deliveryFee:0,total:65,pay:"bank",code:"",note:"",items:[{name:"โกโก้",qty:1,sweet:"50%",extras:[],note:"",total:65}]}
  ];
  const settings = {acceptingOrders:true,closedMessage:"ตอนนี้ร้านปิดรับออเดอร์ชั่วคราว แล้วพบกันใหม่นะคะ",slots:"06:30,07:30,08:30,09:30",preorderOnlySlots:"06:30",cutoffMinutes:30,closedDates:"",maxCupsPerSlot:0,allowPickup:false,bankName:"ธนาคารกสิกรไทย",bankAccountName:"ตื่นเช้า",bankAccountNo:"xxx-x-xxxxx-x",bankQrUrl:"",enableCodes:true,enableStamps:false};
  const staff = [{userId:"U-DEMO-OWNER",displayName:"เจ้าของร้านหลัก",role:"OWNER",active:true,systemOwner:true},{userId:"U-DEMO-KITCHEN",displayName:"ครัวเช้า",role:"KITCHEN",active:true,systemOwner:false}];
  const stats = () => ({acceptingOrders:!!settings.acceptingOrders,total:orders.filter(x=>x.status!=="ยกเลิก").length,newOrders:orders.filter(x=>x.status==="ใหม่").length,verifying:orders.filter(x=>x.status==="รอตรวจสอบ").length,making:orders.filter(x=>x.status==="กำลังทำ").length,ready:orders.filter(x=>x.status==="พร้อมส่ง").length,delivering:orders.filter(x=>x.status==="กำลังส่ง").length,unpaid:orders.filter(x=>x.pay!=="cash"&&!x.paid&&x.status!=="ยกเลิก").length});
  const state = () => ({admin:{userId:"U-DEMO-OWNER",displayName:"เจ้าของร้าน",role:"OWNER"},serverTime:new Date().toISOString().slice(0,19),dashboard:stats(),orders:[...orders],menu:[...menu],settings:{...settings},statuses:["ใหม่","รอตรวจสอบ","กำลังทำ","พร้อมส่ง","กำลังส่ง","ส่งแล้ว","ยกเลิก"]});
  return async (action,data) => {
    await new Promise(r=>setTimeout(r,120));
    if(action==="adminInit") return {ok:true,...state()};
    if(action==="adminListOrders") return {ok:true,orders:orders.filter(x=>(!data.date||x.date===data.date)&&(!data.status||x.status===data.status))};
    if(action==="adminUpdateOrderStatus"){const x=orders.find(o=>o.orderNo===data.orderNo);x.status=data.status;return {ok:true,order:x};}
    if(action==="adminSetPaid"){const x=orders.find(o=>o.orderNo===data.orderNo);x.paid=data.paid;if(data.paid&&["ใหม่","รอตรวจสอบ"].includes(x.status))x.status="กำลังทำ";return {ok:true,order:x};}
    if(action==="adminToggleMenu"){const x=menu.find(m=>m.id===data.menuId);x.active=data.active;return {ok:true,menu:x};}
    if(action==="adminUpdateMenu"){const x=menu.find(m=>m.id===data.menuId);Object.assign(x,data.menu);return {ok:true,menu:x};}
    if(action==="adminUpdateSettings"){Object.assign(settings,data.settings);return {ok:true,settings:{...settings},dashboard:stats()};}
    if(action==="adminListStaff") return {ok:true,staff:[...staff]};
    if(action==="adminSaveStaff"){staff.push({...data.staff,systemOwner:false});return {ok:true,staff:[...staff]};}
    if(action==="adminSetStaffActive"){const x=staff.find(s=>s.userId===data.userId);x.active=data.active;return {ok:true,staff:[...staff]};}
    throw new Error("Demo action not found");
  };
})();
