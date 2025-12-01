require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { scrapeUrl } = require('./scrapers');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({
    name: 'CoinThis API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      'POST /scrape': 'Scrape metadata from any URL',
      'POST /launch': 'Scrape + launch coin (pump.fun integration coming soon)'
    }
  });
});

// Scrape endpoint - just returns the scraped metadata
app.post('/scrape', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log(`[API] Scraping URL: ${url}`);
    const result = await scrapeUrl(url);

    if (!result.success) {
      return res.status(422).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[API] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Launch endpoint - scrape + launch coin
// TODO: Add pump.fun integration
app.post('/launch', async (req, res) => {
  try {
    const { url, ticker } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    if (!ticker) {
      return res.status(400).json({
        success: false,
        error: 'Ticker is required'
      });
    }

    // Validate ticker format (alphanumeric, 1-10 chars)
    if (!/^[A-Za-z0-9]{1,10}$/.test(ticker)) {
      return res.status(400).json({
        success: false,
        error: 'Ticker must be 1-10 alphanumeric characters'
      });
    }

    console.log(`[API] Launching coin - URL: ${url}, Ticker: ${ticker}`);

    // Step 1: Scrape the URL
    const scrapeResult = await scrapeUrl(url);

    if (!scrapeResult.success) {
      return res.status(422).json({
        success: false,
        error: 'Failed to scrape URL',
        details: scrapeResult.error
      });
    }

    // Step 2: TODO - Launch on pump.fun
    // For now, return what we would send to pump.fun
    const coinData = {
      ticker: ticker.toUpperCase(),
      name: scrapeResult.data.name,
      image: scrapeResult.data.image,
      description: scrapeResult.data.description || `Coined from ${scrapeResult.source}`,
      source: scrapeResult.source,
      originalUrl: url
    };

    // Placeholder response until pump.fun integration is added
    return res.json({
      success: true,
      message: 'Scrape successful - pump.fun integration pending',
      coinData,
      // pumpUrl: 'https://pump.fun/XXXXX' // Will be returned once integrated
    });
  } catch (error) {
    console.error('[API] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[CoinThis] Server running on port ${PORT}`);
  console.log(`[CoinThis] Endpoints:`);
  console.log(`  POST /scrape - Scrape metadata from any URL`);
  console.log(`  POST /launch - Scrape + launch coin`);
});
