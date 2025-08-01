
import { ProcessedDataItem } from "./types";

export class MarketDataProcessorService {
    public async processChartData(rawData: any[]): Promise<ProcessedDataItem[]> {
        const now = new Date();
        const { parseFMPEasternTimestamp } = await import("@/lib/timezone");

        return rawData
            .map((item: any): ProcessedDataItem | null => {
                const fmpTimestamp = item.date || item.datetime || item.timestamp;
                if (!fmpTimestamp) return null;

                try {
                    const utcDate = parseFMPEasternTimestamp(fmpTimestamp);
                    if (utcDate > now) return null;

                    // Coerce prices to numbers to avoid string issues in calculations
                    const openPrice = Number(item.open) || 0;
                    const closePrice = Number(item.close) || 0;
                    const price = closePrice; 

                    return {
                        timestamp: utcDate.getTime(),
                        price,
                        openPrice,
                        closePrice,
                        utcDate: utcDate.toISOString()
                    };
                } catch (error) {
                    return null;
                }
            })
            .filter((item): item is ProcessedDataItem => item !== null)
            .sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Calculate percentage change for the most recent trading day
     * 
     * PRODUCTION-GRADE: Uses America/New_York timezone for trading day boundaries
     * instead of UTC to ensure correct calculations for a global brokerage platform.
     * 
     * Trading day boundaries:
     * - Trading day starts at 00:00 America/New_York time
     * - Trading day ends at 23:59 America/New_York time
     * - Accounts for DST transitions automatically
     */
    public calculatePercentageFromData(processedData: ProcessedDataItem[]): number | undefined {
        if (processedData.length === 0) return undefined;

        const mostRecentDate = processedData[processedData.length - 1].utcDate;
        
        // Get the start of the most recent trading day in America/New_York timezone
        const mostRecentTradingDay = this.getStartOfTradingDayInMarketTimezone(new Date(mostRecentDate));

        // Filter data to only include items from the same trading day
        const singleDayData = processedData.filter((item) => {
            const itemDate = new Date(item.utcDate);
            const itemTradingDay = this.getStartOfTradingDayInMarketTimezone(itemDate);
            return itemTradingDay.getTime() === mostRecentTradingDay.getTime();
        });

        if (singleDayData.length >= 2) {
            const firstCandle = singleDayData[0];
            const lastCandle = singleDayData[singleDayData.length - 1];

            const openingPrice = firstCandle.openPrice || firstCandle.price;
            const closingPrice = lastCandle.closePrice || lastCandle.price;

            if (openingPrice === 0) {
                return undefined;
            }

            return ((closingPrice - openingPrice) / openingPrice) * 100;
        }

        return undefined;
    }

    /**
     * Get the start of a trading day in America/New_York timezone
     * 
     * This function converts a UTC date to the start of the trading day
     * in America/New_York timezone, accounting for DST transitions.
     * 
     * @param utcDate - UTC date to convert
     * @returns Date object representing 00:00 America/New_York time for the trading day
     */
    private getStartOfTradingDayInMarketTimezone(utcDate: Date): Date {
        // Extract the date components in America/New_York timezone
        const easternParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(utcDate);
        
        const easternYear = parseInt(easternParts.find(part => part.type === 'year')?.value || '0');
        const easternMonth = parseInt(easternParts.find(part => part.type === 'month')?.value || '0');
        const easternDay = parseInt(easternParts.find(part => part.type === 'day')?.value || '0');
        
        // Create a new date representing 00:00 America/New_York time
        // This automatically handles DST transitions
        const easternDate = new Date(easternYear, easternMonth - 1, easternDay);
        
        // Convert back to UTC for consistent comparison
        // Get the timezone offset in minutes for this specific date
        const offsetMinutes = this.getTimezoneOffsetMinutes(easternDate, 'America/New_York');
        
        // Create UTC date by subtracting the offset
        const utcTradingDayStart = new Date(easternDate.getTime() - (offsetMinutes * 60 * 1000));
        
        return utcTradingDayStart;
    }

    /**
     * Get timezone offset in minutes for a specific timezone at a given date
     * 
     * @param date - Date to get offset for
     * @param timezone - Timezone identifier (e.g., 'America/New_York')
     * @returns Offset in minutes (positive for timezones ahead of UTC)
     */
    private getTimezoneOffsetMinutes(date: Date, timezone: string): number {
        try {
            // Use Intl.DateTimeFormat to get the correct timezone offset
            const formatter = new Intl.DateTimeFormat('en', {
                timeZone: timezone,
                timeZoneName: 'longOffset'
            });
            
            const parts = formatter.formatToParts(date);
            const offsetPart = parts.find(part => part.type === 'timeZoneName');
            
            if (offsetPart && offsetPart.value.match(/GMT([+-]\d{2}):(\d{2})/)) {
                const match = offsetPart.value.match(/GMT([+-])(\d{2}):(\d{2})/);
                const sign = match![1] === '+' ? 1 : -1;
                const hours = parseInt(match![2]);
                const minutes = parseInt(match![3]);
                return sign * (hours * 60 + minutes);
            }
            
            // Fallback method: use the difference between local and target timezone
            const utcTime = date.getTime();
            const targetTime = new Date(date.toLocaleString('en-US', { timeZone: timezone })).getTime();
            const offsetMs = targetTime - utcTime;
            return Math.round(offsetMs / (1000 * 60));
        } catch (error) {
            console.warn(`Failed to get timezone offset for ${timezone}`, error);
            return 0;
        }
    }
}
