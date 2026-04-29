const axios = require("axios");

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// ══════════════════════════════════════════════
//  ส่ง Push Message
// ══════════════════════════════════════════════
const pushMessage = async (lineUserId, messages) => {
  if (!lineUserId || !LINE_TOKEN) return;
  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/push",
      { to: lineUserId, messages },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LINE_TOKEN}`,
        },
      }
    );
    console.log(`📨 LINE sent → ${lineUserId}`);
  } catch (e) {
    // ไม่ throw — ไม่ให้กระทบ income record
    console.error("❌ LINE push failed:", e.response?.data || e.message);
  }
};

// ══════════════════════════════════════════════
//  Flex Message
// ══════════════════════════════════════════════
const buildIncomeMessage = ({
  deviceName,
  method,
  price,
  branchId,
  createdAt,
}) => {
  const methodMap = {
    qr: { label: "QR Code", color: "#00B900", icon: "📱" },
    cash: { label: "เงินสด", color: "#f59e0b", icon: "💵" },
    coin: { label: "เหรียญ", color: "#6366f1", icon: "🪙" },
  };
  const m = methodMap[method] || { label: method, color: "#888", icon: "💰" };

  const timeStr = createdAt
    ? new Date(createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
    : new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });

  return {
    type: "flex",
    altText: `💰 มีเงินเข้า ${Number(
      price
    ).toLocaleString()} บาท — ${deviceName}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#00B900",
        paddingAll: "16px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "💰", size: "xl", flex: 0 },
              {
                type: "text",
                text: "มีรายได้เข้า",
                color: "#ffffff",
                size: "lg",
                weight: "bold",
                margin: "sm",
              },
            ],
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          // ─ เครื่อง
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "เครื่อง",
                color: "#888888",
                size: "sm",
                flex: 3,
              },
              {
                type: "text",
                text: deviceName,
                weight: "bold",
                size: "sm",
                flex: 5,
                wrap: true,
              },
            ],
          },
          // ─ สาขา
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "สาขา",
                color: "#888888",
                size: "sm",
                flex: 3,
              },
              { type: "text", text: branchId || "-", size: "sm", flex: 5 },
            ],
          },
          // ─ ช่องทาง
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "ช่องทาง",
                color: "#888888",
                size: "sm",
                flex: 3,
              },
              {
                type: "text",
                text: `${m.icon} ${m.label}`,
                color: m.color,
                weight: "bold",
                size: "sm",
                flex: 5,
              },
            ],
          },
          { type: "separator" },
          // ─ จำนวนเงิน
          {
            type: "box",
            layout: "horizontal",
            alignItems: "center",
            contents: [
              {
                type: "text",
                text: "จำนวนเงิน",
                color: "#888888",
                size: "sm",
                flex: 3,
              },
              {
                type: "text",
                text: `${Number(price).toLocaleString("th-TH")} บาท`,
                size: "xl",
                weight: "bold",
                color: "#00B900",
                flex: 5,
              },
            ],
          },
          // ─ เวลา
          {
            type: "text",
            text: timeStr,
            color: "#aaaaaa",
            size: "xs",
            align: "end",
          },
        ],
      },
    },
  };
};

module.exports = { pushMessage, buildIncomeMessage };
