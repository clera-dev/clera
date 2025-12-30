"""
Trading Calendar Utility

Production-grade utility for determining market open/close days.
Follows industry standards used by Alpaca, Interactive Brokers, etc.

CRITICAL: Markets are CLOSED on:
- Weekends (Saturday/Sunday)
- US Federal Holidays (New Year's, MLK Day, Presidents Day, Good Friday, Memorial Day, 
  Independence Day, Labor Day, Thanksgiving, Christmas)
- Early close days (half days)
"""

import logging
from datetime import date, datetime, time
from typing import Optional
import pytz

logger = logging.getLogger(__name__)


class TradingCalendar:
    """
    Production-grade trading calendar for US stock markets.
    
    Features:
    - Weekend detection
    - US market holiday detection
    - Market hours validation (9:30 AM - 4:00 PM EST)
    - Early close detection (1:00 PM EST on half days)
    """
    
    def __init__(self):
        """Initialize trading calendar."""
        self.est = pytz.timezone('US/Eastern')
        self.market_open_time = time(9, 30)
        self.market_close_time = time(16, 0)
        self.early_close_time = time(13, 0)
        
        # Cache for holiday calculations
        self._holiday_cache = {}
    
    def is_market_open_today(self, check_date: Optional[date] = None) -> bool:
        """
        Check if the market is open on a given date.
        
        Args:
            check_date: Date to check (default: today)
            
        Returns:
            True if market is open, False if closed (weekend/holiday)
        """
        if check_date is None:
            check_date = datetime.now(self.est).date()
        
        # Check if weekend
        if check_date.weekday() >= 5:  # Saturday=5, Sunday=6
            return False
        
        # Check if holiday
        if self.is_market_holiday(check_date):
            return False
        
        return True
    
    def is_market_open_now(self) -> bool:
        """
        Check if the market is currently open (both day AND time).
        
        Returns:
            True if market is open right now (trading day + within market hours)
        """
        now = datetime.now(self.est)
        
        # First check if it's a trading day
        if not self.is_market_open_today(now.date()):
            return False
        
        # Check if within market hours (9:30 AM - 4:00 PM ET)
        current_time = now.time()
        
        # Check if early close day
        if self.is_early_close_day(now.date()):
            return self.market_open_time <= current_time < self.early_close_time
        
        return self.market_open_time <= current_time < self.market_close_time
    
    # NOTE: is_early_close_day() is defined later in this file (line ~319)
    # It uses _get_nth_weekday() which is more robust than a separate helper
    
    def is_market_holiday(self, check_date: date) -> bool:
        """
        Check if a date is a US market holiday.
        
        Args:
            check_date: Date to check
            
        Returns:
            True if market holiday, False otherwise
        """
        # Check cache first
        if check_date in self._holiday_cache:
            return self._holiday_cache[check_date]
        
        year = check_date.year
        holidays = self._get_market_holidays(year)
        
        is_holiday = check_date in holidays
        self._holiday_cache[check_date] = is_holiday
        
        return is_holiday
    
    def _get_market_holidays(self, year: int) -> list:
        """
        Get list of market holidays for a given year.
        
        Args:
            year: Year to get holidays for
            
        Returns:
            List of date objects representing market holidays
        """
        holidays = []
        
        # New Year's Day (or observed)
        new_years = date(year, 1, 1)
        holidays.append(self._get_observed_date(new_years))
        
        # Martin Luther King Jr. Day (3rd Monday of January)
        holidays.append(self._get_nth_weekday(year, 1, 0, 3))
        
        # Presidents Day (3rd Monday of February)
        holidays.append(self._get_nth_weekday(year, 2, 0, 3))
        
        # Good Friday (complex calculation - use approximate)
        # This is a simplified version; production would use a proper Easter calculation
        good_friday = self._calculate_good_friday(year)
        if good_friday:
            holidays.append(good_friday)
        
        # Memorial Day (last Monday of May)
        holidays.append(self._get_last_weekday(year, 5, 0))
        
        # Juneteenth (June 19th, or observed)
        juneteenth = date(year, 6, 19)
        holidays.append(self._get_observed_date(juneteenth))
        
        # Independence Day (July 4th, or observed)
        independence_day = date(year, 7, 4)
        holidays.append(self._get_observed_date(independence_day))
        
        # Labor Day (1st Monday of September)
        holidays.append(self._get_nth_weekday(year, 9, 0, 1))
        
        # Thanksgiving Day (4th Thursday of November)
        holidays.append(self._get_nth_weekday(year, 11, 3, 4))
        
        # Christmas Day (December 25th, or observed)
        christmas = date(year, 12, 25)
        holidays.append(self._get_observed_date(christmas))
        
        return holidays
    
    def _get_observed_date(self, holiday_date: date) -> date:
        """
        Get the observed date for a holiday that falls on a weekend.
        
        If holiday falls on Saturday, observed on Friday.
        If holiday falls on Sunday, observed on Monday.
        
        Args:
            holiday_date: The actual holiday date
            
        Returns:
            The observed date (moved if weekend)
        """
        from datetime import timedelta
        
        weekday = holiday_date.weekday()
        
        if weekday == 5:  # Saturday
            return holiday_date - timedelta(days=1)
        elif weekday == 6:  # Sunday
            return holiday_date + timedelta(days=1)
        else:
            return holiday_date
    
    def _get_nth_weekday(self, year: int, month: int, weekday: int, n: int) -> date:
        """
        Get the nth occurrence of a weekday in a month.
        
        Args:
            year: Year
            month: Month (1-12)
            weekday: Weekday (0=Monday, 6=Sunday)
            n: Which occurrence (1=first, 2=second, etc.)
            
        Returns:
            Date of the nth weekday
        """
        first_day = date(year, month, 1)
        first_weekday = first_day.weekday()
        
        # Calculate days until target weekday
        days_ahead = weekday - first_weekday
        if days_ahead < 0:
            days_ahead += 7
        
        # Calculate the nth occurrence
        target_date = first_day.day + days_ahead + (n - 1) * 7
        
        return date(year, month, target_date)
    
    def _get_last_weekday(self, year: int, month: int, weekday: int) -> date:
        """
        Get the last occurrence of a weekday in a month.
        
        Args:
            year: Year
            month: Month (1-12)
            weekday: Weekday (0=Monday, 6=Sunday)
            
        Returns:
            Date of the last occurrence of weekday in month
        """
        from datetime import timedelta
        
        # Start with the last day of the month
        if month == 12:
            last_day = date(year, 12, 31)
        else:
            # Get first day of next month, then subtract one day
            last_day = date(year, month + 1, 1) - timedelta(days=1)
        
        last_weekday = last_day.weekday()
        
        # Calculate days back to target weekday
        days_back = last_weekday - weekday
        if days_back < 0:
            days_back += 7
        
        return last_day - timedelta(days=days_back)
    
    def _calculate_good_friday(self, year: int) -> Optional[date]:
        """
        Calculate Good Friday for a given year.
        
        This is a simplified calculation. For production, consider using
        a library like `holidays` or maintaining a static list.
        
        Args:
            year: Year to calculate for
            
        Returns:
            Date of Good Friday, or None if calculation fails
        """
        # Easter calculation using Meeus/Jones/Butcher algorithm
        try:
            a = year % 19
            b = year // 100
            c = year % 100
            d = b // 4
            e = b % 4
            f = (b + 8) // 25
            g = (b - f + 1) // 3
            h = (19 * a + b - d - g + 15) % 30
            i = c // 4
            k = c % 4
            l = (32 + 2 * e + 2 * i - h - k) % 7
            m = (a + 11 * h + 22 * l) // 451
            month = (h + l - 7 * m + 114) // 31
            day = ((h + l - 7 * m + 114) % 31) + 1
            
            from datetime import timedelta
            
            easter_sunday = date(year, month, day)
            
            # Good Friday is 2 days before Easter Sunday
            good_friday = easter_sunday - timedelta(days=2)
            return good_friday
            
        except Exception as e:
            logger.warning(f"Failed to calculate Good Friday for {year}: {e}")
            return None
    
    def is_early_close_day(self, check_date: date) -> bool:
        """
        Check if a date is an early close day (market closes at 1:00 PM EST).
        
        Early close days:
        - Day before Independence Day (if Independence Day is on a weekday)
        - Black Friday (day after Thanksgiving)
        - Christmas Eve (if Christmas is on a weekday)
        
        Args:
            check_date: Date to check
            
        Returns:
            True if early close day, False otherwise
        """
        year = check_date.year
        
        # Day before Independence Day (if July 4th is on a weekday)
        july_4th = date(year, 7, 4)
        if july_4th.weekday() < 5:  # Weekday
            day_before_july_4th = date(year, 7, 3)
            if check_date == day_before_july_4th and day_before_july_4th.weekday() < 5:
                return True
        
        # Black Friday (day after Thanksgiving)
        thanksgiving = self._get_nth_weekday(year, 11, 3, 4)
        black_friday = date(thanksgiving.year, thanksgiving.month, thanksgiving.day + 1)
        if check_date == black_friday:
            return True
        
        # Christmas Eve (if Christmas is on a weekday)
        christmas = date(year, 12, 25)
        if christmas.weekday() < 5:  # Weekday
            christmas_eve = date(year, 12, 24)
            if check_date == christmas_eve and christmas_eve.weekday() < 5:
                return True
        
        return False
    
    def get_last_trading_day(self, reference_date: Optional[date] = None) -> date:
        """
        Get the most recent trading day (including today if market is open).
        
        Args:
            reference_date: Date to look back from (default: today)
            
        Returns:
            Most recent trading day
        """
        from datetime import timedelta
        
        if reference_date is None:
            reference_date = datetime.now(self.est).date()
        
        current_date = reference_date
        
        # Look back up to 7 days to find last trading day
        for _ in range(7):
            if self.is_market_open_today(current_date):
                return current_date
            # Go back one day
            current_date = current_date - timedelta(days=1)
        
        # Fallback: return original date (shouldn't happen)
        logger.warning(f"Could not find last trading day within 7 days of {reference_date}")
        return reference_date


# Singleton instance
_trading_calendar = None


def get_trading_calendar() -> TradingCalendar:
    """Get or create singleton instance of trading calendar."""
    global _trading_calendar
    if _trading_calendar is None:
        _trading_calendar = TradingCalendar()
    return _trading_calendar

