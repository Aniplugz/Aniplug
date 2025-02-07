const HianimeAPI = {  
    // ====== CORE FUNCTIONALITY ====== //  
    getVideoLinks: async (episodeId) => {  
      try {  
        const response = await fetch(`https://hianime-proxy.danbypass[.]to/api?episode=${episodeId}`, {  
          headers: {  
            // Mimic browser requests to avoid blocking  
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',  
            'Referer': 'https://hianime.to/',  
            'X-Bypass-Token': process.env.HIANIME_BYPASS_TOKEN || 'DAN-UNBLOCK-2024'  
          },  
          timeout: 10000 // 10-second timeout  
        });  
  
        if (!response.ok) throw new Error(`HTTP ${response.status}`);  
        
        const data = await response.json();  
        return this.decryptURLs(data); // Process URLs  
      } catch (error) {  
        return this.fallbackScrape(episodeId); // Attempt backup method  
      }  
    },  
  
    // ====== PRIVATE METHODS ====== //  
    decryptURLs: (data) => {  
      // Hypothetical URL decryption (e.g., decode Base64 tokens)  
      return data.links.map(link => ({  
        ...link,  
        url: link.url  
          .replace('/e/', '/d/')  
          .replace('streamtape.com', 'stp.danbypass.to') // Hypothetical proxy  
      }));  
    },  
  
    fallbackScrape: async (episodeId) => {  
      // If the proxy fails, scrape directly from Hianime  
      const { load: $ } = await import('cheerio');  
      const response = await fetch(`https://hianime.to/watch/${episodeId}`);  
      const $page = $(await response.text());  
      
      return $page.find('div.server-item')  
        .map((i, el) => ({  
          server: $(el).attr('data-server-id'),  
          url: $(el).attr('data-embed') + '&bypass=dan'  
        })).get();  
    },  
  
    // ====== UTILITIES ====== //  
    enableBurstMode: false,  
    requestDelay: 1000, // Avoid rate limits  
    lastRequestTime: 0,  
  
    setConfig: (config) => {  
      Object.assign(this, config);  
    }  
  };  
  
  // ====== CACHE LAYER ====== //  
  const cache = new Map();  
  
  HianimeAPI.getVideoLinks = new Proxy(HianimeAPI.getVideoLinks, {  
    apply: async (target, thisArg, args) => {  
      const [episodeId] = args;  
      if (cache.has(episodeId)) return cache.get(episodeId);  
  
      // Rate limiting  
      if (Date.now() - thisArg.lastRequestTime < thisArg.requestDelay && !thisArg.enableBurstMode) {  
        await new Promise(resolve => setTimeout(resolve, thisArg.requestDelay));  
      }  
  
      const result = await target.apply(thisArg, args);  
      cache.set(episodeId, result);  
      thisArg.lastRequestTime = Date.now();  
      return result;  
    }  
  });  
  
  module.exports = HianimeAPI;  