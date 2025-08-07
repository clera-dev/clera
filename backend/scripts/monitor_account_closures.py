#!/usr/bin/env python3
"""
Account Closure Production Monitor

Operational monitoring script for account closure background processes.
Provides visibility into running tasks, Redis state, and system health.

Usage:
    # Monitor all active closures
    python scripts/monitor_account_closures.py
    
    # Monitor specific account
    python scripts/monitor_account_closures.py --account-id <account_id>
    
    # Cancel runaway task
    python scripts/monitor_account_closures.py --cancel <account_id>
    
    # Show Redis task registry
    python scripts/monitor_account_closures.py --show-redis
    
    # Continuous monitoring (refresh every 30 seconds)
    python scripts/monitor_account_closures.py --watch
"""

import os
import sys
import asyncio
import argparse
import time
from datetime import datetime, timezone
from typing import List, Dict, Any

# Add backend directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from utils.alpaca.automated_account_closure import AutomatedAccountClosureProcessor
from utils.alpaca.account_closure import ClosureStateManager

load_dotenv()

class AccountClosureMonitor:
    """Production monitoring for account closure processes."""
    
    def __init__(self, sandbox: bool = True):
        self.sandbox = sandbox
        self.state_manager = ClosureStateManager()
    
    def display_header(self):
        """Display monitoring header."""
        print("\n" + "=" * 80)
        print("🔍 ACCOUNT CLOSURE PRODUCTION MONITOR")
        print("=" * 80)
        print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
        print(f"Environment: {'SANDBOX' if self.sandbox else 'PRODUCTION'}")
        print(f"Redis Connected: {'✅' if self.state_manager.redis_client else '❌'}")
        print()
    
    def get_all_active_tasks(self) -> Dict[str, Dict[str, Any]]:
        """Get all active tasks from shared registry."""
        return AutomatedAccountClosureProcessor.get_all_active_tasks()
    
    def get_task_status(self, account_id: str) -> Dict[str, Any]:
        """Get task status for specific account."""
        return AutomatedAccountClosureProcessor.get_active_task_status(account_id)
    
    async def cancel_task(self, account_id: str) -> bool:
        """Cancel active task for account."""
        return await AutomatedAccountClosureProcessor.cancel_active_task(account_id)
    
    def get_redis_closure_states(self) -> List[Dict[str, Any]]:
        """Get closure states from Redis."""
        if not self.state_manager.redis_client:
            return []
        
        states = []
        try:
            for key in self.state_manager.redis_client.scan_iter(match="closure_state:*"):
                account_id = key.decode().split(":")[-1] if isinstance(key, bytes) else key.split(":")[-1]
                state = self.state_manager.get_closure_state(account_id)
                if state:
                    states.append({
                        "account_id": account_id,
                        "phase": state.get("phase"),
                        "user_id": state.get("user_id"),
                        "initiated_at": state.get("initiated_at"),
                        "next_action_time": state.get("next_action_time")
                    })
        except Exception as e:
            print(f"Error scanning Redis closure states: {e}")
        
        return states
    
    def display_active_tasks(self):
        """Display all active background tasks."""
        tasks = self.get_all_active_tasks()
        
        if not tasks:
            print("📭 No active account closure tasks found")
            return
        
        print(f"🚀 ACTIVE BACKGROUND TASKS ({len(tasks)} total)")
        print("-" * 80)
        
        for account_id, task_info in tasks.items():
            source_icon = "🏠" if task_info["source"] == "local_registry" else "☁️"
            status = "✅ Running" if not task_info.get("done", False) else "⏹️ Done"
            
            print(f"{source_icon} Account: {account_id}")
            print(f"   Status: {status}")
            print(f"   Task ID: {task_info.get('task_id', 'N/A')}")
            print(f"   Source: {task_info['source']}")
            
            if task_info.get("created_at"):
                print(f"   Created: {task_info['created_at']}")
            if task_info.get("process_id"):
                print(f"   Process: {task_info['process_id']}")
            if task_info.get("cancelled", False):
                print("   ⚠️ CANCELLED")
            
            print()
    
    def display_redis_states(self):
        """Display closure states from Redis."""
        states = self.get_redis_closure_states()
        
        if not states:
            print("📭 No closure states found in Redis")
            return
        
        print(f"💾 REDIS CLOSURE STATES ({len(states)} total)")
        print("-" * 80)
        
        for state in states:
            phase_icon = {
                "starting": "🟡",
                "liquidation": "🔄",
                "settlement": "⏳",
                "withdrawal": "💰",
                "withdrawal_waiting": "⌛",
                "withdrawal_24hr_wait": "🕐",
                "final_closure": "🏁",
                "completed": "✅",
                "failed": "❌"
            }.get(state["phase"], "❓")
            
            print(f"{phase_icon} Account: {state['account_id']}")
            print(f"   Phase: {state['phase']}")
            print(f"   User: {state.get('user_id', 'N/A')}")
            
            if state.get("initiated_at"):
                print(f"   Started: {state['initiated_at']}")
            if state.get("next_action_time"):
                print(f"   Next Action: {state['next_action_time']}")
            
            print()
    
    def display_specific_account(self, account_id: str):
        """Display detailed info for specific account."""
        print(f"🔍 ACCOUNT DETAILS: {account_id}")
        print("-" * 80)
        
        # Task status
        task_status = self.get_task_status(account_id)
        print("📋 TASK STATUS:")
        if task_status["active"]:
            print(f"   ✅ Active Task Found")
            print(f"   Task ID: {task_status.get('task_id', 'N/A')}")
            print(f"   Source: {task_status.get('source', 'unknown')}")
            
            if task_status.get("done", False):
                print("   Status: ⏹️ Done")
            elif task_status.get("cancelled", False):
                print("   Status: ⚠️ Cancelled")
            else:
                print("   Status: 🚀 Running")
                
            if task_status.get("exception"):
                print(f"   ❌ Exception: {task_status['exception']}")
        else:
            print("   📭 No active task")
        
        print()
        
        # Closure state
        closure_state = self.state_manager.get_closure_state(account_id)
        print("💾 CLOSURE STATE:")
        if closure_state:
            phase_icon = {
                "starting": "🟡",
                "liquidation": "🔄", 
                "settlement": "⏳",
                "withdrawal": "💰",
                "withdrawal_waiting": "⌛",
                "withdrawal_24hr_wait": "🕐",
                "final_closure": "🏁",
                "completed": "✅",
                "failed": "❌"
            }.get(closure_state.get("phase"), "❓")
            
            print(f"   Phase: {phase_icon} {closure_state.get('phase', 'unknown')}")
            print(f"   User ID: {closure_state.get('user_id', 'N/A')}")
            print(f"   Confirmation: {closure_state.get('confirmation_number', 'N/A')}")
            
            if closure_state.get("initiated_at"):
                print(f"   Started: {closure_state['initiated_at']}")
            if closure_state.get("next_action_time"):
                print(f"   Next Action: {closure_state['next_action_time']}")
        else:
            print("   📭 No closure state found")
    
    async def cancel_account_task(self, account_id: str):
        """Cancel task for specific account."""
        print(f"⚠️ CANCELLING TASK: {account_id}")
        print("-" * 80)
        
        task_status = self.get_task_status(account_id)
        if not task_status["active"]:
            print("❌ No active task found to cancel")
            return False
        
        print(f"Found active task (ID: {task_status.get('task_id', 'N/A')})")
        print("Attempting to cancel...")
        
        success = await self.cancel_task(account_id)
        
        if success:
            print("✅ Task cancelled successfully")
            print("⚠️ NOTE: Account may be left in intermediate state")
            print("   Consider using the fix script to resume if needed")
        else:
            print("❌ Failed to cancel task")
        
        return success
    
    async def monitor_once(self, account_id: str = None):
        """Run monitoring once."""
        self.display_header()
        
        if account_id:
            self.display_specific_account(account_id)
        else:
            self.display_active_tasks()
            print()
            self.display_redis_states()
    
    async def watch_mode(self, interval: int = 30):
        """Continuous monitoring mode."""
        try:
            while True:
                os.system('clear' if os.name == 'posix' else 'cls')  # Clear screen
                await self.monitor_once()
                
                print(f"🔄 Refreshing in {interval} seconds... (Press Ctrl+C to exit)")
                await asyncio.sleep(interval)
                
        except KeyboardInterrupt:
            print("\n👋 Monitoring stopped by user")

async def main():
    parser = argparse.ArgumentParser(description="Account Closure Production Monitor")
    parser.add_argument("--account-id", help="Monitor specific account ID")
    parser.add_argument("--cancel", metavar="ACCOUNT_ID", help="Cancel task for specific account")
    parser.add_argument("--show-redis", action="store_true", help="Show Redis states only")
    parser.add_argument("--watch", action="store_true", help="Continuous monitoring mode")
    parser.add_argument("--interval", type=int, default=30, help="Watch mode refresh interval (seconds)")
    parser.add_argument("--production", action="store_true", help="Use production mode (default: sandbox)")
    
    args = parser.parse_args()
    
    # Determine sandbox mode
    sandbox = not args.production
    if os.getenv("ALPACA_ENVIRONMENT", "sandbox").lower() == "production":
        sandbox = False
    
    monitor = AccountClosureMonitor(sandbox=sandbox)
    
    if args.cancel:
        await monitor.cancel_account_task(args.cancel)
    elif args.show_redis:
        monitor.display_header()
        monitor.display_redis_states()
    elif args.watch:
        await monitor.watch_mode(args.interval)
    else:
        await monitor.monitor_once(args.account_id)

if __name__ == "__main__":
    asyncio.run(main())