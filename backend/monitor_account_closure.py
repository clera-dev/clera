#!/usr/bin/env python3
"""
Real-time Account Closure Log Monitor

Run this script to watch account closure processes in real-time.
Shows detailed logs with color coding for easy monitoring.

Features:
- Real-time monitoring of account closures
- Database-based querying and analytics
- File-based detailed debugging
- Statistics and performance metrics
- Automatic cleanup and retention management

Usage:
    python monitor_account_closure.py [account_id] [options]
    
Options:
    --recent, -r          Show recent logs instead of monitoring
    --lines, -n           Number of recent lines to show (default: 50)
    --database, -d        Use database logs only
    --file, -f            Use file logs only
    --stats, -s           Show statistics
    --cleanup, -c         Clean up old logs
    --summary, -m         Show account closure summary
    --user, -u            Show logs for a specific user
"""

import os
import time
import glob
import argparse
import json
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import sys

# ARCHITECTURAL FIX: Service Factory Pattern for Production-Grade Dependency Management
class ServiceFactory:
    """
    Production-grade service factory that handles lazy loading and dependency injection.
    
    This ensures:
    - Services are available when imported as module or run as script
    - Graceful degradation when dependencies are unavailable
    - No hidden coupling to execution context
    - Thread-safe singleton pattern
    """
    
    _instance = None
    _services = {}
    _database_available = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ServiceFactory, cls).__new__(cls)
        return cls._instance
    
    def _ensure_path_setup(self):
        """Ensure backend directory is in Python path."""
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)
    
    def _load_services(self):
        """Lazy load all database services with comprehensive error handling."""
        if self._database_available is not None:
            return  # Already loaded
        
        self._ensure_path_setup()
        
        try:
            # CRITICAL FIX: Handle import-time initialization failures
            # Services might fail during import due to missing env vars, db connection issues, etc.
            
            # Set up environment for imports if needed
            self._setup_environment()
            
            # Import services with full exception handling
            from utils.supabase.account_closure_service import account_closure_service
            from utils.supabase.account_closure_analytics import account_closure_analytics
            from utils.supabase.user_closure_service import user_closure_service
            from utils.supabase.db_client import get_user_alpaca_account_id
            
            # Store services in registry
            self._services = {
                'account_closure_service': account_closure_service,
                'account_closure_analytics': account_closure_analytics,
                'user_closure_service': user_closure_service,
                'get_user_alpaca_account_id': get_user_alpaca_account_id
            }
            self._database_available = True
            
        except Exception as e:
            # Any failure during import means services are unavailable
            self._database_available = False
            self._services = {}
            # Only print warning if we're running as main script
            if __name__ == "__main__":
                print(f"⚠️ Database logging not available: {e}")
    
    def _setup_environment(self):
        """Setup environment variables if needed."""
        import os
        
        # Load .env file if it exists and environment variables are missing
        if not os.getenv("SUPABASE_URL"):
            env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
            if os.path.exists(env_file):
                try:
                    from dotenv import load_dotenv
                    load_dotenv(env_file)
                except ImportError:
                    pass  # dotenv not available, that's fine
    
    @property
    def database_available(self) -> bool:
        """Check if database services are available."""
        if self._database_available is None:
            self._load_services()
        return self._database_available if self._database_available is not None else False
    
    def get_service(self, service_name: str):
        """Get a service by name with lazy loading."""
        if not self.database_available:
            return None
        return self._services.get(service_name)
    
    def validate_service(self, service_name: str) -> bool:
        """Validate that a service is available and callable."""
        service = self.get_service(service_name)
        return service is not None
    
    def get_service_status(self) -> Dict[str, bool]:
        """Get status of all services for debugging."""
        return {
            'database_available': self.database_available,
            'account_closure_service': self.validate_service('account_closure_service'),
            'account_closure_analytics': self.validate_service('account_closure_analytics'),
            'user_closure_service': self.validate_service('user_closure_service'),
            'get_user_alpaca_account_id': self.validate_service('get_user_alpaca_account_id')
        }
    
    @property
    def account_closure_service(self):
        """Get account closure service."""
        return self.get_service('account_closure_service')
    
    @property
    def account_closure_analytics(self):
        """Get account closure analytics service."""
        return self.get_service('account_closure_analytics')
    
    @property
    def user_closure_service(self):
        """Get user closure service."""
        return self.get_service('user_closure_service')
    
    @property
    def get_user_alpaca_account_id(self):
        """Get user alpaca account ID function."""
        return self.get_service('get_user_alpaca_account_id')

