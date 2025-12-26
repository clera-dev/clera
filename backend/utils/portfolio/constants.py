"""
Shared constants for portfolio-related services.

This module centralizes constants used across multiple portfolio services
to ensure consistency and prevent DRY violations.
"""

# UNAMBIGUOUS_CRYPTO: Cryptocurrency symbols that are NEVER valid US stock tickers
# These can be safely classified as crypto regardless of what security_type says.
#
# IMPORTANT: Do NOT add symbols that also exist as US stock/ETF tickers:
#   - SAND: Sandstorm Gold (NYSE)
#   - COMP: Compass, Inc. (NYSE)  
#   - SNX: TD SYNNEX Corporation (S&P 500)
#   - UST: ProShares Ultra 7-10 Year Treasury ETF
#   - MANA: Mainstay CBRE Global Infrastructure Megatrends Fund
#
# For ambiguous symbols, rely on the existing classify_asset() fallback
# which uses security_type and security_name to disambiguate.
UNAMBIGUOUS_CRYPTO = frozenset({
    # Major cryptocurrencies (no stock ticker conflicts)
    # NOTE: SOL is excluded - ReneSola Ltd (NYSE: SOL) is a valid stock
    'BTC', 'ETH', 'ADA', 'DOGE', 'XRP', 'LTC', 'DOT', 'MATIC',
    'AVAX', 'ATOM', 'XLM', 'ALGO', 'UNI', 'AAVE', 'SHIB', 'FTM',
    'APE', 'CRV', 'MKR', 'SUSHI', 'YFI', 'ENJ',
    'GRT', 'AXS', 'BAT',
    # Stablecoins (no stock ticker conflicts)
    'USDC', 'USDT', 'DAI', 'BUSD',
})

# Crypto exchanges where we can trust that holdings are crypto
# even if SnapTrade returns wrong security_type
CRYPTO_EXCHANGES = frozenset({
    'Coinbase', 'Coinbase Pro', 'Kraken', 'Gemini', 'Binance', 'Binance.US',
    'FTX', 'Crypto.com', 'BlockFi', 'Celsius', 'Nexo',
})

