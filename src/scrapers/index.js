const { detectSource, SOURCES } = require('../utils/detect-source');
const { scrapeTikTok } = require('./tiktok');
const { scrapeYouTube } = require('./youtube');
const { scrapeTwitter } = require('./twitter');
const { scrapeInstagram } = require('./instagram');
const { scrapeReddit } = require('./reddit');
const { scrapeOG } = require('./og-fallback');

const SCRAPERS = {
  [SOURCES.TIKTOK]: scrapeTikTok,
  [SOURCES.YOUTUBE]: scrapeYouTube,
  [SOURCES.TWITTER]: scrapeTwitter,
  [SOURCES.INSTAGRAM]: scrapeInstagram,
  [SOURCES.REDDIT]: scrapeReddit,
  [SOURCES.UNKNOWN]: scrapeOG,
};

async function scrapeUrl(url) {
  // Validate URL
  try {
    new URL(url);
  } catch {
    return {
      success: false,
      error: 'Invalid URL provided',
      data: null
    };
  }

  // Detect the source
  const source = detectSource(url);
  console.log(`[Scraper] Detected source: ${source} for URL: ${url}`);

  // Get the appropriate scraper
  const scraper = SCRAPERS[source] || scrapeOG;

  // Run the scraper
  const result = await scraper(url);

  // If platform-specific scraper failed, fall back to OG tags
  if (!result.success && source !== SOURCES.UNKNOWN) {
    console.log(`[Scraper] ${source} scraper failed, falling back to OG tags`);
    const ogResult = await scrapeOG(url);
    if (ogResult.success) {
      return {
        ...ogResult,
        originalSource: source,
        fallback: true
      };
    }
  }

  return result;
}

module.exports = { scrapeUrl, detectSource, SOURCES };