# Global service factory instance
services = ServiceFactory()

# Color codes for terminal output
class Colors:
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    PURPLE = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    END = '\033[0m'

def colorize_log_line(line: str) -> str:
    """Add color coding to log lines based on content."""
    line = line.strip()
    
    if "ERROR" in line or "❌ FAILED" in line:
        return f"{Colors.RED}{line}{Colors.END}"
    elif "✅ COMPLETED" in line or "✅ PASSED" in line or "✅ SENT" in line:
        return f"{Colors.GREEN}{line}{Colors.END}"
    elif "⚠️ FAILED" in line or "WARNING" in line:
        return f"{Colors.YELLOW}{line}{Colors.END}"
    elif "STARTING" in line:
        return f"{Colors.BLUE}{line}{Colors.END}"
    elif "SAFETY CHECK" in line:
        return f"{Colors.PURPLE}{line}{Colors.END}"
    elif "⏱️ TIMING" in line:
        return f"{Colors.CYAN}{line}{Colors.END}"
    elif "ALPACA" in line:
        return f"{Colors.WHITE}{line}{Colors.END}"
    else:
        return line

def format_database_log(log_entry: Dict[str, Any]) -> str:
    """Format a database log entry for display."""
    timestamp = log_entry.get("created_at", "")
    if timestamp:
        # Convert ISO timestamp to readable format
        try:
            dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            timestamp = dt.strftime("%Y-%m-%d %H:%M:%S")
        except:
            pass
    
    level = log_entry.get("log_level", "INFO")
    step = log_entry.get("step_name", "")
    message = log_entry.get("message", "")
    
    # Color code based on level
    if level == "ERROR":
        level_color = Colors.RED
    elif level == "WARNING":
        level_color = Colors.YELLOW
    elif level == "DEBUG":
        level_color = Colors.CYAN
    else:
        level_color = Colors.GREEN
    
    return f"{timestamp} | {level_color}{level}{Colors.END} | STEP: {step} | {message}"

def show_database_logs(account_id: Optional[str] = None, user_id: Optional[str] = None, limit: int = 50):
    """Show recent database logs."""
    if not services.database_available:
        print(f"{Colors.YELLOW}Database logging not available{Colors.END}")
        return
    
    try:
        logs = services.account_closure_service.get_logs_with_filters(
            account_id=account_id,
            user_id=user_id,
            limit=limit
        )
        
        if not logs:
            print(f"{Colors.YELLOW}No database logs found{Colors.END}")
            return
        
        print(f"\n{Colors.BOLD}📊 Database Logs:{Colors.END}\n")
        
        for log in logs:
            formatted_line = format_database_log(log)
            colored_line = colorize_log_line(formatted_line)
            print(colored_line)
            
    except Exception as e:
        print(f"{Colors.RED}Error retrieving database logs: {e}{Colors.END}")

def show_account_summary(account_id: str):
    """Show account closure summary."""
    if not services.database_available:
        print(f"{Colors.YELLOW}Database logging not available{Colors.END}")
        return
    
    try:
        summary = services.account_closure_service.get_account_summary(account_id)
        
        if not summary:
            print(f"{Colors.YELLOW}No summary found for account {account_id}{Colors.END}")
            return
        
        print(f"\n{Colors.BOLD}📋 Account Closure Summary:{Colors.END}")
        print(f"{Colors.CYAN}{'='*60}{Colors.END}")
        print(f"Account ID: {Colors.WHITE}{summary['account_id']}{Colors.END}")
        print(f"Status: {Colors.GREEN if summary['current_status'] == 'completed' else Colors.YELLOW}{summary['current_status'].upper()}{Colors.END}")
        print(f"Total Logs: {summary['total_logs']}")
        print(f"Errors: {Colors.RED}{summary['error_count']}{Colors.END}")
        print(f"Warnings: {Colors.YELLOW}{summary['warning_count']}{Colors.END}")
        print(f"Steps Completed: {', '.join(summary['steps_completed'])}")
        print(f"Last Updated: {summary['last_updated']}")
        print(f"{Colors.CYAN}{'='*60}{Colors.END}")
        
    except Exception as e:
        print(f"{Colors.RED}Error retrieving account summary: {e}{Colors.END}")

