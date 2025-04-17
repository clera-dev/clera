#!/bin/bash

echo "==================================================="
echo "AWS Copilot Deployment Helper for Clera API Backend"
echo "==================================================="
echo

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if Copilot CLI is installed
if ! command -v copilot &> /dev/null; then
    echo "Error: AWS Copilot CLI is not installed. Please install it first."
    exit 1
fi

# Check if user is logged in to AWS
echo "Checking AWS authentication..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "Error: You are not authenticated with AWS. Please run 'aws configure' first."
    exit 1
fi

# Check for existing stacks that might be in a failed state
echo "Checking for existing Copilot stacks..."
stacks=$(aws cloudformation list-stacks --stack-status-filter CREATE_FAILED ROLLBACK_COMPLETE ROLLBACK_FAILED --query "StackSummaries[?contains(StackName, 'clera-api')].StackName" --output text)

if [ ! -z "$stacks" ]; then
    echo "Found the following stacks that might need cleanup:"
    echo "$stacks"
    read -p "Do you want to delete these stacks? (y/n): " CLEANUP
    
    if [[ "$CLEANUP" =~ ^[Yy]$ ]]; then
        for stack in $stacks; do
            echo "Deleting stack $stack..."
            aws cloudformation delete-stack --stack-name $stack
            echo "Waiting for stack deletion to complete..."
            aws cloudformation wait stack-delete-complete --stack-name $stack
        done
        echo "Stacks deleted successfully."
    fi
fi

# Set up secrets first
# echo "Updating required secrets and config values in AWS SSM Parameter Store from .env file..."
# echo "This is needed for your application to function correctly."
# echo

# Use the separate script for setting up secrets (now reads from .env)
# Make sure it's executable first
# chmod +x ./setup-aws-secrets.sh
# ./setup-aws-secrets.sh

# if [ $? -ne 0 ]; then
#     echo "SSM Parameter setup failed. Aborting deployment."
#     exit 1
# fi
echo "Skipping SSM Parameter setup as parameters are confirmed to exist."

# Clean up any local Copilot state that might be corrupted
echo "Cleaning up local Copilot cache..."
mkdir -p ~/.copilot-backup
cp -r ~/.copilot/* ~/.copilot-backup/ 2>/dev/null || true
rm -rf ~/.copilot/* 2>/dev/null || true

# Make sure we're in the right directory (redundant if already cd'd, but safe)
cd "$(dirname "$0")"

# Initialize application if necessary
echo "Checking for existing Copilot application..."
EXISTING_APP=$(copilot app ls 2>/dev/null | grep "clera-api" || echo "")

if [ -z "$EXISTING_APP" ]; then
    echo "No existing application found. Initializing new application..."
    copilot app init clera-api # Provide app name directly
else
    echo "Existing application found: $EXISTING_APP"
fi

# Initialize environment if necessary
echo "Checking for existing Copilot environment..."
EXISTING_ENV=$(copilot env ls 2>/dev/null | grep "production" || echo "")

if [ -z "$EXISTING_ENV" ]; then
    echo "No existing environment found. Initializing production environment..."
    # Assume default profile or add --profile flag if needed
    copilot env init --name production --app clera-api --default-config 
else
    echo "Existing environment found: $EXISTING_ENV"
fi

# Deploy the environment first
echo "Deploying environment infrastructure... (This may take several minutes)"
copilot env deploy --name production

if [ $? -ne 0 ]; then
    echo "Environment deployment failed. Aborting service deployment."
    exit 1
fi

# Initialize service if necessary
echo "Checking for existing Copilot service..."
EXISTING_SVC=$(copilot svc ls 2>/dev/null | grep "api-service" || echo "")

if [ -z "$EXISTING_SVC" ]; then
    echo "No existing service found. Initializing API service..."
    copilot svc init --app clera-api --name api-service --svc-type "Load Balanced Web Service" --dockerfile "./Dockerfile" --port 8000
else
    echo "Existing service found: $EXISTING_SVC"
fi

# Deploy the service
echo "Deploying the API service... (This may also take several minutes)"
copilot svc deploy --name api-service --env production

# Check for successful deployment
if [ $? -eq 0 ]; then
    echo "========================================================="
    echo "Deployment completed successfully!"
    echo "========================================================="
    
    # Show service endpoint
    echo "Getting service endpoint..."
    copilot svc show --name api-service --env production
else
    echo "========================================================="
    echo "Deployment failed. The ECS service couldn't stabilize."
    echo "This is often due to the application crashing on startup."
    echo "Please check the application logs carefully for errors."
    echo "========================================================="
    echo "To view logs, run:"
    echo "copilot svc logs --name api-service --env production --since 10m"
    
    # Try to get some debug information
    echo
    echo "Attempting to show recent logs for debugging (Ctrl+C to stop):"
    copilot svc logs --name api-service --env production --follow
fi 