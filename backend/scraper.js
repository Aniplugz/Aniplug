import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';
import { Router } from 'express';
import redis from 'ioredis';
import axios from 'axios';
import { createCipheriv, randomBytes } from 'crypto';
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey === process.env.API_SECRET_KEY) {
    next();
  } else {
    res.status(403).json({ error: 'Invalid API key' });
  }
};
const router = Router();
const redisClient = new redis();
puppeteer.use(StealthPlugin());

// Enhanced Security Bypass Configuration
const SCRAPE_CONFIG = {
  site: 'https://hianime.to',
  cacheTTL: 1800, // 30 minutes (video links expire quickly)
  proxyPool: [
    'socks5://user:pass@residential.proxy1:9050',
    'socks5://user:pass@residential.proxy2:9050'
  ],
  evasionTactics: {
    viewports: [
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 }
    ],
    userAgents: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
    ]
  }
};

// Encryption for sensitive data
const encryptEmbed = (url) => {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', 
    Buffer.from(process.env.ENCRYPTION_KEY), iv);
  return iv.toString('hex') + ':' + 
    cipher.update(url, 'utf8', 'hex') + 
    cipher.final('hex');
};

// Advanced Browser Configuration
const createStealthBrowser = async () => {
  const proxy = SCRAPE_CONFIG.proxyPool[
    Math.floor(Math.random() * SCRAPE_CONFIG.proxyPool.length)
  ];
  
  return puppeteer.launch({
    headless: "new",
    executablePath: executablePath(),
    args: [
      `--proxy-server=${proxy}`,
      '--no-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
};

// Enhanced Cloudflare Bypass
const bypassProtection = async (page) => {
  await page.setJavaScriptEnabled(true);
  await page.setRequestInterception(true);
  
  // Block unnecessary resources
  page.on('request', (req) => {
    if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  // Randomize browser fingerprint
  await page.setViewport(
    SCRAPE_CONFIG.evasionTactics.viewports[
      Math.floor(Math.random() * SCRAPE_CONFIG.evasionTactics.viewports.length)
    ]
  );
  await page.setUserAgent(
    SCRAPE_CONFIG.evasionTactics.userAgents[
      Math.floor(Math.random() * SCRAPE_CONFIG.evasionTactics.userAgents.length)
    ]
  );

  // Bypass automation detection
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
  });
};

// Enhanced Embed Extraction
router.get('/scrape/embeds', apiKeyAuth, async (req, res) => {
  try {
    const browser = await createStealthBrowser();
    const page = await browser.newPage();
    
    await bypassProtection(page);
    await page.goto(SCRAPE_CONFIG.site, {
      waitUntil: 'networkidle2',
      timeout: 90000,
      referer: 'https://www.google.com/'
    });

    // Dynamic Link Discovery
    const videoLinks = await page.$$eval(
      'a[href*="/watch/"], div[data-video-id]',
      elements => elements.map(el => 
        el.href || el.dataset.videoUrl
      ).filter(Boolean).slice(0, 10)
    );

    // Advanced CDN Extraction
    const embeds = [];
    for (const link of videoLinks) {
      const videoPage = await browser.newPage();
      try {
        await bypassProtection(videoPage);
        await videoPage.goto(link, {
          waitUntil: 'networkidle0',
          timeout: 60000
        });

        // Multi-Layer Extraction
        const embedData = await videoPage.evaluate(() => {
          const iframe = document.querySelector('iframe#main-iframe');
          const video = document.querySelector('video');
          return {
            iframeSrc: iframe?.src,
            videoSrc: video?.src,
            metaScripts: Array.from(document.scripts)
              .filter(script => script.src.includes('stream'))
              .map(script => script.src)
          };
        });

        // Process CDN patterns
        const sources = [
          embedData.iframeSrc,
          embedData.videoSrc,
          ...embedData.metaScripts
        ].filter(src => src && (
          src.includes('streamtape') || 
          src.includes('dood') ||
          src.includes('vidcloud')
        ));

        if(sources.length > 0) {
          embeds.push({
            source: link,
            encryptedEmbed: encryptEmbed(sources[0]),
            cdn: sources[0].match(/https?:\/\/(www\.)?([^\/]+)/)[2],
            expiresAt: Date.now() + 3600000 // 1 hour
          });
        }
      } finally {
        await videoPage.close();
      }
    }

    await browser.close();
    
    // Cache with rotating keys
    await redisClient.setex(
      `embeds:${Date.now()}`, 
      SCRAPE_CONFIG.cacheTTL,
      JSON.stringify(embeds)
    );

    res.json({
      success: true,
      data: embeds.map(e => ({
        ...e,
        encryptedEmbed: undefined,
        proxyUrl: `/proxy/embed?token=${e.encryptedEmbed}`
      }))
    });

  } catch (error) {
    console.error(`Nuclear scraping error: ${error.message}`);
    res.status(500).json({
      error: 'Scraping failed',
      details: error.message,
      retryIn: 30000
    });
  }
});

// Military-Grade Proxy Endpoint
router.get('/proxy/embed', apiKeyAuth, async (req, res) => {
  try {
    const { token } = req.query;
    // Decryption logic here
    
    const finalUrl = decryptedUrl + 
      `?referer=${encodeURIComponent(SCRAPE_CONFIG.site)}` +
      `&secret=${Date.now().toString(36)}`;

    const response = await axios.get(finalUrl, {
      headers: {
        'User-Agent': SCRAPE_CONFIG.evasionTactics.userAgents[
          Math.floor(Math.random() * SCRAPE_CONFIG.evasionTactics.userAgents.length)
        ],
        'X-Forwarded-For': require('uuid').v4(),
        'Accept-Encoding': 'gzip, deflate, br'
      },
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 400
    });

    res.set({
      'Content-Security-Policy': "default-src 'none'",
      'Referrer-Policy': 'no-referrer'
    }).send(response.data);

  } catch (error) {
    res.status(500).json({
      error: 'Proxy failed',
      details: error.message,
      rotation: `${SCRAPE_CONFIG.proxyPool.length} proxies remaining`
    });
  }
});

export default router;