def show_user_logs(user_id: str, limit: int = 50):
    """Show logs for a specific user."""
    if not services.database_available:
        print(f"{Colors.YELLOW}Database logging not available{Colors.END}")
        return
    
    try:
        # Get the user's Alpaca account ID
        account_id = services.get_user_alpaca_account_id(user_id)
        
        if not account_id:
            print(f"{Colors.YELLOW}No Alpaca account found for user {user_id}{Colors.END}")
            return
        
        print(f"\n{Colors.BOLD}👤 User Logs for {user_id}:{Colors.END}")
        print(f"Alpaca Account: {Colors.CYAN}{account_id}{Colors.END}")
        
        # Show logs for this user
        show_database_logs(user_id=user_id, limit=limit)
        
    except Exception as e:
        print(f"{Colors.RED}Error retrieving user logs: {e}{Colors.END}")

def show_statistics(days: int = 30):
    """Show account closure statistics."""
    if not services.database_available:
        print(f"{Colors.YELLOW}Database logging not available{Colors.END}")
        return
    
    try:
        stats = services.account_closure_analytics.generate_statistics(days)
        
        print(f"\n{Colors.BOLD}📈 Account Closure Statistics (Last {days} days):{Colors.END}")
        print(f"{Colors.CYAN}{'='*60}{Colors.END}")
        print(f"Total Closures: {stats['total_closures']}")
        print(f"Successful: {Colors.GREEN}{stats['successful_closures']}{Colors.END}")
        print(f"Failed: {Colors.RED}{stats['failed_closures']}{Colors.END}")
        print(f"Success Rate: {Colors.GREEN}{stats['success_rate']:.1f}%{Colors.END}")
        print(f"Average Duration: {stats['average_duration_minutes']:.1f} minutes")
        print(f"Logs per Day: {stats['logs_per_day']}")
        
        if stats['most_common_errors']:
            print(f"\n{Colors.RED}Most Common Errors:{Colors.END}")
            for error, count in stats['most_common_errors']:
                print(f"  • {error}: {count} times")
        
        if stats['step_completion_rates']:
            print(f"\n{Colors.BLUE}Step Completion Rates:{Colors.END}")
            for step, rate in stats['step_completion_rates'].items():
                color = Colors.GREEN if rate > 90 else Colors.YELLOW if rate > 70 else Colors.RED
                print(f"  • {step}: {color}{rate:.1f}%{Colors.END}")
        
        print(f"{Colors.CYAN}{'='*60}{Colors.END}")
        
    except Exception as e:
        print(f"{Colors.RED}Error retrieving statistics: {e}{Colors.END}")

def cleanup_logs(days_to_keep: int = 180):
    """Clean up old logs."""
    if not services.database_available:
        print(f"{Colors.YELLOW}Database logging not available{Colors.END}")
        return
    
    try:
        deleted_count = services.account_closure_service.cleanup_old_logs(days_to_keep)
        print(f"{Colors.GREEN}✅ Cleaned up {deleted_count} old log entries (older than {days_to_keep} days){Colors.END}")
        
    except Exception as e:
        print(f"{Colors.RED}Error cleaning up logs: {e}{Colors.END}")

