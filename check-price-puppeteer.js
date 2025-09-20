/**
 * check-price-puppeteer.js
 * 使用 Puppeteer 无头浏览器访问 Spaceship 域名搜索页，检查是否包含目标价格片段。
 * 支持配置文件和域名过滤功能
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// 加载配置文件
const configPath = path.resolve(process.cwd(), 'config.json');
let config;

try {
  const configContent = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configContent);
  console.log('✅ 配置文件加载成功');
} catch (error) {
  console.error('❌ 配置文件加载失败:', error.message);
  console.log('使用默认配置...');
  
  // 默认配置
  config = {
    scan: {
      start: 112509,
      end: 112510,
      concurrency: 1,
      timeoutMs: 30000,
      targetSnippet: "is available",
      saveOk: false
    },
    filter: {
      skipNumbers: [],
      skipPatterns: []
    },
    output: {
      resultFile: "found_0_67.md",
      errorFile: "errors.log"
    },
    browser: {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1366, height: 900, deviceScaleFactor: 1 },
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8"
      }
    },
    delays: {
      minJitter: 200,
      maxJitter: 600,
      pageLoadMin: 300,
      pageLoadMax: 900,
      waitForContent: 12000
    }
  };
}

// 从配置中提取变量
const { scan, filter, output, browser, delays } = config;
const { start: START, end: END, concurrency: CONCURRENCY, timeoutMs: TIMEOUT_MS, targetSnippet: TARGET_SNIPPET, saveOk: SAVE_OK } = scan;
const { skipNumbers: SKIP_NUMBERS, skipPatterns: SKIP_PATTERNS } = filter;
const { resultFile: outFile, errorFile: errFile } = output;

const outputFile = path.resolve(process.cwd(), outFile);
const errorFile = path.resolve(process.cwd(), errFile);

/**
 * 检查域名是否应该被跳过
 * @param {number} n 域名数字
 * @returns {boolean} true表示跳过，false表示不跳过
 */
function shouldSkipDomain(n) {
  const domainStr = n.toString();
  
  // 检查是否包含需要跳过的数字
  for (const skipNum of SKIP_NUMBERS) {
    if (domainStr.includes(skipNum.toString())) {
      return true;
    }
  }
  
  // 检查是否匹配需要跳过的正则模式
  for (const pattern of SKIP_PATTERNS) {
    try {
      const regex = new RegExp(pattern);
      if (regex.test(domainStr)) {
        return true;
      }
    } catch (error) {
      console.warn(`⚠️ 无效的正则模式: ${pattern}`);
    }
  }
  
  return false;
}

function buildUrl(n) {
  return `https://www.spaceship.com/domain-search/?query=${n}.xyz&beast=false&tab=domains`;
}

function sleep(ms) { 
  return new Promise(r => setTimeout(r, ms)); 
}

function jitter(min, max) { 
  return Math.floor(Math.random() * (max - min + 1)) + min; 
}

function appendLine(file, line) { 
  fs.appendFileSync(file, line + '\n', 'utf8'); 
}

async function newPage(browserInstance) {
  const page = await browserInstance.newPage();
  
  // 设置用户代理
  await page.setUserAgent(browser.userAgent);
  
  // 设置请求头
  await page.setExtraHTTPHeaders(browser.headers);
  
  // 设置视窗大小
  await page.setViewport(browser.viewport);
  
  // 减少被动暴露
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // 简单补充常见属性
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3] });
  });
  
  return page;
}

