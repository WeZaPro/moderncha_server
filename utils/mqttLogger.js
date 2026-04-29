// ============================================================
//  mqttLogger.js — Pretty print MQTT messages in Node.js log
//  ใช้งาน: const { logMqtt } = require('./mqttLogger');
// ============================================================

const COLORS = {
  reset:   '\x1b[0m',
  bright:  '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  yellow:  '\x1b[33m',
  green:   '\x1b[32m',
  red:     '\x1b[31m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

// ── icons ตาม topic suffix ──
function topicIcon(topic) {
  if (topic.includes('/data'))            return '📊';
  if (topic.includes('/cmd'))             return '📤';
  if (topic.includes('/cmd_ack'))         return '✅';
  if (topic.includes('/status'))          return '💡';
  if (topic.includes('/state'))           return '🔄';
  if (topic.includes('/payment/request')) return '💳';
  if (topic.includes('/ble_log'))         return '🔵';
  return '📨';
}

// ── format แต่ละ field ──
function fmtValue(key, val) {
  // boolean
  if (typeof val === 'boolean') {
    return val ? c('green', '✓ true') : c('red', '✗ false');
  }
  // array of booleans (water_level, sensor, fn_enable)
  if (Array.isArray(val) && val.every(v => typeof v === 'boolean')) {
    return val.map((v, i) => v ? c('green', `[${i}]✓`) : c('gray', `[${i}]✗`)).join(' ');
  }
  // array of numbers (rates, fnOrder, delay_time)
  if (Array.isArray(val) && val.every(v => typeof v === 'number')) {
    return c('cyan', '[' + val.join(', ') + ']');
  }
  // ENUM strings
  if (['IDLE','PAYMENT','READY','OPERATION','FINISH'].includes(val)) {
    const stateColor = { IDLE:'gray', PAYMENT:'yellow', READY:'green', OPERATION:'cyan', FINISH:'blue' };
    return c(stateColor[val] || 'white', val);
  }
  if (val === 'HDMI' || val === 'CYD')                  return c('magenta', val);
  if (val === 'CATCARWASH' || val === 'CATPAW')          return c('magenta', val);
  // numbers
  if (typeof val === 'number') return c('cyan', String(val));
  // strings
  return c('white', String(val));
}

// ── field label color ──
function fmtKey(key) {
  const important = ['machine_status','current_state','payment_pending','HMI','machine_system'];
  const timing    = ['timer','heartbeat_inv','start_timeout','uptime'];
  const money     = ['min_money','start_prices','pro_mo'];

  if (important.includes(key)) return c('bright',   key.padEnd(18));
  if (timing.includes(key))    return c('yellow',   key.padEnd(18));
  if (money.includes(key))     return c('green',    key.padEnd(18));
  return c('gray', key.padEnd(18));
}

// ── group fields ──
const GROUPS = {
  'Identity':   ['deviceId', 'HMI', 'machine_system'],
  'Status':     ['machine_status', 'current_state', 'payment_pending', 'ble_connected'],
  'Timing':     ['uptime', 'timer', 'heartbeat_inv', 'loop_count'],
  'Money':      ['min_money', 'start_prices', 'pro_mo'],
  'Functions':  ['rates', 'fn_enable', 'fnOrder'],
  'Delays':     ['delay_time'],
  'Sensors':    ['water_level', 'sensor'],
};

// ── main logger ──
function logMqtt(topic, payload) {
  const icon      = topicIcon(topic);
  const topicShort = topic.split('/').slice(-2).join('/');   // เอาแค่ 2 ส่วนท้าย
  const ts        = new Date().toTimeString().slice(0, 8);

  // ── header ──
  console.log(
    c('gray', `[${ts}]`) + ' ' +
    icon + ' ' +
    c('bright', topicShort)
  );

  // ── ถ้าไม่ใช่ /data topic → แสดงแบบ compact ──
  if (!topic.includes('/data')) {
    console.log('  ' + c('gray', JSON.stringify(payload)));
    console.log(c('gray', '─'.repeat(60)));
    return;
  }

  // ── /data topic → pretty print แบบ group ──
  const printed = new Set();

  for (const [groupName, keys] of Object.entries(GROUPS)) {
    const groupFields = keys.filter(k => payload[k] !== undefined);
    if (!groupFields.length) continue;

    console.log('  ' + c('dim', `┌─ ${groupName} `+('─'.repeat(Math.max(0,14-groupName.length)))));
    for (const key of groupFields) {
      console.log('  ' + c('dim','│') + ' ' + fmtKey(key) + ' ' + fmtValue(key, payload[key]));
      printed.add(key);
    }
    console.log('  ' + c('dim', '└' + '─'.repeat(20)));
  }

  // แสดง fields ที่ไม่อยู่ใน group ไหน
  const extras = Object.keys(payload).filter(k => !printed.has(k));
  if (extras.length) {
    console.log('  ' + c('dim', '┌─ Other ─────────────'));
    extras.forEach(key => {
      console.log('  ' + c('dim','│') + ' ' + fmtKey(key) + ' ' + fmtValue(key, payload[key]));
    });
    console.log('  ' + c('dim', '└' + '─'.repeat(20)));
  }

  console.log(c('gray', '─'.repeat(60)));
}

// ── ใช้ใน mqtt config ──
// client.on('message', (topic, buf) => {
//   try {
//     const payload = JSON.parse(buf.toString());
//     logMqtt(topic, payload);
//   } catch { /* non-JSON */ }
// });

module.exports = { logMqtt };
