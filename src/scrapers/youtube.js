const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

function extractVideoId(url) {
  // Handle various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function scrapeYouTube(url) {
  try {
    const videoId = extractVideoId(url);

    const response = await axios.get(url, {
      headers: HEADERS,
      timeout: 10000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);

    // Get high-res thumbnail using video ID if available
    let image = videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : $('meta[property="og:image"]').attr('content');

    // Fallback to OG image if video ID extraction failed
    if (!image) {
      image = $('meta[property="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content');
    }

    // Get title
    let name =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      'YouTube Video';

    // Get description
    let description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    // Try to extract view count from embedded JSON
    let views = null;
    const scripts = $('script').toArray();
    for (const script of scripts) {
      const content = $(script).html();
      if (content && content.includes('viewCount')) {
        try {
          const match = content.match(/"viewCount"\s*:\s*"?(\d+)"?/);
          if (match) {
            views = parseInt(match[1], 10);
            break;
          }
        } catch (e) {
          // Continue if parsing fails
        }
      }
    }

    // Clean up the name - remove " - YouTube" suffix
    name = name.replace(/\s*-\s*YouTube.*$/i, '').trim();

    // Truncate if too long
    if (name.length > 100) {
      name = name.substring(0, 97) + '...';
    }

    return {
      success: true,
      source: 'youtube',
      data: {
        image,
        name,
        description,
        views,
        videoId,
        originalUrl: url
      }
    };
  } catch (error) {
    return {
      success: false,
      source: 'youtube',
      error: error.message,
      data: null
    };
  }
}

module.exports = { scrapeYouTube };