async function checkOne(browserInstance, n, existingDomains) {
  const url = buildUrl(n);
  const page = await newPage(browserInstance);
  
  try {
    await page.goto('https://www.spaceship.com/', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_MS
    });
    
    await sleep(jitter(delays.pageLoadMin, delays.pageLoadMax));
    
    const resp = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_MS
    });

    const status = resp ? resp.status() : 0;

    // 等待价格元素加载
    try {
      await page.waitForSelector('[class*="price"]', { timeout: 10000 });
    } catch (e) {
      // 如果没有找到价格元素，继续
    }
    
    // 额外等待确保价格完全加载
    await sleep(8000);
    
    const html = await page.content();
    
    // 只检查是否包含"is available"
    const isAvailable = html.includes('is available');
    const hit = isAvailable;
    
    if (hit) {
      // 检查是否已存在，避免重复
      if (!existingDomains.has(n.toString())) {
        appendLine(outputFile, `## [${n}.xyz](${url})`);
        existingDomains.add(n.toString()); // 添加到已存在列表
        return { n, url, hit: true, status, saved: true };
      } else {
        return { n, url, hit: true, status, saved: false, duplicate: true };
      }
    }
    
    // 命中失败但状态为 OK 且开启 SAVE_OK，也写入
    if (!hit && status === 200 && SAVE_OK) {
      appendLine(outputFile, url);
      return { n, url, hit: false, status, saved: true };
    }
    
    return { n, url, hit: false, status, saved: false };
  } catch (e) {
    appendLine(errorFile, `[${new Date().toISOString()}] ${url} -> ${e.message}`);
    return { n, url, error: e.message, status: -1 };
  } finally {
    await page.close().catch(() => {});
    await sleep(jitter(delays.minJitter, delays.maxJitter));
  }
}

async function run() {
  // 不清理结果文件，只清理错误日志
  try { fs.unlinkSync(errorFile); } catch {}
  
  // 读取现有结果文件，获取已存在的域名列表
  let existingDomains = new Set();
  try {
    const existingContent = fs.readFileSync(outputFile, 'utf8');
    const matches = existingContent.match(/\[(\d+)\.xyz\]/g);
    if (matches) {
      matches.forEach(match => {
        const domain = match.match(/\[(\d+)\.xyz\]/)[1];
        existingDomains.add(domain);
      });
    }
    console.log(`📋 已存在 ${existingDomains.size} 个域名记录`);
  } catch (e) {
    console.log('📄 创建新的结果文件');
  }

  // 生成域名数字列表并应用过滤
  const allNumbers = Array.from({ length: END - START + 1 }, (_, i) => START + i);
  const numbers = allNumbers.filter(n => !shouldSkipDomain(n));
  
  const skippedCount = allNumbers.length - numbers.length;
  if (skippedCount > 0) {
    console.log(`🚫 已跳过 ${skippedCount} 个域名（包含数字: ${SKIP_NUMBERS.join(', ')}）`);
  }

  // GitHub Actions/无头环境运行参数
  const isWin = process.platform === 'win32';
  const isLinux = process.platform === 'linux';
  const launchOpts = {
    headless: 'new',
    args: [
      // 通用稳定化
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      // Linux（含 GitHub Actions）无沙箱
      ...(isLinux ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
      // Windows 本地不要使用 --single-process，易崩溃
      // 适度降低资源占用
      '--js-flags=--max-old-space-size=256'
    ],
  };

  const browserInstance = await puppeteer.launch(launchOpts);

  let idx = 0;
  let hits = 0;
  let processed = 0;
  let skipped = 0;
  const total = numbers.length;

  async function worker(id) {
    while (idx < numbers.length) {
      const cur = idx++;
      const n = numbers[cur];
      
      const r = await checkOne(browserInstance, n, existingDomains);
      if (r.hit) {
        if (r.duplicate) {
          console.log(`${n}.xyz  命中 (重复跳过)`);
        } else {
          hits++;
          console.log(`${n}.xyz  命中`);
        }
      } else {
        console.log(`${n}.xyz  未命中`);
      }
      processed++;
    }
  }

  console.log(`Puppeteer 扫描开始：${START}-${END}，并发=${CONCURRENCY}，总计=${total}${skippedCount > 0 ? ` (跳过${skippedCount}个)` : ''}`);
  
  if (SKIP_NUMBERS.length > 0) {
    console.log(`🔍 过滤规则：跳过包含数字 [${SKIP_NUMBERS.join(', ')}] 的域名`);
  }
  
  const t0 = Date.now();
  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
  await Promise.all(workers);
  const ms = Date.now() - t0;
  
  await browserInstance.close();
  
  console.log(`完成。命中=${hits}，用时=${(ms/1000).toFixed(1)}s`);
  console.log(`命中结果：${outputFile}`);
  console.log(`错误日志：${errorFile}`);
}

run().catch(err => {
  console.error('运行失败：', err);
  process.exit(1);
});