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
    # NOTE: Excluded symbols that have/had stock ticker conflicts:
    #   - SOL: ReneSola Ltd (NYSE)
    #   - APE: AMC Preferred Equity Units (NYSE, traded 2022-2024)
    'BTC', 'ETH', 'ADA', 'DOGE', 'XRP', 'LTC', 'DOT', 'MATIC',
    'AVAX', 'ATOM', 'XLM', 'ALGO', 'UNI', 'AAVE', 'SHIB', 'FTM',
    'CRV', 'MKR', 'SUSHI', 'YFI', 'ENJ',
    'GRT', 'AXS', 'BAT',
    # Stablecoins (no stock ticker conflicts)
    'USDC', 'USDT', 'DAI', 'BUSD',
})

# Crypto exchanges where we can trust that holdings are crypto
# even if SnapTrade returns wrong security_type
# CRITICAL: Use lowercase for case-insensitive matching
CRYPTO_EXCHANGES_LOWERCASE = frozenset({
    'coinbase', 'coinbase pro', 'coinbase advanced', 'coinbase prime',
    'kraken', 'gemini', 'binance', 'binance.us', 'binance us',
    'ftx', 'crypto.com', 'blockfi', 'celsius', 'nexo',
    'robinhood crypto', 'webull crypto',
})

def is_crypto_exchange(institution_name: str) -> bool:
    """
    Check if an institution is a crypto exchange.
    Uses case-insensitive partial matching to handle variations like:
    - 'Coinbase' vs 'COINBASE' vs 'Coinbase Advanced'
    """
    if not institution_name:
        return False
    name_lower = institution_name.lower().strip()
    # Exact match first
    if name_lower in CRYPTO_EXCHANGES_LOWERCASE:
        return True
    # Partial match for variations (e.g., 'Coinbase - Pro' would match 'coinbase')
    for exchange in CRYPTO_EXCHANGES_LOWERCASE:
        if exchange in name_lower or name_lower in exchange:
            return True
    return False

# Keep legacy frozenset for backward compatibility (deprecated)
CRYPTO_EXCHANGES = frozenset({
    'Coinbase', 'Coinbase Pro', 'Kraken', 'Gemini', 'Binance', 'Binance.US',
    'FTX', 'Crypto.com', 'BlockFi', 'Celsius', 'Nexo',
})

