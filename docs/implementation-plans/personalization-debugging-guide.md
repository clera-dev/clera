# Personalization Context Debugging Guide

## Current Status

### ✅ What's Working
1. **Backend Implementation**: The personalization service correctly retrieves and formats user data
2. **Database**: Lance's personalization data exists in Supabase (user_id: `7c054ec8-a8e1-46f7-9ff8-8b357d309076`)
3. **Prompt Function**: Returns correct `List[AnyMessage]` format that LangGraph expects
4. **Frontend**: Correctly passes `user_id` and `account_id` in the `configurable` object

### ❌ The Issue
Clera is not using the personalization context even though:
- The data exists in the database
- The backend service can retrieve it
- The prompt function is correctly structured

## Debugging Steps

### 1. Check if LangGraph Deployment is Up to Date
```bash
# Rebuild and redeploy with the latest code
docker system prune -a --volumes -f
langgraph up --force
```

### 2. Verify User ID is Being Passed
Run the debug script with a specific user ID:
```bash
cd backend
source venv/bin/activate
python debug_personalization.py 7c054ec8-a8e1-46f7-9ff8-8b357d309076
```

### 3. Check Database Contents
```bash
cd backend
source venv/bin/activate
python check_personalization_data.py
```

### 4. Enable Debug Logging
The personalization service now includes enhanced debug logging. Check the LangGraph logs for:
- `Config type: <class>` - Shows what type of config is received
- `Config keys: [...]` - Shows the structure of the config
- `Configurable content: {...}` - Shows the actual user_id being passed
- `Found user_id: xxx` - Confirms user_id extraction
- `Enhanced system prompt with personalization for user xxx` - Confirms personalization was added

### 5. Test Locally
```python
# Test the complete flow
from utils.personalization_service import create_personalized_supervisor_prompt
from langchain_core.messages import HumanMessage

class MockState:
    def __init__(self):
        self.messages = [HumanMessage(content="how is my portfolio doing?")]

config = {
    'configurable': {
        'user_id': '7c054ec8-a8e1-46f7-9ff8-8b357d309076',
        'account_id': 'test-account'
    }
}

messages = create_personalized_supervisor_prompt(MockState(), config)
# Check if messages[0].content contains "Lance"
```

## Possible Root Causes

### 1. Stale Deployment
**Most Likely**: The LangGraph deployment might be using old code that returns a string instead of List[AnyMessage].

**Solution**: 
```bash
langgraph up --force
```

### 2. Config Not Being Passed Correctly
The frontend might not be passing the config correctly in all scenarios.

**Check**: Look at the LangGraph logs when a message is sent. The debug logging will show if `user_id` is present.

### 3. User ID Mismatch
The user_id in the frontend session might not match the one in the database.

**Check**: In the browser console, run:
```javascript
// Get the current user's ID from Supabase
const { data: { user } } = await supabase.auth.getUser();
console.log('Current user ID:', user?.id);
```

Compare this with the user_id in the `user_personalization` table.

## Quick Fix Checklist

1. [ ] Run `langgraph up --force` to ensure latest code is deployed
2. [ ] Verify user has personalization data: `python debug_personalization.py <user_id>`
3. [ ] Check LangGraph logs for debug messages about config and user_id
4. [ ] Ensure frontend is passing user_id in all chat interactions
5. [ ] Verify the user_id matches between auth session and personalization table

## Expected Behavior

When working correctly, Clera should:
1. Address the user by name (e.g., "Lance")
2. Reference their investment goals
3. Tailor advice to their risk tolerance
4. Consider their investment timeline
5. Use appropriate language for their experience level
6. Keep their monthly budget in mind
7. Reference their market interests

## Test Messages

Send these messages to verify personalization:
1. "What is my name?" - Should respond with the user's name if personalization is working
2. "How is my portfolio doing?" - Should use personalized language and context
3. "What should I invest in?" - Should consider goals, risk tolerance, and interests
