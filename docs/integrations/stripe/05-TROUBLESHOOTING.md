# Stripe CLI Troubleshooting

## Permission Denied Error

### Problem
```
mkdir /Users/cristian_mendoza/.config/stripe: permission denied
```

This happens when the `~/.config` directory is owned by `root` instead of your user.

### Solution 1: Fix Directory Ownership (Recommended)

Run this command (you'll need to enter your Mac password):

```bash
sudo chown -R $(whoami):staff ~/.config
```

Then try `stripe login` again.

### Solution 2: Use Alternative Config Location

Set the Stripe config directory to a location you own:

```bash
export STRIPE_CONFIG_DIR="$HOME/.stripe"
mkdir -p "$STRIPE_CONFIG_DIR"
stripe login
```

Add this to your `~/.zshrc` to make it permanent:

```bash
echo 'export STRIPE_CONFIG_DIR="$HOME/.stripe"' >> ~/.zshrc
source ~/.zshrc
```

### Solution 3: Create Directory Manually

If you have admin access, you can create the directory manually:

```bash
sudo mkdir -p ~/.config/stripe
sudo chown -R $(whoami):staff ~/.config/stripe
```

Then try `stripe login` again.

## Other Common Issues

### "Command not found: stripe"
- Install: `brew install stripe/stripe-cli/stripe`
- Verify: `stripe --version`

### "Received invalid flags for this command"
- You're using Stripe Shell (browser) - it doesn't support `--forward-to`
- Install Stripe CLI on your machine instead

### Webhook events not forwarding
- Make sure `stripe listen` is still running
- Check that your Next.js server is running on port 3000
- Verify the endpoint path matches: `/api/stripe/webhook`



