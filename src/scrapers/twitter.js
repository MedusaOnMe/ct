const axios = require('axios');

function extractTweetId(url) {
  const match = url.match(/status\/(\d+)/);
  return match ? match[1] : null;
}

async function scrapeTwitter(url) {
  try {
    const tweetId = extractTweetId(url);
    if (!tweetId) {
      return {
        success: false,
        source: 'twitter',
        error: 'Could not extract tweet ID from URL',
        data: null
      };
    }

    // Use fxtwitter API for structured data
    const apiUrl = `https://api.fxtwitter.com/status/${tweetId}`;

    const response = await axios.get(apiUrl, {
      timeout: 10000
    });

    const tweet = response.data.tweet;
    if (!tweet) {
      throw new Error('No tweet data returned');
    }

    // Check for media in the tweet first, then fall back to profile pic
    let image = null;

    if (tweet.media && tweet.media.photos && tweet.media.photos.length > 0) {
      // Use first photo from the tweet
      image = tweet.media.photos[0].url;
    } else if (tweet.media && tweet.media.videos && tweet.media.videos.length > 0) {
      // Use video thumbnail
      image = tweet.media.videos[0].thumbnail_url;
    } else {
      // No media - use tweeter's profile pic
      image = tweet.author.avatar_url;
    }

    // Get tweet text
    let name = tweet.text || 'Twitter Post';
    let description = tweet.text || '';

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
        author: tweet.author.screen_name,
        originalUrl: url
      }
    };
  } catch (error) {
    return {
      success: false,
      source: 'twitter',
      error: error.message,
      data: null
    };
  }
}

module.exports = { scrapeTwitter };
