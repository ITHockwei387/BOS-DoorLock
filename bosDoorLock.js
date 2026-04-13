// bosMiddleware_DOORLOCK.js
// 满金门锁 · 易经密码 — BaZi 喜用神 → 吉祥数字
// Replaces golden card (奇门) logic with BaZi lucky number logic

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

// ============================================================
// BOS API CONFIGURATION
// ============================================================
const BOS_CONFIG = {
  BASE_URL: 'https://uw94o7zg99.execute-api.ap-southeast-1.amazonaws.com',
  API_KEY: 'kYREincZNh9ZUAZsk8tiP',
  SECRET: 'XGyzi3O2JIldnV4ugLbGb',
  ORIGIN: 'https://mandarin.club',
  REPORT_ID: '龍巖風水八字命盤.八字資訊',   // ← Changed to BaZi endpoint
  IP: '74.220.52.2'
};

// ============================================================
// 易经五行数字映射
// ============================================================
const WUXING_NUMBERS = {
  '水': [1, 6],
  '火': [2, 7],
  '木': [3, 8],
  '金': [4, 9],
  '土': [5]
};

// All possible Chinese characters that map to each element
// (covers both 天干 and 地支 representations)
const WUXING_CHAR_MAP = {
  // 水
  '水': '水', '壬': '水', '癸': '水', '子': '水', '亥': '水',
  // 火
  '火': '火', '丙': '火', '丁': '火', '午': '火', '巳': '火',
  // 木
  '木': '木', '甲': '木', '乙': '木', '寅': '木', '卯': '木',
  // 金
  '金': '金', '庚': '金', '辛': '金', '申': '金', '酉': '金',
  // 土
  '土': '土', '戊': '土', '己': '土', '丑': '土', '辰': '土', '未': '土', '戌': '土'
};

// ============================================================
// GENERATE BOS API SIGNATURE
// ============================================================
function generateBOSSignature(timestamp, method, path, ip) {
  const message = `${timestamp}\r\n${method}\r\n${path}\r\n${ip}`;
  return crypto
    .createHmac('sha256', BOS_CONFIG.SECRET)
    .update(message)
    .digest('hex');
}

