const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

function convertToDDInstagram(url) {
  // Convert instagram.com URLs to ddinstagram.com for better scraping
  return url.replace(/instagram\.com/i, 'ddinstagram.com');
}

function extractPostId(url) {
  // Match /p/CODE/, /reel/CODE/, /reels/CODE/
  const match = url.match(/(?:\/p\/|\/reel\/|\/reels\/)([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function scrapeInstagram(url) {
  try {
    const postId = extractPostId(url);

    // Try ddinstagram first - designed for embedding
    const ddUrl = convertToDDInstagram(url);

    const response = await axios.get(ddUrl, {
      headers: HEADERS,
      timeout: 10000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);

    // Get image
    let image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      null;

    // Get title/caption
    let name =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      'Instagram Post';

    // Get description
    let description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    // Clean up - remove "on Instagram" and similar suffixes
    name = name
      .replace(/\s*on Instagram.*$/i, '')
      .replace(/\s*\|\s*Instagram.*$/i, '')
      .replace(/^Instagram\s*[-:]\s*/i, '')
      .trim();

    // If name is just a username, use description instead
    if (name.startsWith('@') || name.length < 5) {
      if (description.length > 5) {
        name = description;
      }
    }

    // Truncate if too long
    if (name.length > 100) {
      name = name.substring(0, 97) + '...';
    }

    return {
      success: true,
      source: 'instagram',
      data: {
        image,
        name,
        description,
        postId,
        originalUrl: url
      }
    };
  } catch (error) {
    // Fallback: try the original Instagram URL (usually blocked but worth trying)
    try {
      const response = await axios.get(url, {
        headers: {
          ...HEADERS,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);

      let image = $('meta[property="og:image"]').attr('content');
      let name = $('meta[property="og:title"]').attr('content') || 'Instagram Post';
      let description = $('meta[property="og:description"]').attr('content') || '';

      name = name.replace(/\s*on Instagram.*$/i, '').trim();

      if (name.length > 100) {
        name = name.substring(0, 97) + '...';
      }

      return {
        success: true,
        source: 'instagram',
        data: {
          image,
          name,
          description,
          postId: extractPostId(url),
          originalUrl: url
        }
      };
    } catch (fallbackError) {
      return {
        success: false,
        source: 'instagram',
        error: error.message,
        data: null
      };
    }
  }
}

module.exports = { scrapeInstagram };
