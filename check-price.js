// check-price.js
// 遍历 112500-112599，访问 Spaceship 域名搜索页，检查是否包含目标价格片段
// 命中则写入 found_0_67.txt，错误写入 errors.log

const fs = require('fs');
const path = require('path');

const START = 112500;
const END = 112599;
const CONCURRENCY = 3;           // 并发数（降低，减少风控命中）
const RETRIES = 3;               // 失败重试次数（增加重试）
const TIMEOUT_MS = 20000;        // 单请求超时（延长）
const TARGET_SNIPPET = '<span class="product-price product-price--regular main-result__available__prices__text__purchase">$0.67</span>';

const outFile = path.resolve(process.cwd(), 'found_0_67.txt');
const errFile = path.resolve(process.cwd(), 'errors.log');

function buildUrl(n) {
  // 需求给定格式： https://www.spaceship.com/domain-search/?query={num}.xyz&beast=false&tab=domains
  return `https://www.spaceship.com/domain-search/?query=${n}.xyz&beast=false&tab=domains`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
// 随机抖动
function jitter(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
// 常见桌面浏览器 UA 轮换
const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/124.0.0.0 Chrome/124.0.0.0 Safari/537.36',
];

async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const ua = UAS[Math.floor(Math.random() * UAS.length)];
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Referer': 'https://www.spaceship.com/',
        // 轻量占位 Cookie（非敏感）
        'Cookie': 'landing=1; sspref=domain-search',
      },
      redirect: 'follow',
      signal: ctrl.signal,
      ...options,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function getPageText(url) {
  let attempt = 0;
  while (true) {
    try {
      // 请求前随机等待，避免同质化节奏
      await sleep(jitter(120, 400));
      const res = await fetchWithTimeout(url);
      if (res.status === 403) {
        throw new Error('HTTP 403 (blocked)');
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      // 请求后也稍作随机延迟
      await sleep(jitter(80, 200));
      return text;
    } catch (e) {
      attempt++;
      if (attempt > RETRIES) throw e;
      // 指数退避 + 随机抖动（403 时更长）
      const base = e.message.includes('403') ? 1200 : 700;
      await sleep(base * attempt + jitter(0, 600));
    }
  }
}

function appendLine(file, line) {
  fs.appendFileSync(file, line + '\n', 'utf8');
}

async function processOne(n) {
  const url = buildUrl(n);
  try {
    const html = await getPageText(url);
    if (html.includes(TARGET_SNIPPET)) {
      appendLine(outFile, url);
      return { n, url, hit: true };
    }
    return { n, url, hit: false };
  } catch (err) {
    appendLine(errFile, `[${new Date().toISOString()}] ${url} -> ${err.message}`);
    return { n, url, error: err.message };
  }
}

async function run() {
  try { fs.unlinkSync(outFile); } catch {}
  try { fs.unlinkSync(errFile); } catch {}

  const numbers = Array.from({ length: END - START + 1 }, (_, i) => START + i);

  let idx = 0;
  let hits = 0;

  async function worker(id) {
    while (true) {
      let current;
      // 原子取号
      if (idx >= numbers.length) break;
      current = idx++;
      const n = numbers[current];
      const r = await processOne(n);
      if (r.hit) hits++;
      // 任务间随机停顿，进一步打散节奏
      await sleep(jitter(120, 360));
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
  console.log(`开始扫描：${START}-${END}，并发=${CONCURRENCY} ...`);
  const t0 = Date.now();
  await Promise.all(workers);
  const ms = Date.now() - t0;
  console.log(`完成。命中=${hits}，用时=${(ms / 1000).toFixed(1)}s`);
  console.log(`命中结果写入：${outFile}`);
  console.log(`错误日志写入：${errFile}`);
}

run().catch(e => {
  console.error('运行失败：', e);
  process.exit(1);
});