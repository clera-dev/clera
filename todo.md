# Notes to track to-do list

# 3/30/2025
* Add functionality to "Investments" tab:
    * Create a new branch called "feature/portfolio-monitorig"
        *  This is where we'll show the typical portfolio admin stuff (as minimal as possible)
        *  Including: portfolio value over time, sector breakdown, security breakdown, etc.
        * Will have a button that says "add to your portfolio" and it'll take them to the investments page
        * In the portfolio page, when they click on their assets, they'll be able to sell their securities if they want (notional amount) - this is the only place they can do that since they can't short stocks (so it won't be an option within the Investments Page)
        * Most of this functionality will likely come from Alpaca and financialmodelingprep
    * Create new branch called "feature/trade-execution" (might already be created)
        * In a new tab called "Investments" we'll show a news summary related to their portoflio + markets, and we'll make functionality to be able to purchase stocks manually 
        * When they search for a stock, they'll be able to "Invest" (not buy or sell, only invest option)
        * *might have to make another branch called "feature/news-summary" to make things separate