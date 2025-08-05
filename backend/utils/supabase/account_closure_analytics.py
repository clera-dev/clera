#!/usr/bin/env python3
"""
Account Closure Analytics

This module provides analytics and reporting functionality for account closure operations.
It generates statistics, trends, and insights from account closure data.

Responsibilities:
- Statistics generation and aggregation
- Trend analysis and reporting
- Performance metrics calculation
- Data visualization support
- Business intelligence queries
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from collections import defaultdict

from .account_closure_repository import account_closure_repository

logger = logging.getLogger(__name__)


class AccountClosureAnalytics:
    """Analytics service for account closure operations."""
    
    def __init__(self):
        """Initialize the analytics service with repository dependency."""
        self.repository = account_closure_repository
    
    def generate_statistics(self, days: int = 30) -> Dict[str, Any]:
        """
        Generate comprehensive statistics about account closure operations.
        
        Args:
            days (int): Number of days to analyze (default: 30)
            
        Returns:
            Dict[str, Any]: Comprehensive statistics
        """
        try:
            # Calculate date range
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)
            
            # Get logs within date range
            logs = self.repository.find_by_date_range(start_date, end_date)
            
            # Calculate basic metrics
            total_logs = len(logs)
            unique_accounts = len(set([log.get("account_id") for log in logs if log.get("account_id")]))
            
            # Count by log level
            log_levels = self._count_by_field(logs, "log_level")
            
            # Count by step
            steps = self._count_by_field(logs, "step_name")
            
            # Calculate daily activity
            daily_counts = self._calculate_daily_activity(logs)
            
            # Find most active accounts
            top_accounts = self._get_top_accounts(logs, limit=10)
            
            # Calculate success/failure rates
            success_logs = len([log for log in logs if "COMPLETED" in log.get("message", "")])
            failure_logs = len([log for log in logs if "FAILED" in log.get("message", "")])
            success_rate = round(success_logs / max(success_logs + failure_logs, 1) * 100, 2)
            
            statistics = {
                "period": {
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "days": days
                },
                "overview": {
                    "total_logs": total_logs,
                    "unique_accounts": unique_accounts,
                    "success_logs": success_logs,
                    "failure_logs": failure_logs,
                    "success_rate": success_rate
                },
                "by_log_level": log_levels,
                "by_step": steps,
                "daily_activity": daily_counts,
                "top_accounts": top_accounts,
                "generated_at": datetime.now().isoformat()
            }
            
            return statistics
        except Exception as e:
            logger.error(f"Error generating account closure statistics: {e}")
            return {}
    
    def _count_by_field(self, logs: List[Dict[str, Any]], field_name: str) -> Dict[str, int]:
        """
        Count occurrences by a specific field.
        
        Args:
            logs (List[Dict[str, Any]]): List of log entries
            field_name (str): Field name to count by
            
        Returns:
            Dict[str, int]: Count by field value
        """
        counts = defaultdict(int)
        for log in logs:
            value = log.get(field_name, "UNKNOWN")
            counts[value] += 1
        return dict(counts)
    
    def _calculate_daily_activity(self, logs: List[Dict[str, Any]]) -> Dict[str, int]:
        """
        Calculate daily activity counts.
        
        Args:
            logs (List[Dict[str, Any]]): List of log entries
            
        Returns:
            Dict[str, int]: Daily activity counts
        """
        daily_counts = defaultdict(int)
        for log in logs:
            created_at = log.get("created_at", "")
            if created_at:
                try:
                    date_obj = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    date_key = date_obj.strftime('%Y-%m-%d')
                    daily_counts[date_key] += 1
                except:
                    pass
        return dict(daily_counts)
    
    def _get_top_accounts(self, logs: List[Dict[str, Any]], limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get accounts with the most activity.
        
        Args:
            logs (List[Dict[str, Any]]): List of log entries
            limit (int): Maximum number of accounts to return
            
        Returns:
            List[Dict[str, Any]]: Top accounts by activity
        """
        account_activity = defaultdict(int)
        for log in logs:
            account_id = log.get("account_id")
            if account_id:
                account_activity[account_id] += 1
        
        # Sort accounts by activity
        sorted_accounts = sorted(account_activity.items(), key=lambda x: x[1], reverse=True)
        return [{"account_id": acc, "log_count": count} for acc, count in sorted_accounts[:limit]]
    
    def generate_trend_analysis(self, days: int = 90) -> Dict[str, Any]:
        """
        Generate trend analysis for account closure operations.
        
        Args:
            days (int): Number of days to analyze for trends
            
        Returns:
            Dict[str, Any]: Trend analysis data
        """
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)
            
            # Get logs for trend analysis
            logs = self.repository.find_by_date_range(start_date, end_date)
            
            # Calculate weekly trends
            weekly_trends = self._calculate_weekly_trends(logs, days)
            
            # Calculate error rate trends
            error_trends = self._calculate_error_trends(logs, days)
            
            # Calculate completion rate trends
            completion_trends = self._calculate_completion_trends(logs, days)
            
            trend_analysis = {
                "period": {
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "days": days
                },
                "weekly_activity": weekly_trends,
                "error_rate_trend": error_trends,
                "completion_rate_trend": completion_trends,
                "generated_at": datetime.now().isoformat()
            }
            
            return trend_analysis
        except Exception as e:
            logger.error(f"Error generating trend analysis: {e}")
            return {}
    
    def _calculate_weekly_trends(self, logs: List[Dict[str, Any]], days: int) -> List[Dict[str, Any]]:
        """Calculate weekly activity trends."""
        weekly_data = defaultdict(int)
        
        for log in logs:
            created_at = log.get("created_at", "")
            if created_at:
                try:
                    date_obj = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    # Get the start of the week (Monday)
                    week_start = date_obj - timedelta(days=date_obj.weekday())
                    week_key = week_start.strftime('%Y-%m-%d')
                    weekly_data[week_key] += 1
                except:
                    pass
        
        # Convert to sorted list
        return [{"week_start": week, "activity_count": count} 
                for week, count in sorted(weekly_data.items())]
    
    def _calculate_error_trends(self, logs: List[Dict[str, Any]], days: int) -> List[Dict[str, Any]]:
        """Calculate error rate trends."""
        daily_errors = defaultdict(int)
        daily_totals = defaultdict(int)
        
        for log in logs:
            created_at = log.get("created_at", "")
            if created_at:
                try:
                    date_obj = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    date_key = date_obj.strftime('%Y-%m-%d')
                    daily_totals[date_key] += 1
                    
                    if log.get("log_level") == "ERROR":
                        daily_errors[date_key] += 1
                except:
                    pass
        
        # Calculate error rates
        error_rates = []
        for date, total in daily_totals.items():
            error_count = daily_errors.get(date, 0)
            error_rate = round((error_count / total) * 100, 2) if total > 0 else 0
            error_rates.append({
                "date": date,
                "error_count": error_count,
                "total_logs": total,
                "error_rate": error_rate
            })
        
        return sorted(error_rates, key=lambda x: x["date"])
    
    def _calculate_completion_trends(self, logs: List[Dict[str, Any]], days: int) -> List[Dict[str, Any]]:
        """Calculate completion rate trends."""
        daily_completions = defaultdict(int)
        daily_accounts = defaultdict(set)
        
        for log in logs:
            created_at = log.get("created_at", "")
            account_id = log.get("account_id")
            message = log.get("message", "")
            
            if created_at and account_id:
                try:
                    date_obj = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    date_key = date_obj.strftime('%Y-%m-%d')
                    daily_accounts[date_key].add(account_id)
                    
                    if "COMPLETED" in message:
                        daily_completions[date_key] += 1
                except:
                    pass
        
        # Calculate completion rates
        completion_rates = []
        for date, accounts in daily_accounts.items():
            completion_count = daily_completions.get(date, 0)
            total_accounts = len(accounts)
            completion_rate = round((completion_count / total_accounts) * 100, 2) if total_accounts > 0 else 0
            completion_rates.append({
                "date": date,
                "completions": completion_count,
                "total_accounts": total_accounts,
                "completion_rate": completion_rate
            })
        
        return sorted(completion_rates, key=lambda x: x["date"])
    
    def generate_account_performance_report(self, account_id: str) -> Dict[str, Any]:
        """
        Generate a detailed performance report for a specific account.
        
        Args:
            account_id (str): The account ID to analyze
            
        Returns:
            Dict[str, Any]: Detailed performance report
        """
        try:
            # Get all logs for the account
            logs = self.repository.find_by_account_id(account_id, limit=1000)
            
            if not logs:
                return {"error": "No data found for account"}
            
            # Calculate metrics
            total_logs = len(logs)
            error_count = len([log for log in logs if log.get("log_level") == "ERROR"])
            warning_count = len([log for log in logs if log.get("log_level") == "WARNING"])
            
            # Calculate timeline
            first_log = logs[-1] if logs else None
            latest_log = logs[0] if logs else None
            
            # Calculate duration
            duration_hours = 0
            if first_log and latest_log:
                try:
                    first_time = datetime.fromisoformat(first_log.get("created_at", "").replace('Z', '+00:00'))
                    latest_time = datetime.fromisoformat(latest_log.get("created_at", "").replace('Z', '+00:00'))
                    duration = latest_time - first_time
                    duration_hours = round(duration.total_seconds() / 3600, 2)
                except:
                    pass
            
            # Get step breakdown
            step_counts = self._count_by_field(logs, "step_name")
            
            # Calculate error rate
            error_rate = round((error_count / total_logs) * 100, 2) if total_logs > 0 else 0
            
            report = {
                "account_id": account_id,
                "summary": {
                    "total_logs": total_logs,
                    "error_count": error_count,
                    "warning_count": warning_count,
                    "error_rate": error_rate,
                    "duration_hours": duration_hours
                },
                "timeline": {
                    "first_activity": first_log.get("created_at") if first_log else None,
                    "latest_activity": latest_log.get("created_at") if latest_log else None,
                    "duration_hours": duration_hours
                },
                "step_breakdown": step_counts,
                "recent_logs": logs[:10],  # Last 10 logs
                "generated_at": datetime.now().isoformat()
            }
            
            return report
        except Exception as e:
            logger.error(f"Error generating account performance report: {e}")
            return {"error": "Failed to generate report"}
    
    def get_system_health_metrics(self) -> Dict[str, Any]:
        """
        Get system health metrics for account closure operations.
        
        Returns:
            Dict[str, Any]: System health metrics
        """
        try:
            # Get recent logs (last 24 hours)
            end_date = datetime.now()
            start_date = end_date - timedelta(days=1)
            recent_logs = self.repository.find_by_date_range(start_date, end_date)
            
            # Calculate health metrics
            total_activity = len(recent_logs)
            error_count = len([log for log in recent_logs if log.get("log_level") == "ERROR"])
            active_accounts = len(set([log.get("account_id") for log in recent_logs if log.get("account_id")]))
            
            # Calculate error rate
            error_rate = round((error_count / total_activity) * 100, 2) if total_activity > 0 else 0
            
            # Determine health status
            health_status = "healthy"
            if error_rate > 10:
                health_status = "unhealthy"
            elif error_rate > 5:
                health_status = "warning"
            
            metrics = {
                "period": "last_24_hours",
                "health_status": health_status,
                "metrics": {
                    "total_activity": total_activity,
                    "error_count": error_count,
                    "error_rate": error_rate,
                    "active_accounts": active_accounts
                },
                "thresholds": {
                    "healthy": "< 5% error rate",
                    "warning": "5-10% error rate",
                    "unhealthy": "> 10% error rate"
                },
                "generated_at": datetime.now().isoformat()
            }
            
            return metrics
        except Exception as e:
            logger.error(f"Error getting system health metrics: {e}")
            return {"error": "Failed to get health metrics"}


# Create a singleton instance for easy access
account_closure_analytics = AccountClosureAnalytics() 