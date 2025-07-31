
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
                        utcDate
                    };
                } catch (error) {
                    return null;
                }
            })
            .filter((item): item is ProcessedDataItem => item !== null)
            .sort((a, b) => a.timestamp - b.timestamp);
    }

    public calculatePercentageFromData(processedData: ProcessedDataItem[]): number | undefined {
        if (processedData.length === 0) return undefined;

        const mostRecentDate = processedData[processedData.length - 1].utcDate;
        const mostRecentTradingDay = new Date(mostRecentDate);
        mostRecentTradingDay.setUTCHours(0, 0, 0, 0);

        const singleDayData = processedData.filter((item) => {
            const itemDate = new Date(item.utcDate);
            itemDate.setUTCHours(0, 0, 0, 0);
            return itemDate.getTime() === mostRecentTradingDay.getTime();
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
}
