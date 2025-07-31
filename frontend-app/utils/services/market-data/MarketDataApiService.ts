
export class MarketDataApiService {
    public async fetchChartData(symbol: string, fromDate: Date, toDate: Date): Promise<any> {
        const formatDateSafe = (date: Date) => {
            // SECURITY: Format date in Eastern Time to match market timezone
            // This prevents timezone shifts that could request incorrect date ranges
            const easternParts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/New_York',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).formatToParts(date);
            
            const year = easternParts.find(part => part.type === 'year')?.value || '0';
            const month = easternParts.find(part => part.type === 'month')?.value || '0';
            const day = easternParts.find(part => part.type === 'day')?.value || '0';
            
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