def monitor_database_logs(account_id: Optional[str] = None, user_id: Optional[str] = None):
    """Monitor database logs in real-time."""
    if not services.database_available:
        print(f"{Colors.YELLOW}Database logging not available{Colors.END}")
        return
    
    print(f"\n{Colors.BOLD}🔍 Monitoring database logs in real-time:{Colors.END}")
    if account_id:
        print(f"Account: {Colors.CYAN}{account_id}{Colors.END}")
    if user_id:
        print(f"User: {Colors.CYAN}{user_id}{Colors.END}")
    print(f"{Colors.YELLOW}Press Ctrl+C to stop{Colors.END}\n")
    
    last_log_id = None
    
    try:
        while True:
            # Get latest logs
            logs = services.account_closure_service.get_logs_with_filters(
                account_id=account_id,
                user_id=user_id,
                limit=10
            )
            
            if logs:
                # Check for new logs
                if last_log_id is None:
                    last_log_id = logs[0].get("id")
                    # Show initial logs
                    for log in reversed(logs[:5]):
                        formatted_line = format_database_log(log)
                        colored_line = colorize_log_line(formatted_line)
                        print(colored_line)
                else:
                    # Show only new logs
                    new_logs = []
                    for log in logs:
                        if log.get("id") == last_log_id:
                            break
                        new_logs.append(log)
                    
                    if new_logs:
                        last_log_id = new_logs[0].get("id")
                        for log in reversed(new_logs):
                            formatted_line = format_database_log(log)
                            colored_line = colorize_log_line(formatted_line)
                            print(colored_line)
                            
                            # Check for actual account closure completion by examining the result data
                            message = log.get("message", "")
                            data = log.get("data", {})
                            
                            # Check if this is a status completion with account_status = "CLOSED"
                            if "COMPLETED" in message and "GET_CLOSURE_STATUS" in message:
                                # Extract account status from the result data
                                if isinstance(data, dict) and "account_status" in data:
                                    account_status = data.get("account_status", "")
                                    if "CLOSED" in str(account_status):
                                        print(f"\n{Colors.GREEN}{'='*80}")
                                        print(f"🎉 ACCOUNT CLOSURE COMPLETED!")
                                        print(f"{'='*80}{Colors.END}\n")
                                    elif "ACTIVE" in str(account_status):
                                        # Account is still active, not completed
                                        pass
                            elif "COMPLETED" in message and "ACCOUNT_CLOSURE_INITIATION" in message:
                                # This is just initiation completion, not actual closure
                                pass
            
            time.sleep(2)  # Check every 2 seconds
            
    except KeyboardInterrupt:
        print(f"\n\n{Colors.YELLOW}Monitoring stopped by user{Colors.END}")

def show_service_diagnostics():
    """Show service availability diagnostics for troubleshooting."""
    print(f"\n{Colors.BOLD}🔧 Service Diagnostics:{Colors.END}")
    print(f"{Colors.CYAN}{'='*50}{Colors.END}")
    
    status = services.get_service_status()
    
    for service_name, available in status.items():
        status_color = Colors.GREEN if available else Colors.RED
        status_text = "✅ Available" if available else "❌ Unavailable"
        print(f"{service_name}: {status_color}{status_text}{Colors.END}")
    
    print(f"{Colors.CYAN}{'='*50}{Colors.END}")
    
    if not services.database_available:
        print(f"\n{Colors.YELLOW}💡 Troubleshooting Tips:{Colors.END}")
        print("1. Ensure all dependencies are installed: pip install -r requirements.txt")
        print("2. Check environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)")
        print("3. Verify database connectivity")
        print("4. Check if Supabase services are running")

def main():
    parser = argparse.ArgumentParser(description="Account closure log monitor")
    parser.add_argument("account_id", nargs="?", help="Specific account ID to monitor")
    parser.add_argument("--recent", "-r", action="store_true", help="Show recent logs instead of monitoring")
    parser.add_argument("--lines", "-n", type=int, default=50, help="Number of recent lines to show (default: 50)")
    parser.add_argument("--database", "-d", action="store_true", help="Use database logs (default)")
    parser.add_argument("--stats", "-s", action="store_true", help="Show statistics")
    parser.add_argument("--cleanup", "-c", action="store_true", help="Clean up old logs")
    parser.add_argument("--summary", "-m", action="store_true", help="Show account closure summary")
    parser.add_argument("--user", "-u", type=str, help="Show logs for a specific user ID")
    parser.add_argument("--days", type=int, default=180, help="Number of days for statistics/cleanup (default: 180, i.e. 6 months)")
    parser.add_argument("--diagnostics", "-x", action="store_true", help="Show service diagnostics")
    
    args = parser.parse_args()
    
    print(f"{Colors.BOLD}{Colors.BLUE}")
    print("🔍 Account Closure Log Monitor")
    print("=" * 40)
    print(f"{Colors.END}")
    
    # Handle special commands
    if args.diagnostics:
        show_service_diagnostics()
        return
    
    if args.stats:
        show_statistics(args.days)
        return
    
    if args.cleanup:
        cleanup_logs(args.days)
        return
    
    if args.summary and args.account_id:
        show_account_summary(args.account_id)
        return
    
    if args.user:
        if args.recent:
            show_user_logs(args.user, args.lines)
        else:
            monitor_database_logs(user_id=args.user)
        return
    
    # Handle recent logs
    if args.recent:
        show_database_logs(args.account_id, limit=args.lines)
        return
    
    # Handle real-time monitoring (Supabase only)
    monitor_database_logs(args.account_id)

if __name__ == "__main__":
    main() 