const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

async function scrapeOG(url) {
  try {
    const response = await axios.get(url, {
      headers: HEADERS,
      timeout: 10000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);

    // Try multiple image sources in order of preference
    let image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[property="og:image:url"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('meta[name="twitter:image:src"]').attr('content') ||
      $('link[rel="image_src"]').attr('href') ||
      $('meta[itemprop="image"]').attr('content') ||
      null;

    // If still no image, try to find the first significant image on the page
    if (!image) {
      const imgs = $('img[src]').toArray();
      for (const img of imgs) {
        const src = $(img).attr('src');
        const width = parseInt($(img).attr('width') || '0', 10);
        const height = parseInt($(img).attr('height') || '0', 10);

        // Skip tiny images (likely icons/logos)
        if ((width > 200 || height > 200) || (!width && !height && src)) {
          // Skip data URIs and tracking pixels
          if (src && !src.startsWith('data:') && !src.includes('pixel') && !src.includes('tracking')) {
            image = src;
            break;
          }
        }
      }
    }

    // Make relative URLs absolute
    if (image && !image.startsWith('http')) {
      try {
        image = new URL(image, url).href;
      } catch {
        // Keep as-is if URL construction fails
      }
    }

    // Get title from various sources
    let name =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('meta[name="title"]').attr('content') ||
      $('title').text() ||
      'Untitled';

    // Get description
    let description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    // Get site name
    let siteName =
      $('meta[property="og:site_name"]').attr('content') ||
      '';

    // Clean up name - remove common suffixes
    name = name
      .replace(/\s*[-|]\s*[^-|]+$/, '') // Remove " - Site Name" or " | Site Name"
      .trim();

    // Truncate if too long
    if (name.length > 100) {
      name = name.substring(0, 97) + '...';
    }

    return {
      success: true,
      source: 'og',
      data: {
        image,
        name,
        description,
        siteName,
        originalUrl: url
      }
    };
  } catch (error) {
    return {
      success: false,
      source: 'og',
      error: error.message,
      data: null
    };
  }
}

module.exports = { scrapeOG };
