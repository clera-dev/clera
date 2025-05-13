#!/bin/bash
set -e

# Disable AWS CLI pager globally
export AWS_PAGER=""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Get the backend directory (parent of copilot dir)
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

# This script configures the WebSocket ALB for optimal WebSocket handling
# It sets the idle timeout to 3600 seconds (1 hour) and ensures proper WebSocket settings

# Default values
DEFAULT_IDLE_TIMEOUT=300
DEFAULT_STICKINESS_DURATION=86400

echo -e "Configuring WebSocket ALB settings..."

# Set the target group ARN directly - this is the one for the websocket service on port 8001
TARGET_GROUP_ARN="arn:aws:elasticloadbalancing:us-west-1:039612860226:targetgroup/clera-Targe-OLK6NHZDSZFV/a87af012fda9e19a"

# Set the ALB ARN directly
ALB_ARN="arn:aws:elasticloadbalancing:us-west-1:039612860226:loadbalancer/app/clera--Publi-3zZfi5RHJKzZ/10178acb5d03ef5b"

echo "=== WebSocket ALB Configuration Tool ==="
echo "Using load balancer: clera--Publi-3zZfi5RHJKzZ"
echo "Using target group: clera-Targe-OLK6NHZDSZFV (port 8001)"

# Update the idle timeout
echo "Setting idle timeout to $DEFAULT_IDLE_TIMEOUT seconds..."
aws elbv2 modify-load-balancer-attributes \
    --load-balancer-arn $ALB_ARN \
    --attributes Key=idle_timeout.timeout_seconds,Value=$DEFAULT_IDLE_TIMEOUT

if [ $? -ne 0 ]; then
    echo "Failed to update idle timeout"
    exit 1
fi

# Enable sticky sessions on the target group
echo "Enabling sticky sessions with duration $DEFAULT_STICKINESS_DURATION seconds..."
aws elbv2 modify-target-group-attributes \
    --target-group-arn $TARGET_GROUP_ARN \
    --attributes Key=stickiness.enabled,Value=true Key=stickiness.type,Value=lb_cookie Key=stickiness.lb_cookie.duration_seconds,Value=$DEFAULT_STICKINESS_DURATION

if [ $? -ne 0 ]; then
    echo "Failed to enable sticky sessions"
    exit 1
fi

echo "WebSocket ALB configuration complete!"
echo "  - Load Balancer: clera--Publi-3zZfi5RHJKzZ"
echo "  - Target Group: clera-Targe-OLK6NHZDSZFV (port 8001)"
echo "  - Idle timeout: $DEFAULT_IDLE_TIMEOUT seconds"
echo "  - Sticky sessions: Enabled (duration: $DEFAULT_STICKINESS_DURATION seconds)"
echo ""
echo "Your WebSocket connections should now be properly configured for optimal performance!" 