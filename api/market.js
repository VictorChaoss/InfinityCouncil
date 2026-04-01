export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { ticker = 'BTC' } = req.query;
  const sym = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');

  try {
    const base = 'https://fapi.binance.com';

    const [priceRes, fundingRes, oiRes] = await Promise.all([
      fetch(`${base}/fapi/v1/ticker/24hr?symbol=${sym}USDT`),
      fetch(`${base}/fapi/v1/fundingRate?symbol=${sym}USDT&limit=1`),
      fetch(`${base}/fapi/v1/openInterest?symbol=${sym}USDT`),
    ]);

    if (!priceRes.ok) {
      return res.status(404).json({ error: `No perps market found for ${sym}USDT on Binance` });
    }

    const [priceData, fundingData, oiData] = await Promise.all([
      priceRes.json(),
      fundingRes.json(),
      oiRes.json(),
    ]);

    const price = parseFloat(priceData.lastPrice);
    const change24h = parseFloat(priceData.priceChangePercent);
    const volume24h = parseFloat(priceData.quoteVolume);
    const fundingRate = fundingData?.[0]?.fundingRate
      ? (parseFloat(fundingData[0].fundingRate) * 100).toFixed(4)
      : null;
    const openInterest = oiData?.openInterest
      ? parseFloat(oiData.openInterest)
      : null;

    res.status(200).json({
      symbol: `${sym}USDT`,
      price: price.toLocaleString('en-US', { maximumFractionDigits: 2 }),
      change24h: change24h.toFixed(2),
      volume24h: (volume24h / 1e6).toFixed(1) + 'M',
      fundingRate: fundingRate ? fundingRate + '%' : 'N/A',
      openInterest: openInterest
        ? (openInterest * price / 1e6).toFixed(1) + 'M USD'
        : 'N/A',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
