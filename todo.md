# Notes to track to-do list

## 3/21/2025
High priority:
* branch name: "bug/deployed-account-info"
    * for some reason, the deployed app.askclera.com/chat functionality doesn't load and nor does the user's alpaca account info
    * need to check LangGraph + vercel + browser console + AWS logs to figure out what the issue is
    * symptoms of issue:
        * not only does the chat page load infinitely, but in the invest page, you cannot make trades or see your current cash balance (available to invest)

Low priority:

* Add functionality to "Investments" tab:
    * Create a new branch called "feature/portfolio-monitorig"
        *  This is where we'll show the typical portfolio admin stuff (as minimal as possible)
        *  Including: portfolio value over time, sector breakdown, security breakdown, etc.
        * Will have a button that says "add to your portfolio" and it'll take them to the investments page
        * In the portfolio page, when they click on their assets, they'll be able to sell their securities if they want (notional amount) - this is the only place they can do that since they can't short stocks (so it won't be an option within the Investments Page)
        * Most of this functionality will likely come from Alpaca and financialmodelingprep
