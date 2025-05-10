#!/bin/bash
set -e

# Disable AWS CLI pager globally
export AWS_PAGER=""

# This script updates AWS Application Load Balancer (ALB) attributes to properly support WebSockets
# It sets the idle timeout to 3600 seconds (1 hour) and configures stickiness for WebSocket connections

APP_NAME=${1:-clera-api}  # Default app name if not provided
ENV_NAME=${2:-production}  # Default environment if not provided

echo "=== WebSocket Configuration Tool ==="
echo "Looking for load balancers related to: $APP_NAME in $ENV_NAME environment"
echo ""

# Get all load balancers
echo "Listing all load balancers..."
ALL_LBS=$(aws elbv2 describe-load-balancers --output json)
LB_COUNT=$(echo "$ALL_LBS" | jq '.LoadBalancers | length')

echo "Found $LB_COUNT load balancers. Searching for your application's load balancer..."
echo ""

# Find load balancer by app name in tags or name
ALB_ARN=""
ALB_NAME=""

for (( i=0; i<$LB_COUNT; i++ ))
do
  # Extract ARN and name
  ARN=$(echo "$ALL_LBS" | jq -r ".LoadBalancers[$i].LoadBalancerArn")
  NAME=$(echo "$ALL_LBS" | jq -r ".LoadBalancers[$i].LoadBalancerName")
  TYPE=$(echo "$ALL_LBS" | jq -r ".LoadBalancers[$i].Type")
  
  # Only consider Application Load Balancers
  if [[ "$TYPE" != "application" ]]; then
    continue
  fi
  
  # Check if the name contains our app and env
  if [[ "$NAME" == *"$APP_NAME"* && "$NAME" == *"$ENV_NAME"* ]]; then
    echo "Found matching ALB: $NAME"
    ALB_ARN="$ARN"
    ALB_NAME="$NAME"
    break
  fi
  
  # If not found by name, check tags
  TAGS=$(aws elbv2 describe-tags --resource-arns "$ARN" --output json)
  APP_TAG=$(echo "$TAGS" | jq -r '.TagDescriptions[0].Tags[] | select(.Key=="copilot-application") | .Value')
  ENV_TAG=$(echo "$TAGS" | jq -r '.TagDescriptions[0].Tags[] | select(.Key=="copilot-environment") | .Value')
  
  if [[ "$APP_TAG" == "$APP_NAME" && "$ENV_TAG" == "$ENV_NAME" ]]; then
    echo "Found matching ALB by tags: $NAME"
    ALB_ARN="$ARN"
    ALB_NAME="$NAME"
    break
  fi
done

if [[ -z "$ALB_ARN" ]]; then
  echo "Could not find a matching Application Load Balancer. Available load balancers:"
  echo "$ALL_LBS" | jq -r '.LoadBalancers[] | select(.Type=="application") | .LoadBalancerName'
  echo ""
  echo "Please try again with the correct app name and environment."
  exit 1
fi

echo "Found Application Load Balancer: $ALB_NAME"
echo "ARN: $ALB_ARN"
echo ""

# Update ALB attributes
echo "Setting ALB idle timeout to 3600 seconds (1 hour)..."
aws elbv2 modify-load-balancer-attributes --load-balancer-arn "$ALB_ARN" \
  --attributes Key=idle_timeout.timeout_seconds,Value=3600

echo "Setting routing.http.drop_invalid_header_fields.enabled to false..."
aws elbv2 modify-load-balancer-attributes --load-balancer-arn "$ALB_ARN" \
  --attributes Key=routing.http.drop_invalid_header_fields.enabled,Value=false

# Get all target groups attached to this load balancer
echo "Finding target groups attached to this load balancer..."
LISTENERS=$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" --output json)
LISTENER_COUNT=$(echo "$LISTENERS" | jq '.Listeners | length')

TARGET_GROUP_ARNS=()

# Process each listener to find target groups
for (( i=0; i<$LISTENER_COUNT; i++ ))
do
  LISTENER_ARN=$(echo "$LISTENERS" | jq -r ".Listeners[$i].ListenerArn")
  
  # Get rules for this listener
  RULES=$(aws elbv2 describe-rules --listener-arn "$LISTENER_ARN" --output json)
  RULE_COUNT=$(echo "$RULES" | jq '.Rules | length')
  
  # Process each rule to find target groups
  for (( j=0; j<$RULE_COUNT; j++ ))
  do
    ACTIONS=$(echo "$RULES" | jq -r ".Rules[$j].Actions")
    TG_COUNT=$(echo "$ACTIONS" | jq 'length')
    
    for (( k=0; k<$TG_COUNT; k++ ))
    do
      ACTION_TYPE=$(echo "$ACTIONS" | jq -r ".[$k].Type")
      
      if [[ "$ACTION_TYPE" == "forward" ]]; then
        # Check if it's a single target group or group list
        if echo "$ACTIONS" | jq -e ".[$k].TargetGroupArn" > /dev/null; then
          TG_ARN=$(echo "$ACTIONS" | jq -r ".[$k].TargetGroupArn")
          TARGET_GROUP_ARNS+=("$TG_ARN")
        elif echo "$ACTIONS" | jq -e ".[$k].ForwardConfig" > /dev/null; then
          # Handle target group list in ForwardConfig
          TG_LIST=$(echo "$ACTIONS" | jq -r ".[$k].ForwardConfig.TargetGroups")
          TG_LIST_COUNT=$(echo "$TG_LIST" | jq 'length')
          
          for (( l=0; l<$TG_LIST_COUNT; l++ ))
          do
            TG_ARN=$(echo "$TG_LIST" | jq -r ".[$l].TargetGroupArn")
            TARGET_GROUP_ARNS+=("$TG_ARN")
          done
        fi
      fi
    done
  done
done

# Remove duplicates from target group list
TARGET_GROUP_ARNS=($(echo "${TARGET_GROUP_ARNS[@]}" | tr ' ' '\n' | sort -u | tr '\n' ' '))

if [[ ${#TARGET_GROUP_ARNS[@]} -eq 0 ]]; then
  echo "Warning: No target groups found for this load balancer!"
else
  echo "Found ${#TARGET_GROUP_ARNS[@]} target groups. Enabling sticky sessions for all of them..."
  
  # Enable stickiness for each target group
  for TG_ARN in "${TARGET_GROUP_ARNS[@]}"
  do
    # Get target group name
    TG_INFO=$(aws elbv2 describe-target-groups --target-group-arns "$TG_ARN" --output json)
    TG_NAME=$(echo "$TG_INFO" | jq -r '.TargetGroups[0].TargetGroupName')
    
    echo "Enabling stickiness for target group: $TG_NAME"
    
    aws elbv2 modify-target-group-attributes --target-group-arn "$TG_ARN" \
      --attributes Key=stickiness.enabled,Value=true Key=stickiness.type,Value=lb_cookie Key=stickiness.lb_cookie.duration_seconds,Value=86400
  done
fi

echo ""
echo "=== WebSocket Configuration Complete ==="
echo "* Load Balancer: $ALB_NAME"
echo "* Idle timeout: 3600 seconds (1 hour)"
echo "* Invalid headers: allowed"
echo "* Stickiness: Enabled with 24-hour cookie duration on ${#TARGET_GROUP_ARNS[@]} target groups"
echo ""
echo "Your WebSocket connections should now work properly in production!" 