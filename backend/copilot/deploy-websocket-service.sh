#!/bin/bash
set -e

# Colors for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Get the backend directory (parent of copilot dir)
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

APP_NAME=${1:-clera-api}
ENV_NAME=${2:-production}
SERVICE_NAME="websocket-lb-service"

echo -e "${BLUE}=== Clera WebSocket Service Deployment Script ===${NC}"
echo -e "${BLUE}Application:${NC} $APP_NAME"
echo -e "${BLUE}Environment:${NC} $ENV_NAME"
echo -e "${BLUE}Service:${NC} $SERVICE_NAME"
echo -e "${BLUE}Backend Directory:${NC} $BACKEND_DIR"
echo ""

# Make sure our script is executable using the full path
chmod +x "${SCRIPT_DIR}/websocket-lb-settings.sh"

# Deploy the service - must run from backend directory
echo -e "${BLUE}Deploying WebSocket service via Copilot...${NC}"
cd "$BACKEND_DIR"
copilot svc deploy \
    --app $APP_NAME \
    --env $ENV_NAME \
    --name $SERVICE_NAME

# Get the newly created ALB information
echo -e "${BLUE}Configuring WebSocket ALB settings...${NC}"
"${SCRIPT_DIR}/websocket-lb-settings.sh" $APP_NAME $ENV_NAME $SERVICE_NAME

# Get the ALB DNS name
echo -e "${BLUE}Retrieving ALB DNS name...${NC}"
LB_INFO=$(aws cloudformation describe-stacks \
    --stack-name "${APP_NAME}-${ENV_NAME}-${SERVICE_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='PublicLoadBalancerDNSName'].OutputValue" \
    --output text)

if [ -n "$LB_INFO" ]; then
    echo -e "${GREEN}WebSocket ALB DNS Name: ${LB_INFO}${NC}"
    echo -e "${YELLOW}Important: Create a CNAME record for ws.askclera.com pointing to this DNS name${NC}"
    
    # Show instructions
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo "1. Create a CNAME record in your DNS provider:"
    echo "   - Name: ws.askclera.com"
    echo "   - Value: ${LB_INFO}"
    echo "   - TTL: 300"
    echo ""
    echo "2. Update your frontend WebSocket connection URL to use wss://ws.askclera.com/ws/portfolio/{accountId}"
    echo ""
    echo "3. Update and deploy your frontend code"
    echo ""
    echo "4. Test the WebSocket connection"
else
    echo -e "${RED}Could not retrieve ALB DNS name. Please check the CloudFormation stack manually.${NC}"
fi

echo -e "${GREEN}WebSocket service deployment completed!${NC}" 