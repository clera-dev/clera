# Stripe Model Context Protocol (MCP) Integration

This guide documents how to use Stripe's MCP server to allow AI agents (like Cursor AI) to interact with the Stripe API directly.

## What is Stripe MCP?

The Stripe Model Context Protocol (MCP) server provides a set of tools that AI agents can use to:
- Interact with the Stripe API programmatically
- Search Stripe's knowledge base (documentation and support articles)
- Perform common Stripe operations through natural language

## Quick Setup

### Cursor IDE (Recommended)

The Stripe MCP is configured in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "stripe": {
      "url": "https://mcp.stripe.com"
    }
  }
}
```

After adding this configuration:
1. Restart Cursor IDE
2. The MCP server will prompt you to authenticate with Stripe via OAuth
3. Once authenticated, Cursor can interact with your Stripe account

### VS Code

Add the following to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "stripe": {
      "type": "http",
      "url": "https://mcp.stripe.com"
    }
  }
}
```

## Authentication

The Stripe MCP server uses **OAuth** for secure authentication, following the [MCP specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization#2-1-1-oauth-grant-types).

### OAuth Benefits
- More secure than using secret keys directly
- Granular permissions control
- User-based authorization
- Easy session management

### Managing MCP Sessions

1. Navigate to your [Stripe Dashboard User Settings](https://dashboard.stripe.com/settings/user)
2. Find the **OAuth sessions** section
3. You can view and revoke access for any MCP client

### Revoking Access

1. Go to [User Settings](https://dashboard.stripe.com/settings/user)
2. Scroll to **OAuth sessions**
3. Find the client session
4. Click the overflow menu (⋮)
5. Select **Revoke access**

## Alternative: Local MCP Server

If you prefer a local setup (or need offline access), you can run the Stripe MCP server locally.

### Cursor (Local Setup)

```json
{
  "mcpServers": {
    "stripe": {
      "command": "npx",
      "args": ["-y", "@stripe/mcp", "--tools=all"],
      "env": {
        "STRIPE_SECRET_KEY": "sk_test_..."
      }
    }
  }
}
```

### CLI

Start the MCP server locally:

```bash
npx -y @stripe/mcp --tools=all --api-key=sk_test_...
```

**Note:** For local setup, use a [restricted API key](https://docs.stripe.com/keys#create-restricted-api-secret-key) to limit access to only the functionality you need.

## Available MCP Tools

The Stripe MCP server exposes the following tools that AI agents can use:

| Category | Tool | Description |
|----------|------|-------------|
| **Account** | `get_stripe_account_info` | Retrieve account information |
| **Balance** | `retrieve_balance` | Check current balance |
| **Coupon** | `create_coupon` | Create discount coupons |
| | `list_coupons` | List all coupons |
| **Customer** | `create_customer` | Create new customers |
| | `list_customers` | List all customers |
| **Dispute** | `list_disputes` | List payment disputes |
| | `update_dispute` | Update dispute information |
| **Invoice** | `create_invoice` | Create invoices |
| | `create_invoice_item` | Add items to invoices |
| | `finalize_invoice` | Finalize and send invoices |
| | `list_invoices` | List all invoices |
| **Payment Link** | `create_payment_link` | Create shareable payment links |
| **PaymentIntent** | `list_payment_intents` | List payment intents |
| **Price** | `create_price` | Create pricing tiers |
| | `list_prices` | List all prices |
| **Product** | `create_product` | Create products |
| | `list_products` | List all products |
| **Refund** | `create_refund` | Process refunds |
| **Subscription** | `cancel_subscription` | Cancel subscriptions |
| | `list_subscriptions` | List all subscriptions |
| | `update_subscription` | Modify subscriptions |
| **Utility** | `search_stripe_resources` | Search Stripe objects |
| | `fetch_stripe_resources` | Fetch specific Stripe objects |
| | `search_stripe_documentation` | Search Stripe docs/knowledge base |

## Example Use Cases for Clera

With Stripe MCP enabled, you can ask Cursor to:

### Subscription Management
- "List all active subscriptions for Clera Plus"
- "How many customers are on the $10/month plan?"
- "Show me recent subscription cancellations"

### Customer Operations
- "Create a test customer for development"
- "List customers who signed up this week"
- "Search for customer by email"

### Invoice & Payment
- "List recent payment intents"
- "Show me any failed payments in the last 7 days"
- "Create a refund for payment pi_xxx"

### Product Setup
- "List all products and their prices"
- "Create a new promotional coupon for 20% off"
- "Update the Clera Plus price to $15/month"

### Documentation Search
- "Search Stripe docs for webhook best practices"
- "How do I handle subscription lifecycle events?"
- "What's the best way to implement idempotency?"

## Security Best Practices

1. **Use OAuth (recommended)**: The remote MCP server at `https://mcp.stripe.com` uses OAuth, which is more secure than API keys

2. **Use restricted API keys**: If using the local MCP server, create a restricted API key with only the permissions you need

3. **Test mode first**: Always test with test mode keys (`sk_test_...`) before using live mode

4. **Review before executing**: Enable human confirmation for MCP tool calls to review actions before they execute

5. **Monitor sessions**: Regularly review your OAuth sessions in Stripe Dashboard and revoke any you don't recognize

## Troubleshooting

### MCP not connecting
1. Ensure Cursor is restarted after adding `mcp.json`
2. Check that the JSON syntax is valid
3. Try the OAuth flow again

### Authentication errors
1. Go to Stripe Dashboard → User Settings → OAuth sessions
2. Revoke the existing session
3. Restart Cursor and re-authenticate

### Tool calls failing
1. Verify you're authenticated (check OAuth sessions in Dashboard)
2. Ensure your account has the required permissions
3. Check if you're in test mode vs live mode

### Local server not starting
1. Ensure Node.js is installed
2. Check that `STRIPE_SECRET_KEY` is set correctly
3. Try running `npx -y @stripe/mcp --tools=all` manually to see errors

## Related Documentation

- [00-QUICK-START.md](./00-QUICK-START.md) - Test vs Live mode setup
- [01-WEBHOOK-SETUP.md](./01-WEBHOOK-SETUP.md) - Webhook configuration
- [03-PRODUCTION-CHECKLIST.md](./03-PRODUCTION-CHECKLIST.md) - Production readiness
- [Stripe MCP Official Docs](https://docs.stripe.com/mcp)
- [Stripe Building with LLMs Guide](https://docs.stripe.com/building-with-llms)

## Building Autonomous Agents

For building agentic software that interacts with Stripe programmatically:

```bash
curl https://mcp.stripe.com/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_..." \
  -d '{
      "jsonrpc": "2.0",
      "method": "tools/call",
      "params": {
        "name": "list_subscriptions",
        "arguments": {"status": "active"}
      },
      "id": 1
  }'
```

For more information, see [Stripe's agent documentation](https://docs.stripe.com/agents).
