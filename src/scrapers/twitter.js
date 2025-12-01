const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

function convertToFxTwitter(url) {
  // Convert twitter.com or x.com URLs to fxtwitter.com for better scraping
  return url
    .replace(/(?:twitter\.com|x\.com)/i, 'fxtwitter.com');
}

function extractTweetId(url) {
  const match = url.match(/status\/(\d+)/);
  return match ? match[1] : null;
}

async function scrapeTwitter(url) {
  try {
    const tweetId = extractTweetId(url);

    // Try fxtwitter first - it's designed for embedding and has good meta tags
    const fxUrl = convertToFxTwitter(url);

    const response = await axios.get(fxUrl, {
      headers: HEADERS,
      timeout: 10000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);

    // Get image - fxtwitter provides good og:image tags
    let image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('meta[name="twitter:image:src"]').attr('content') ||
      null;

    // Get tweet text as name
    let name =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      'Twitter Post';

    // Get description (usually the tweet text)
    let description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    // Clean up - fxtwitter sometimes adds prefixes
    name = name.replace(/^.*?:\s*/, '').trim();

    // Use description as name if name is too generic
    if (name.length < 10 && description.length > name.length) {
      name = description;
    }

    // Truncate if too long
    if (name.length > 100) {
      name = name.substring(0, 97) + '...';
    }

    return {
      success: true,
      source: 'twitter',
      data: {
        image,
        name,
        description,
        tweetId,
        originalUrl: url
      }
    };
  } catch (error) {
    // If fxtwitter fails, try vxtwitter
    try {
      const vxUrl = url.replace(/(?:twitter\.com|x\.com)/i, 'vxtwitter.com');

      const response = await axios.get(vxUrl, {
        headers: HEADERS,
        timeout: 10000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);

      let image = $('meta[property="og:image"]').attr('content');
      let name = $('meta[property="og:description"]').attr('content') || 'Twitter Post';
      let description = name;

      if (name.length > 100) {
        name = name.substring(0, 97) + '...';
      }

      return {
        success: true,
        source: 'twitter',
        data: {
          image,
          name,
          description,
          tweetId: extractTweetId(url),
          originalUrl: url
        }
      };
    } catch (fallbackError) {
      return {
        success: false,
        source: 'twitter',
        error: error.message,
        data: null
      };
    }
  }
}

module.exports = { scrapeTwitter };
