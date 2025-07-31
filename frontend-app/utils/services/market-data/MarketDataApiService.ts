
export class MarketDataApiService {
    public async fetchChartData(symbol: string, fromDate: Date, toDate: Date): Promise<any> {
        const formatDateSafe = (date: Date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const fromStr = formatDateSafe(fromDate);
        const toStr = formatDateSafe(toDate);

        // SECURITY: Properly encode the symbol to prevent URL injection attacks
        const encodedSymbol = encodeURIComponent(symbol);

        const response = await fetch(`/api/fmp/chart/${encodedSymbol}?interval=5min&from=${fromStr}&to=${toStr}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch chart data: ${response.status}`);
        }

        return await response.json();
    }
}
