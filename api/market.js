export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { ticker = 'BTC' } = req.query;
  const sym = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Map common tickers to CoinGecko IDs
  const geckoIds = {
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
    BNB: 'binancecoin', DOGE: 'dogecoin', XRP: 'ripple',
    ADA: 'cardano', AVAX: 'avalanche-2', LINK: 'chainlink',
    DOT: 'polkadot', MATIC: 'matic-network', UNI: 'uniswap',
    LTC: 'litecoin', ATOM: 'cosmos', NEAR: 'near', SUI: 'sui',
    APT: 'aptos', ARB: 'arbitrum', OP: 'optimism', INJ: 'injective-protocol',
    SEI: 'sei-network', TIA: 'celestia', WIF: 'dogwifcoin', BONK: 'bonk',
    PEPE: 'pepe', SHIB: 'shiba-inu',
  };

  const geckoId = geckoIds[sym];
  if (!geckoId) {
    return res.status(404).json({ error: `No market data available for ${sym}` });
  }

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
      { headers: { Accept: 'application/json' } }
    );
    const data = await response.json();
    const d = data[geckoId];
    if (!d) return res.status(404).json({ error: `No data returned for ${sym}` });

    const price = d.usd;
    const change24h = d.usd_24h_change?.toFixed(2) ?? '0.00';
    const vol24h = d.usd_24h_vol ? (d.usd_24h_vol / 1e6).toFixed(0) + 'M' : 'N/A';
    const mcap = d.usd_market_cap ? (d.usd_market_cap / 1e9).toFixed(1) + 'B' : 'N/A';

    res.status(200).json({
      symbol: sym,
      price: price >= 1000
        ? Math.round(price).toLocaleString('en-US')
        : price.toFixed(4),
      change24h,
      volume24h: vol24h,
      marketCap: mcap,
      // Funding rate not available from CoinGecko — note this clearly
      fundingRate: 'Use Coinglass for live funding rate',
      openInterest: 'Use Coinglass for live OI',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
