## Invest Feature (Frontend)

**Date Added:** 2024-07-26

**Overview:**
A new "Invest" section has been added to the frontend application (`frontend-app`) accessible via the main sidebar. This section allows users to search for stocks and view basic company information and analyst price targets.

**Implementation Details:**

1.  **Navigation:**
    *   Added an "Invest" link using the `TrendingUp` icon to `frontend-app/components/MainSidebar.tsx`.
    *   Links to the route `/invest`.

2.  **Page Structure:**
    *   Created the main page component `frontend-app/app/invest/page.tsx`.
    *   This is a client component (`'use client'`) managing the state for the selected stock symbol.
    *   Uses `ScrollArea` for layout.
    *   Includes areas for the search bar and the information display card.
    *   The route `/invest` is automatically protected by the existing Supabase middleware (`frontend-app/middleware.ts`).

3.  **Stock Search (`frontend-app/components/invest/StockSearchBar.tsx`):**
    *   Uses Shadcn UI `Command` and `Popover` components for the search interface.
    *   **Current Data Source:** Uses a *hardcoded, limited list* of popular stock symbols (`popularAssets`) for initial suggestions. This was done for rapid prototyping and to avoid hitting API limits during development.
    *   **Next Step / TODO:** Replace the `popularAssets` mock data with a dynamic fetch from the Alpaca API. The `getAssets` endpoint from the `@alpacahq/alpaca-trade-api` SDK (Trading API, *not* Market Data API for this) should be used to fetch *all* tradable stock assets (`asset_class: 'us_equity', status: 'active'`). This list should ideally be fetched once (e.g., when the component mounts or potentially cached server-side/in localStorage) rather than on every search input change to maintain performance and avoid rate limits. The search logic will then filter this comprehensive list.
    *   Outputs the selected stock symbol to the parent page (`InvestPage`).

4.  **Stock Information (`frontend-app/components/invest/StockInfoCard.tsx`):**
    *   Receives a stock `symbol` prop.
    *   Fetches data from FinancialModelingPrep (FMP) via internal Next.js API routes:
        *   `/api/fmp/profile/[symbol]`: Gets company profile details.
        *   `/api/fmp/price-target/[symbol]`: Gets analyst price target summaries.
    *   Displays data using Shadcn UI `Card`, `Skeleton` (for loading), and `Alert` (for errors).
    *   Includes helper functions for formatting numbers and currency.

5.  **API Routes (FinancialModelingPrep):**
    *   Created secure Next.js API routes to handle FMP requests server-side, protecting the API key:
        *   `frontend-app/app/api/fmp/profile/[symbol]/route.ts`
        *   `frontend-app/app/api/fmp/price-target/[symbol]/route.ts`
    *   These routes use the `FINANCIAL_MODELING_PREP_API_KEY` from `.env.local`.

6.  **Environment Variables:**
    *   Added `NEXT_PUBLIC_APCA_API_KEY_ID`, `NEXT_PUBLIC_APCA_API_SECRET_KEY`, `NEXT_PUBLIC_APCA_PAPER` to `frontend-app/.env.local` for potential future frontend Alpaca SDK usage (though currently search uses mock data).
    *   Added `FINANCIAL_MODELING_PREP_API_KEY` to `frontend-app/.env.local` for use by the server-side API routes.

**Security Considerations:**
*   The FMP API key is securely handled server-side via Next.js API routes.
*   The Alpaca API keys (`NEXT_PUBLIC_...`) are currently configured for potential frontend use but are *not* actively used by the stock search component yet (it uses mock data). If the frontend directly uses these Alpaca keys later (e.g., for fetching the full asset list), be mindful of the security risks of exposing keys client-side in production. Proxying through the backend is recommended for production environments.