// ============================================================
// CALL BOS BAZI API
// ============================================================
async function callBOSBaziAPI(nameCn, datetime, gender) {
  try {
    const timestamp = Date.now().toString();
    const method = 'POST';
    const path = `/api/report/${BOS_CONFIG.REPORT_ID}`;

    const signature = generateBOSSignature(timestamp, method, path, BOS_CONFIG.IP);

    console.log('🔐 BOS BaZi API Request:');
    console.log('   DateTime:', datetime);
    console.log('   Gender:', gender);

    const url = BOS_CONFIG.BASE_URL + encodeURI(path);
    const headers = {
      'Timestamp': timestamp,
      'Authorization': `TOKEN ${signature}`,
      'Api-Key': BOS_CONFIG.API_KEY,
      'Origin': BOS_CONFIG.ORIGIN,
      'Content-Type': 'application/json'
    };

    const payload = { name_cn: nameCn, datetime, gender };

    const response = await axios.post(url, payload, {
      headers,
      timeout: 15000
    });

    console.log('📥 BOS BaZi Response status:', response.status);

    return { success: true, html: response.data };

  } catch (error) {
    console.error('❌ BOS BaZi API Error:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================
// PARSE 喜用神 FROM BOS HTML RESPONSE
//
// The HTML contains lines like:
//   天干用神：土金
//   地支用神：土金
//
// Strategy: search for these exact labels and extract the
// element characters that follow them.
// ============================================================
function parseXiYongShen(html) {
  const result = {
    tianGanYongShen: null,   // 天干用神
    diZhiYongShen: null,     // 地支用神
    raw: null
  };

  if (!html || typeof html !== 'string') return result;

  // Store raw snippet for debugging
  const debugMatch = html.match(/[天地][干支]用神[：:].{0,20}/g);
  result.raw = debugMatch ? debugMatch.join(' | ') : 'not found';

  // ── Pattern 1: 天干用神：土金  (colon variants, optional spaces)
  const tianGanMatch = html.match(/天干用神\s*[：:]\s*([^\s<\n\r,，]{1,20})/);
  const diZhiMatch   = html.match(/地支用神\s*[：:]\s*([^\s<\n\r,，]{1,20})/);

  if (tianGanMatch) result.tianGanYongShen = tianGanMatch[1].trim();
  if (diZhiMatch)   result.diZhiYongShen   = diZhiMatch[1].trim();

  // ── Pattern 2: fallback — search for 喜用神 block
  if (!result.tianGanYongShen && !result.diZhiYongShen) {
    const xiyongMatch = html.match(/喜用神\s*[：:]\s*([^\s<\n\r,，]{1,20})/);
    if (xiyongMatch) {
      result.tianGanYongShen = xiyongMatch[1].trim();
      result.diZhiYongShen   = xiyongMatch[1].trim();
    }
  }

  console.log('🔍 Parsed 喜用神:');
  console.log('   天干用神:', result.tianGanYongShen);
  console.log('   地支用神:', result.diZhiYongShen);
  console.log('   Raw match:', result.raw);

  return result;
}

// ============================================================
// EXTRACT UNIQUE WUXING ELEMENTS FROM 用神 STRING
// e.g. "土金" → ['土','金']
//      "水"   → ['水']
//      "甲乙" → ['木']  (via char map)
// ============================================================
function extractWuxingElements(yongShenStr) {
  if (!yongShenStr) return [];

  const elements = new Set();

  for (const char of yongShenStr) {
    const wuxing = WUXING_CHAR_MAP[char];
    if (wuxing) elements.add(wuxing);
  }

  return Array.from(elements);
}

// ============================================================
// COMBINE 天干 + 地支 用神 → UNIQUE WUXING LIST
// ============================================================
function getLuckyWuxing(tianGan, diZhi) {
  const combined = new Set();

  extractWuxingElements(tianGan).forEach(e => combined.add(e));
  extractWuxingElements(diZhi).forEach(e => combined.add(e));

  return Array.from(combined);
}

// ============================================================
// WUXING → LUCKY NUMBERS
// e.g. ['土','金'] → [5, 4, 9]
// ============================================================
function getLuckyNumbers(wuxingList) {
  const numbers = [];
  for (const element of wuxingList) {
    const nums = WUXING_NUMBERS[element] || [];
    nums.forEach(n => {
      if (!numbers.includes(n)) numbers.push(n);
    });
  }
  return numbers.sort((a, b) => a - b);
}

// ============================================================
// GENERATE 4-DIGIT LUCKY CODE COMBINATIONS
// Produces 6 random unique 4-digit combinations using the lucky numbers
// ============================================================
function generateLuckyCodes(numbers, count = 6) {
  if (!numbers || numbers.length === 0) return [];

  const codes = new Set();
  const maxAttempts = 200;
  let attempts = 0;

  while (codes.size < count && attempts < maxAttempts) {
    attempts++;
    const code = Array.from({ length: 4 }, () =>
      numbers[Math.floor(Math.random() * numbers.length)]
    ).join('');
    codes.add(code);
  }

  // If we still don't have enough, generate sequentially
  if (codes.size < count && numbers.length > 0) {
    for (let i = 1111; i <= 9999 && codes.size < count; i++) {
      const digits = String(i).split('');
      if (digits.every(d => numbers.includes(parseInt(d)))) {
        codes.add(String(i));
      }
    }
  }

  return Array.from(codes).slice(0, count);
}

// ============================================================
// MAIN CALCULATION — wraps everything
// ============================================================
async function calculateLuckyNumbers(nameCn, datetime, gender) {
  const bosResult = await callBOSBaziAPI(nameCn, datetime, gender);

  if (!bosResult.success) {
    return {
      success: false,
      error: bosResult.error,
      fallback: true
    };
  }

  const parsed = parseXiYongShen(bosResult.html);

  const wuxingList  = getLuckyWuxing(parsed.tianGanYongShen, parsed.diZhiYongShen);
  const numbers     = getLuckyNumbers(wuxingList);
  const codes       = generateLuckyCodes(numbers);

  console.log('🎯 Calculation Result:');
  console.log('   天干用神:', parsed.tianGanYongShen);
  console.log('   地支用神:', parsed.diZhiYongShen);
  console.log('   五行元素:', wuxingList.join(', '));
  console.log('   吉祥数字:', numbers.join(', '));
  console.log('   组合示例:', codes.join(' · '));

  return {
    success: true,
    tianGanYongShen: parsed.tianGanYongShen || '未知',
    diZhiYongShen:   parsed.diZhiYongShen   || '未知',
    wuxingList,
    numbers,
    codes,
    rawDebug: parsed.raw
  };
}

// ============================================================
// API ENDPOINT  POST /api/calculate_lucky_numbers
// ============================================================
app.post('/api/calculate_lucky_numbers', async (req, res) => {
  try {
    console.log('\n🎯 DoorLock Lucky Number Request');
    console.log('   Order ID:', req.body.shopify_order_id);

    const wallets = req.body.wallets || [];
    const results = [];

    for (const wallet of wallets) {
      console.log(`\n🚪 Processing wallet #${wallet.walletNum}`);
      console.log('   Recipient:', wallet.recipient);
      console.log('   DateTime:', wallet.datetime);
      console.log('   Gender:', wallet.gender);

      const calc = await calculateLuckyNumbers(
        wallet.name_cn || wallet.recipient,
        wallet.datetime,
        wallet.gender
      );

      results.push({
        walletNum:       wallet.walletNum,
        recipient:       wallet.recipient,
        birthday:        wallet.birthday,
        birthtime:       wallet.birthtime,
        // Core results
        tianGanYongShen: calc.tianGanYongShen,
        diZhiYongShen:   calc.diZhiYongShen,
        wuxingList:      calc.wuxingList      || [],
        numbers:         calc.numbers         || [],
        codes:           calc.codes           || [],
        success:         calc.success,
        error:           calc.error           || null
      });

      // Avoid hammering the API
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    res.json({ success: true, results });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Health check
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: '满金门锁 · 易经密码 Middleware',
    version: '2.0.0',
    endpoint: 'POST /api/calculate_lucky_numbers'
  });
});

// ── IP check
app.get('/check-ip', async (req, res) => {
  try {
    const r = await axios.get('https://api.ipify.org?format=json');
    res.json({ server_ip: r.data.ip });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 满金门锁 Middleware`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Endpoint: POST /api/calculate_lucky_numbers`);
});
