require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bs58 = require('bs58').default;
const { VersionedTransaction, Connection, Keypair } = require('@solana/web3.js');
const { scrapeUrl } = require('./scrapers');

// Solana setup
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const web3Connection = new Connection(RPC_ENDPOINT, 'confirmed');

// Get signer wallet from env
function getSignerWallet() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not set in environment');
  }
  return Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
}

// Download image and convert to Blob
async function downloadImage(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Failed to download image');
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || 'image/png';
  return new Blob([buffer], { type: contentType });
}

// Launch token on pump.fun via PumpPortal
async function launchOnPumpFun(coinData) {
  console.log('[LAUNCH] Starting launch process...');
  console.log('[LAUNCH] Coin data:', JSON.stringify(coinData, null, 2));

  const signerKeyPair = getSignerWallet();
  console.log('[LAUNCH] Signer wallet:', signerKeyPair.publicKey.toBase58());

  const mintKeypair = Keypair.generate();
  console.log('[LAUNCH] Generated mint:', mintKeypair.publicKey.toBase58());

  // Step 1: Download image and upload to IPFS
  console.log('[LAUNCH] Step 1: Downloading image from:', coinData.image);
  const imageBlob = await downloadImage(coinData.image);
  console.log('[LAUNCH] Image downloaded, size:', imageBlob.size);

  const formData = new FormData();
  formData.append('file', imageBlob, 'image.png');
  formData.append('name', coinData.name);
  formData.append('symbol', coinData.ticker);
  formData.append('description', coinData.description);
  formData.append('website', coinData.originalUrl);
  formData.append('showName', 'true');

  console.log('[LAUNCH] Uploading to IPFS...');
  const metadataResponse = await fetch('https://pump.fun/api/ipfs', {
    method: 'POST',
    body: formData,
  });

  if (!metadataResponse.ok) {
    const errorText = await metadataResponse.text();
    console.error('[LAUNCH] IPFS upload failed:', metadataResponse.status, errorText);
    throw new Error(`Failed to upload metadata to IPFS: ${metadataResponse.status} ${errorText}`);
  }

  const metadataJSON = await metadataResponse.json();
  console.log('[LAUNCH] IPFS response:', JSON.stringify(metadataJSON, null, 2));

  // Step 2: Get create transaction from PumpPortal
  console.log('[LAUNCH] Step 2: Getting transaction from PumpPortal...');
  const pumpPortalBody = {
    publicKey: signerKeyPair.publicKey.toBase58(),
    action: 'create',
    tokenMetadata: {
      name: metadataJSON.metadata.name,
      symbol: metadataJSON.metadata.symbol,
      uri: metadataJSON.metadataUri
    },
    mint: mintKeypair.publicKey.toBase58(),
    denominatedInSol: 'true',
    amount: 0, // no dev buy
    slippage: 10,
    priorityFee: 0.0005,
    pool: 'pump'
  };
  console.log('[LAUNCH] PumpPortal request:', JSON.stringify(pumpPortalBody, null, 2));

  const response = await fetch('https://pumpportal.fun/api/trade-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pumpPortalBody)
  });

  if (response.status !== 200) {
    const errorText = await response.text();
    console.error('[LAUNCH] PumpPortal error:', response.status, errorText);
    throw new Error(`PumpPortal error: ${response.status} ${errorText}`);
  }

  // Step 3: Sign and send transaction
  console.log('[LAUNCH] Step 3: Signing and sending transaction...');
  const data = await response.arrayBuffer();
  const tx = VersionedTransaction.deserialize(new Uint8Array(data));
  tx.sign([mintKeypair, signerKeyPair]);

  console.log('[LAUNCH] Sending to Solana...');
  const signature = await web3Connection.sendTransaction(tx);
  console.log('[LAUNCH] Transaction sent! Signature:', signature);

  return {
    signature,
    mint: mintKeypair.publicKey.toBase58(),
    txUrl: `https://solscan.io/tx/${signature}`,
    pumpUrl: `https://pump.fun/${mintKeypair.publicKey.toBase58()}`
  };
}

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

// Serve static files from public folder
app.use(express.static(path.join(__dirname, '../public')));

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
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

    console.log(`[API] ===========================================`);
    console.log(`[API] LAUNCH REQUEST RECEIVED`);
    console.log(`[API] URL: ${url}`);
    console.log(`[API] Ticker: ${ticker}`);
    console.log(`[API] Name: ${name}`);
    console.log(`[API] Wallet: ${wallet || 'none'}`);
    console.log(`[API] ===========================================`);

    // Step 1: Scrape the URL
    const scrapeResult = await scrapeUrl(url);

    if (!scrapeResult.success) {
      return res.type('text/plain').status(422).send(`Error: Couldn't fetch that URL\n${scrapeResult.error}`);
    }

    // Step 2: Launch on pump.fun
    const coinData = {
      ticker: ticker.toUpperCase(),
      name: name.substring(0, 30),
      image: scrapeResult.data.image,
      description: scrapeResult.data.description || `Coined from ${scrapeResult.source}`,
      source: scrapeResult.source,
      originalUrl: url,
      wallet: wallet || null
    };

    let launchResult;
    try {
      launchResult = await launchOnPumpFun(coinData);
    } catch (err) {
      console.error('[API] Pump.fun launch failed:', err);
      return res.type('text/plain').status(500).send(`Error: Failed to launch on pump.fun\n${err.message}`);
    }

    logRequest({
      endpoint: '/launch',
      ip: req.ip,
      wallet: wallet || null,
      url,
      ticker: ticker.toUpperCase(),
      name: coinData.name,
      image: coinData.image,
      success: true,
      source: scrapeResult.source,
      mint: launchResult.mint,
      signature: launchResult.signature
    });

    // Human-readable response
    const walletLine = wallet ? `\nCreator Wallet: ${wallet.slice(0, 4)}...${wallet.slice(-4)}` : '';
    const response = `
COIN LAUNCHED

Name: ${coinData.name}
Ticker: $${coinData.ticker}
CA: ${launchResult.mint}${walletLine}

${launchResult.pumpUrl}
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
