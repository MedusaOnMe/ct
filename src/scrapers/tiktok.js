const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

async function scrapeTikTok(url) {
  try {
    const response = await axios.get(url, {
      headers: HEADERS,
      timeout: 10000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);

    // Try multiple methods to get thumbnail
    let image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('video').attr('poster') ||
      null;

    // Get title/caption
    let name =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      'TikTok Video';

    // Get description
    let description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    // Try to extract view count from the page
    // TikTok embeds JSON data in script tags
    let views = null;
    const scripts = $('script').toArray();
    for (const script of scripts) {
      const content = $(script).html();
      if (content && content.includes('playCount')) {
        try {
          const match = content.match(/"playCount"\s*:\s*(\d+)/);
          if (match) {
            views = parseInt(match[1], 10);
            break;
          }
        } catch (e) {
          // Continue if parsing fails
        }
      }
    }

    // Clean up the name - remove " | TikTok" suffix
    name = name.replace(/\s*\|\s*TikTok.*$/i, '').trim();

    // Truncate if too long
    if (name.length > 100) {
      name = name.substring(0, 97) + '...';
    }

    return {
      success: true,
      source: 'tiktok',
      data: {
        image,
        name,
        description,
        views,
        originalUrl: url
      }
    };
  } catch (error) {
    return {
      success: false,
      source: 'tiktok',
      error: error.message,
      data: null
    };
  }
}

module.exports = { scrapeTikTok };
