require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bs58 = require('bs58');
const { scrapeUrl } = require('./scrapers');

// Validate Solana wallet address
function isValidSolanaAddress(address) {
  try {
    const decoded = bs58.decode(address);
    return decoded.length === 32;
  } catch {
    return false;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (Railway, Heroku, etc.) to get real client IP
app.set('trust proxy', 1);

// Rate limiting - 1 request per 90 seconds per IP
const limiter = rateLimit({
  windowMs: 90 * 1000, // 90 seconds
  max: 1, // 1 request per window
  message: 'Too many requests. Wait 90 seconds between launches.',
  standardHeaders: true,
  legacyHeaders: false,
});

// In-memory request log (keeps last 100)
const requestLog = [];
const MAX_LOG_SIZE = 100;

function logRequest(entry) {
  requestLog.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (requestLog.length > MAX_LOG_SIZE) requestLog.pop();
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.text()); // Accept plain text too

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

    logRequest({
      endpoint: '/scrape',
      ip: req.ip,
      url,
      success: result.success,
      source: result.source || null
    });

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
app.post('/launch', limiter, async (req, res) => {
  try {
    // Handle both JSON and text bodies (Shortcuts can send either)
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.type('text/plain').status(400).send(`Error: Invalid JSON\nReceived: ${body.substring(0, 200)}`);
      }
    }

    // Trim whitespace from all inputs (Shortcuts can add newlines)
    const wallet = (body.wallet || '').toString().trim();
    const url = (body.url || '').toString().trim();
    const ticker = (body.ticker || '').toString().trim();
    const name = (body.name || '').toString().trim();

    // Validate wallet if provided
    if (wallet && !isValidSolanaAddress(wallet)) {
      return res.type('text/plain').status(400).send('Error: Invalid Solana wallet address');
    }

    // Validation
    if (!url) {
      return res.type('text/plain').status(400).send('Error: URL is required');
    }

    if (!ticker) {
      return res.type('text/plain').status(400).send('Error: Ticker is required');
    }

    if (!name) {
      return res.type('text/plain').status(400).send('Error: Name is required');
    }

    // Validate ticker format (alphanumeric, 1-10 chars)
    if (!/^[A-Za-z0-9]{1,10}$/.test(ticker)) {
      return res.type('text/plain').status(400).send(`Error: Ticker must be 1-10 letters/numbers, no spaces\nReceived: "${ticker}" (${ticker.length} chars)`);
    }

    // Validate name (max 30 chars)
    if (name.length > 30) {
      return res.type('text/plain').status(400).send('Error: Name must be 30 characters or less');
    }

    console.log(`[API] Launching coin - URL: ${url}, Ticker: ${ticker}, Name: ${name}, Wallet: ${wallet || 'none'}`);

    // Step 1: Scrape the URL
    const scrapeResult = await scrapeUrl(url);

    if (!scrapeResult.success) {
      return res.type('text/plain').status(422).send(`Error: Couldn't fetch that URL\n${scrapeResult.error}`);
    }

    // Step 2: TODO - Launch on pump.fun
    const coinData = {
      ticker: ticker.toUpperCase(),
      name: name.substring(0, 30),
      image: scrapeResult.data.image,
      description: scrapeResult.data.description || `Coined from ${scrapeResult.source}`,
      source: scrapeResult.source,
      originalUrl: url,
      wallet: wallet || null
    };

    logRequest({
      endpoint: '/launch',
      ip: req.ip,
      wallet: wallet || null,
      url,
      ticker: ticker.toUpperCase(),
      name: coinData.name,
      image: coinData.image,
      success: true,
      source: scrapeResult.source
    });

    // Human-readable response
    const walletLine = wallet ? `\nCreator Wallet: ${wallet.slice(0, 4)}...${wallet.slice(-4)}` : '';
    const response = `
COIN LAUNCHED

Name: ${coinData.name}
Ticker: $${coinData.ticker}
Source: ${coinData.source}${walletLine}
`.trim();

    return res.type('text/plain').send(response);
  } catch (error) {
    console.error('[API] Error:', error);
    return res.type('text/plain').status(500).send(`Error: Something went wrong\n${error.message}`);
  }
});

// Admin endpoint - view recent requests
app.get('/admin', (req, res) => {
  const stats = {
    totalRequests: requestLog.length,
    byEndpoint: {},
    bySource: {},
    byIP: {},
    recentLaunches: requestLog.filter(r => r.endpoint === '/launch').slice(0, 10)
  };

  requestLog.forEach(r => {
    stats.byEndpoint[r.endpoint] = (stats.byEndpoint[r.endpoint] || 0) + 1;
    if (r.source) {
      stats.bySource[r.source] = (stats.bySource[r.source] || 0) + 1;
    }
    if (r.ip) {
      stats.byIP[r.ip] = (stats.byIP[r.ip] || 0) + 1;
    }
  });

  res.json({
    name: 'CoinThis Admin',
    uptime: process.uptime(),
    stats,
    recentRequests: requestLog.slice(0, 50)
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[CoinThis] Server running on port ${PORT}`);
  console.log(`[CoinThis] Endpoints:`);
  console.log(`  POST /scrape - Scrape metadata from any URL`);
  console.log(`  POST /launch - Scrape + launch coin`);
});
