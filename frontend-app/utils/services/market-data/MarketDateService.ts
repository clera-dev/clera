
export class MarketDateService {
    public async calculateDateRange(): Promise<{ fromDate: Date; toDate: Date }> {
        const now = new Date();
        const { default: MarketHolidayUtil } = await import("@/lib/marketHolidays");
        const latestTradingDay = MarketHolidayUtil.getLastTradingDay(now);
        const daysSinceLastTradingDay = (now.getTime() - latestTradingDay.getTime()) / (1000 * 60 * 60 * 24);
        const isUnreasonableFutureDate = daysSinceLastTradingDay > 7;

        let fromDate: Date;
        let toDate: Date;

        if (isUnreasonableFutureDate) {
            fromDate = new Date(latestTradingDay);
            fromDate.setHours(0, 0, 0, 0);
            toDate = new Date(latestTradingDay);
            toDate.setHours(23, 59, 59, 999);
        } else {
            const { chartDate } = this.calculateMarketDate(now, MarketHolidayUtil);

            fromDate = new Date(chartDate);
            fromDate.setHours(0, 0, 0, 0);

            toDate = new Date(chartDate);
            toDate.setHours(23, 59, 59, 999);
        }

        return { fromDate, toDate };
    }

    private calculateMarketDate(now: Date, MarketHolidayUtil: any): { chartDate: Date; isMarketClosed: boolean } {
        const easternHour = parseInt(now.toLocaleString("en-US", {
            timeZone: "America/New_York",
            hour: "2-digit",
            hour12: false
        }));

        const easternMinute = parseInt(now.toLocaleString("en-US", {
            timeZone: "America/New_York",
            minute: "2-digit"
        }));

        const easternParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(now);

        const easternYear = parseInt(easternParts.find(part => part.type === 'year')?.value || '0');
        const easternMonth = parseInt(easternParts.find(part => part.type === 'month')?.value || '0');
        const easternDay = parseInt(easternParts.find(part => part.type === 'day')?.value || '0');

        const marketDate = new Date(easternYear, easternMonth - 1, easternDay);
        const isValidTradingDay = MarketHolidayUtil.isMarketOpen(marketDate);
        const isPreMarket = easternHour < 9 || (easternHour === 9 && easternMinute < 30);

        let chartDate: Date;
        let isMarketClosed: boolean;

        if (isPreMarket || !isValidTradingDay) {
            chartDate = MarketHolidayUtil.getLastTradingDay(marketDate, isValidTradingDay ? 1 : 0);
            isMarketClosed = true;
        } else {
            chartDate = new Date(marketDate);
            chartDate.setHours(0, 0, 0, 0);
            isMarketClosed = false;
        }

        return { chartDate, isMarketClosed };
    }
}
