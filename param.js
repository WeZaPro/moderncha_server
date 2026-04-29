// {
//     "MAC": 93200354603008,          // หมายเลขประจำตัวเครื่อง (Hardware Address)
//     "update": "20Dec24",            // วันที่อัปเดตซอฟต์แวร์ล่าสุด
//     "chip": 1,                      // ชนิดชิป [Range: 0-255]
//     "HMI": “HDMI”,                   // ประเภทจออินเตอร์เฟส [HDMI, CYD]
//     "machine_system": "CATCARWASH", // ชื่อระบบเครื่อง [CATCARWASH, CATPAW]
//     "Flash": "4096KB",              // ขนาดหน่วยความจำหลัก (หน่วย: KB)
//     "OTASize": "1920KB",            // ขนาดพื้นที่ OTA (หน่วย: KB)
//     "ver": "3.05",                  // เวอร์ชันซอฟต์แวร์ปัจจุบัน
//     "ssid": "CCW@CAT",              // ชื่อ WiFi (ความยาว 1-32 ตัวอักษร)
//     "wfpwd": "ccw@1234",            // รหัสผ่าน WiFi (ความยาว 8-64 ตัวอักษร)
//     "fnTime": "15,12,12,12,20,15,15,10,600", // เวลาทำงานแต่ละฟังก์ชัน [0-3600 วินาที] *CATCARWASH: [Wax, Tire, Vac, Air, Foam, Water, Spray, Frag, Timeout] *CATPAW: [Dust, Bact, UV, Ozone, Dry, Perfume, NaN, NaN, Timeout]
//     "fnEnable": [false, false, false, false, false, false, false, false], // สถานะเปิด/ปิดฟังก์ชัน
//     "fnOrder": [0, 1, 2, 3, 4, 5, 6, 7], // ลำดับการจัดเรียงฟังก์ชัน [Range: 0-7]
//     "machineActive": true,          // สถานะพร้อมใช้งาน
//     "multiMode": false,             // โหมดรับชำระหลายประเภท
//     "heartbeatInv": 900,            // รอบส่งสัญญาณ Heartbeat [Range: 30-3600 วินาที]
//     "scrRotate": 0,                 // การหมุนหน้าจอ [0, 90, 180, 270 องศา]
//     "bankAccept": true,             // การรับธนบัตร
//     "coinAccept": true,             // การรับเหรียญ
//     "qrAccept": true,               // การรับ QR Code
//     "startPrices": 1,               // ราคาเริ่มต้น [Range: 1-999 บาท]
//     "lastMoney": 29,                // เงินค้างล่าสุด [Range: 0-9999 บาท]
//     "proMo": 0,                     // เลขดัชนีโปรโมชั่น [Range: 0-10]
//     "virtualMoney": 29,             // เงินสะสม [Range: 0-9999 บาท]
//     "startTimeout": 1200,           // เวลาตัดการทำงานหากไม่กดเริ่ม [Range: 10-3600 วินาที]
//     "moneyMemActive": true,         // ระบบจำยอดเงินค้างเมื่อไฟดับ
//     "billType": "Unknow",           // ชนิดธนบัตรที่รับล่าสุด
//     "pricesList": "\u0000\u0000",   // ชุดรายการราคา
//     "ResetReason": "SW RST",        // สาเหตุการ Reset ล่าสุด
//     "dateTime": "08-04-2026 08:25:40", // วันเวลาปัจจุบัน (Format: DD-MM-YYYY HH:mm:ss)
//     "lastedUpdate": "10-04-2026 11:13:30", // วันเวลาที่ Sync ข้อมูลล่าสุด
//     "lastedMaintenance": "10-04-2026", // วันที่ซ่อมบำรุงล่าสุด (Format: DD-MM-YYYY)
//     "debug": true,                  // โหมดทดสอบสำหรับช่าง
//     "current_state": "IDLE",        // สถานะเครื่อง [IDLE, PAYMENT, READY, OPERATION, FINISH]
//     "delay_time": [0, 0, 0, 0, 0, 0, 0, 0], // เวลาหน่วง [0-600 วินาที] [Update, Response, Standby, Cancel, Finish, Nan, Nan, Nan]
//     "water_level": [false, false, false, false, false, false], // ระดับน้ำในถัง (6 จุดวัด)
//     "sensor": [false, false]        // สถานะเซนเซอร์ [Door sensor, Light sensor]
//   }
