const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

function getJsonUrl(url) {
  // Convert Reddit URL to JSON API endpoint
  try {
    const urlObj = new URL(url);
    // Remove trailing slash and add .json
    let path = urlObj.pathname.replace(/\/$/, '');
    return `https://www.reddit.com${path}.json`;
  } catch {
    return null;
  }
}

async function scrapeReddit(url) {
  try {
    // Try the JSON API first
    const jsonUrl = getJsonUrl(url);

    if (jsonUrl) {
      try {
        const response = await axios.get(jsonUrl, {
          headers: HEADERS,
          timeout: 10000
        });

        const data = response.data;
        let post = null;

        // Handle different response structures
        if (Array.isArray(data) && data[0]?.data?.children?.[0]?.data) {
          post = data[0].data.children[0].data;
        } else if (data?.data?.children?.[0]?.data) {
          post = data.data.children[0].data;
        }

        if (post) {
          // Get image - check various Reddit image fields
          let image =
            post.url_overridden_by_dest ||
            post.thumbnail ||
            post.preview?.images?.[0]?.source?.url ||
            null;

          // Decode HTML entities in image URL
          if (image) {
            image = image.replace(/&amp;/g, '&');
          }

          // Skip "self", "default", "nsfw" thumbnails
          if (image && ['self', 'default', 'nsfw', 'spoiler', 'image'].includes(image)) {
            image = post.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&') || null;
          }

          // Get title
          let name = post.title || 'Reddit Post';

          // Get selftext as description
          let description = post.selftext || '';

          // Truncate if too long
          if (name.length > 100) {
            name = name.substring(0, 97) + '...';
          }

          return {
            success: true,
            source: 'reddit',
            data: {
              image,
              name,
              description,
              subreddit: post.subreddit,
              upvotes: post.ups,
              originalUrl: url
            }
          };
        }
      } catch (jsonError) {
        // Fall through to HTML scraping
      }
    }

    // Fallback to HTML scraping
    const response = await axios.get(url, {
      headers: HEADERS,
      timeout: 10000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);

    let image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      null;

    let name =
      $('meta[property="og:title"]').attr('content') ||
      $('title').text() ||
      'Reddit Post';

    let description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    // Clean up name
    name = name.replace(/\s*:\s*Reddit.*$/i, '').trim();

    if (name.length > 100) {
      name = name.substring(0, 97) + '...';
    }

    return {
      success: true,
      source: 'reddit',
      data: {
        image,
        name,
        description,
        originalUrl: url
      }
    };
  } catch (error) {
    return {
      success: false,
      source: 'reddit',
      error: error.message,
      data: null
    };
  }
}

module.exports = { scrapeReddit };
