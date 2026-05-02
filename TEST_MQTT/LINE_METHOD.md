mqttHandler จึงคำนวณ method เอง
javascript

const method =
(data.qrIncome ?? 0) > 0
? "qr"
: (data.cashIncome ?? 0) > 0
? "cash"
: (data.coinIncome ?? 0) > 0
? "coin"
: "cash"; // ← default ถ้าทุกอย่างเป็น 0

ทดสอบกับ data ที่ส่งมา
qrIncome = 50 → > 0 ✅
cashIncome = 0
coinIncome = 0

ผลลัพธ์ method = "qr" → LINE แสดง 📱 QR Code

⚠️ ข้อจำกัดของวิธีนี้
กรณี ผล
qr=50, cash=0, coin=0 ✅ method = "qr" ถูกต้อง
qr=0, cash=30, coin=0 ✅ method = "cash" ถูกต้อง
qr=20, cash=30, coin=0 ⚠️ method = "qr" (ใช้อันแรกที่ > 0)
qr=0, cash=0, coin=0 ⚠️ method = "cash" (default)

ทั้งที่ไม่มีเงินYou said: จากตรงนี้ = const method =จากตรงนี้ = const
method =
(data.qrIncome ?? 0) > 0
? "qr"
: (data.cashIncome ?? 0) > 0
? "cash"
: (data.coinIncome ?? 0) > 0
? "coin"
: "cash"; // ← default ถ้าทุกอย่างเป็น 0 ##### ถ้า data.qrIncome >0 และ data.cashIncome >0 # method เป็นอะไร2:54 PMClaude responded: method = "qr" ครับmethod = "qr" ครับ
เพราะ logic เช็ค qrIncome ก่อนเลย ถ้า > 0 จบทันที ไม่ดู cashIncome ต่อ
javascript(data.qrIncome ?? 0) > 0 // ✅ 50 > 0 → true → หยุดที่นี่เลย
? "qr" // ← ได้ "qr" ทันที
: (data.cashIncome ?? 0) > 0 // ไม่มาถึงตรงนี้แล้ว
? "cash"
...

ตัวอย่างเช่น qr=50, cash=30
qrIncome=50 → 50 > 0 = true → method = "qr" ✅ หยุด
cashIncome=30 → ไม่ถูกเช็คเลย ❌

⚠️ นี่คือ bug ที่ซ่อนอยู่ — ถ้า user จ่ายทั้ง QR และ cash ในรอบเดียว LINE จะแสดงแค่ "QR" ทั้งที่จริงมีทั้งสองวิธี
