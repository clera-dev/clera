#!/usr/bin/env python3
"""
Real-time Account Closure Log Monitor

Run this script to watch account closure processes in real-time.
Shows detailed logs with color coding for easy monitoring.

Usage:
    python monitor_account_closure.py [account_id]
    
If account_id is provided, monitors only that specific account.
Otherwise monitors all account closures.
"""

import os
import time
import glob
import argparse
from datetime import datetime
from typing import Optional

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

def get_latest_log_file(account_id: Optional[str] = None) -> Optional[str]:
    """Get the most recent log file for account closure."""
    log_dir = "logs/account_closures"
    
    if not os.path.exists(log_dir):
        os.makedirs(log_dir, exist_ok=True)
        return None
    
    if account_id:
        pattern = f"{log_dir}/closure_{account_id}_*.log"
    else:
        pattern = f"{log_dir}/closure_*.log"
    
    log_files = glob.glob(pattern)
    if not log_files:
        return None
    
    # Return the most recent file
    return max(log_files, key=os.path.getctime)

def monitor_log_file(log_file: str):
    """Monitor a log file for new lines."""
    print(f"\n{Colors.BOLD}🔍 Monitoring account closure log:{Colors.END}")
    print(f"{Colors.CYAN}{log_file}{Colors.END}\n")
    
    if not os.path.exists(log_file):
        print(f"{Colors.YELLOW}Waiting for log file to be created...{Colors.END}")
        while not os.path.exists(log_file):
            time.sleep(0.5)
    
    # Read existing content
    with open(log_file, 'r') as f:
        f.seek(0, 2)  # Go to end of file
        
        print(f"{Colors.BOLD}📝 Starting real-time monitoring...{Colors.END}")
        print(f"{Colors.YELLOW}Press Ctrl+C to stop{Colors.END}\n")
        
        try:
            while True:
                line = f.readline()
                if line:
                    colored_line = colorize_log_line(line)
                    print(colored_line)
                    
                    # If we see completion, add a separator
                    if "COMPLETED ACCOUNT_CLOSURE_INITIATION" in line:
                        print(f"\n{Colors.GREEN}{'='*80}")
                        print(f"🎉 ACCOUNT CLOSURE INITIATION COMPLETED!")
                        print(f"{'='*80}{Colors.END}\n")
                else:
                    time.sleep(0.1)
                    
        except KeyboardInterrupt:
            print(f"\n\n{Colors.YELLOW}Monitoring stopped by user{Colors.END}")

def show_recent_logs(account_id: Optional[str] = None, lines: int = 50):
    """Show recent log lines from existing log files."""
    log_dir = "logs/account_closures"
    
    if account_id:
        pattern = f"{log_dir}/closure_{account_id}_*.log"
    else:
        pattern = f"{log_dir}/closure_*.log"
    
    log_files = glob.glob(pattern)
    if not log_files:
        print(f"{Colors.YELLOW}No existing log files found{Colors.END}")
        return
    
    # Sort by modification time, newest first
    log_files.sort(key=os.path.getmtime, reverse=True)
    
    print(f"\n{Colors.BOLD}📄 Recent Account Closure Logs:{Colors.END}\n")
    
    for i, log_file in enumerate(log_files[:3]):  # Show up to 3 most recent files
        print(f"{Colors.CYAN}{'='*80}")
        print(f"File: {os.path.basename(log_file)}")
        print(f"Modified: {datetime.fromtimestamp(os.path.getmtime(log_file)).strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*80}{Colors.END}")
        
        try:
            with open(log_file, 'r') as f:
                all_lines = f.readlines()
                recent_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
                
                for line in recent_lines:
                    colored_line = colorize_log_line(line)
                    print(colored_line)
                    
        except Exception as e:
            print(f"{Colors.RED}Error reading log file: {e}{Colors.END}")
        
        print()  # Empty line between files

def main():
    parser = argparse.ArgumentParser(description="Monitor account closure logs in real-time")
    parser.add_argument("account_id", nargs="?", help="Specific account ID to monitor")
    parser.add_argument("--recent", "-r", action="store_true", help="Show recent logs instead of monitoring")
    parser.add_argument("--lines", "-n", type=int, default=50, help="Number of recent lines to show (default: 50)")
    
    args = parser.parse_args()
    
    print(f"{Colors.BOLD}{Colors.BLUE}")
    print("🔍 Account Closure Log Monitor")
    print("=" * 40)
    print(f"{Colors.END}")
    
    if args.recent:
        show_recent_logs(args.account_id, args.lines)
        return
    
    if args.account_id:
        print(f"👤 Monitoring account: {Colors.CYAN}{args.account_id}{Colors.END}")
        log_file = get_latest_log_file(args.account_id)
        if not log_file:
            # Create expected log file path for new closure
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            log_file = f"logs/account_closures/closure_{args.account_id}_{timestamp}.log"
            print(f"📁 Waiting for new closure process...")
    else:
        print(f"👥 Monitoring all account closures")
        log_file = get_latest_log_file()
        if not log_file:
            print(f"{Colors.YELLOW}No existing log files found. Waiting for new closure process...{Colors.END}")
            # Wait for any new log file to be created
            log_dir = "logs/account_closures"
            os.makedirs(log_dir, exist_ok=True)
            
            while True:
                log_file = get_latest_log_file()
                if log_file:
                    break
                time.sleep(1)
    
    monitor_log_file(log_file)

if __name__ == "__main__":
    main() 