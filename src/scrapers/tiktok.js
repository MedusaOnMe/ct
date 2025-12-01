const axios = require('axios');

// TikTok's free oEmbed endpoint - no auth required
const OEMBED_URL = 'https://www.tiktok.com/oembed';

async function scrapeTikTok(url) {
  try {
    // Use TikTok's official oEmbed API
    const response = await axios.get(OEMBED_URL, {
      params: { url },
      timeout: 10000
    });

    const data = response.data;

    // oEmbed returns: title, author_name, author_url, thumbnail_url, thumbnail_width, thumbnail_height, etc.
    let name = data.title || 'TikTok Video';

    // Clean up the name - remove common suffixes
    name = name.replace(/\s*#\w+/g, '').trim(); // Remove hashtags from title

    // Truncate if too long
    if (name.length > 100) {
      name = name.substring(0, 97) + '...';
    }

    return {
      success: true,
      source: 'tiktok',
      data: {
        image: data.thumbnail_url || null,
        name,
        description: data.title || '',
        author: data.author_name || null,
        authorUrl: data.author_url || null,
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
