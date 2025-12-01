const SOURCES = {
  TIKTOK: 'tiktok',
  YOUTUBE: 'youtube',
  TWITTER: 'twitter',
  INSTAGRAM: 'instagram',
  REDDIT: 'reddit',
  UNKNOWN: 'unknown'
};

const SOURCE_PATTERNS = [
  { pattern: /tiktok\.com|vm\.tiktok\.com/i, source: SOURCES.TIKTOK },
  { pattern: /youtube\.com|youtu\.be/i, source: SOURCES.YOUTUBE },
  { pattern: /twitter\.com|x\.com/i, source: SOURCES.TWITTER },
  { pattern: /instagram\.com/i, source: SOURCES.INSTAGRAM },
  { pattern: /reddit\.com|redd\.it/i, source: SOURCES.REDDIT },
];

function detectSource(url) {
  try {
    const urlObj = new URL(url);
    const fullUrl = urlObj.href;

    for (const { pattern, source } of SOURCE_PATTERNS) {
      if (pattern.test(fullUrl)) {
        return source;
      }
    }

    return SOURCES.UNKNOWN;
  } catch (error) {
    return SOURCES.UNKNOWN;
  }
}

module.exports = { detectSource, SOURCES };
