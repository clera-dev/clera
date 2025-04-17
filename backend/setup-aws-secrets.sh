#!/bin/sh

# This script creates/updates the necessary secrets and configuration values 
# in AWS SSM Parameter Store by reading from the backend/.env file.

# Use sh compatible syntax
set -e

ENV_FILE="./.env"
SSM_PREFIX="/clera-api/production"

echo "Setting up AWS SSM Parameters for Clera API from $ENV_FILE"
echo "============================================================="
echo

# Function to check if AWS CLI is installed
check_aws_cli() {
    if ! command -v aws > /dev/null 2>&1; then
        echo "Error: AWS CLI is not installed. Please install it first."
        exit 1
    fi
}

# Function to check if user is logged in to AWS
check_aws_auth() {
    echo "Checking AWS authentication..."
    if ! aws sts get-caller-identity > /dev/null 2>&1; then
        echo "Error: You are not authenticated with AWS. Please run 'aws configure' first."
        exit 1
    fi
    echo "AWS authentication verified."
}

# Function to put a parameter in SSM
# Usage: put_ssm_parameter <ENV_VAR_NAME> <SSM_PARAM_NAME> <TYPE: String|SecureString>
put_ssm_parameter() {
    env_var_name="$1"
    ssm_param_name="$2"
    type="$3"
    
    # Extract value from .env file, handling potential comments and whitespace
    # Use grep to find the line, sed to remove comments and surrounding whitespace/quotes
    value=$(grep "^${env_var_name}=" "$ENV_FILE" | sed -e 's/^[^=]*=//' -e 's/#.*//' -e 's/^[ "']*//' -e 's/[ "']*$//')

    if [ -z "$value" ]; then
        echo "Skipping SSM parameter: $ssm_param_name (Variable $env_var_name not found or empty in $ENV_FILE)"
        return
    fi

    echo "Setting SSM parameter: $ssm_param_name (Type: $type) from ENV var: $env_var_name"
    aws ssm put-parameter \
        --name "$ssm_param_name" \
        --value "$value" \
        --type "$type" \
        --overwrite --tier Standard # Explicitly set tier
    
    if [ $? -ne 0 ]; then
        echo "Error setting parameter $ssm_param_name. Please check AWS permissions or the value in $ENV_FILE."
        # Decide if you want to exit on first error or continue
        # exit 1 
    fi
}

# --- Main Script Logic ---

check_aws_cli
check_aws_auth

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: $ENV_FILE not found in the current directory."
    echo "Please run this script from the 'backend' directory containing the .env file."
    exit 1
fi

echo "Reading configuration from $ENV_FILE..."

# Map ENV VAR NAME -> SSM PARAMETER NAME -> TYPE
# Add all required variables from manifest secrets/variables that should come from .env
# Secrets (SecureString)
put_ssm_parameter "NEXT_PUBLIC_SUPABASE_ANON_KEY" "${SSM_PREFIX}/next_public_supabase_anon_key" "SecureString"
put_ssm_parameter "SUPABASE_SERVICE_ROLE_KEY" "${SSM_PREFIX}/supabase_service_role_key" "SecureString"
put_ssm_parameter "GROQ_API_KEY" "${SSM_PREFIX}/groq_api_key" "SecureString"
put_ssm_parameter "OPENAI_API_KEY" "${SSM_PREFIX}/openai_api_key" "SecureString"
put_ssm_parameter "PINECONE_API_KEY" "${SSM_PREFIX}/pinecone_api_key" "SecureString"
put_ssm_parameter "ANTHROPIC_API_KEY" "${SSM_PREFIX}/anthropic_api_key" "SecureString"
put_ssm_parameter "TAVILY_API_KEY" "${SSM_PREFIX}/tavily_api_key" "SecureString"
put_ssm_parameter "PPLX_API_KEY" "${SSM_PREFIX}/pplx_api_key" "SecureString"
put_ssm_parameter "RETELL_API_KEY" "${SSM_PREFIX}/retell_api_key" "SecureString"
put_ssm_parameter "LANGSMITH_API_KEY" "${SSM_PREFIX}/langsmith_api_key" "SecureString"
put_ssm_parameter "LANGGRAPH_API_KEY" "${SSM_PREFIX}/langgraph_api_key" "SecureString"
put_ssm_parameter "BROKER_API_KEY" "${SSM_PREFIX}/broker_api_key" "SecureString"
put_ssm_parameter "BROKER_SECRET_KEY" "${SSM_PREFIX}/broker_secret_key" "SecureString"
put_ssm_parameter "APCA_API_KEY_ID" "${SSM_PREFIX}/apca_api_key_id" "SecureString"
put_ssm_parameter "APCA_API_SECRET_KEY" "${SSM_PREFIX}/apca_api_secret_key" "SecureString"
put_ssm_parameter "FINANCIAL_MODELING_PREP_API_KEY" "${SSM_PREFIX}/financial_modeling_prep_api_key" "SecureString"
put_ssm_parameter "CARTESIA_API_KEY" "${SSM_PREFIX}/cartesia_api_key" "SecureString"
put_ssm_parameter "DEEPGRAM_API_KEY" "${SSM_PREFIX}/deepgram_api_key" "SecureString"
put_ssm_parameter "LIVEKIT_API_KEY" "${SSM_PREFIX}/livekit_api_key" "SecureString"
put_ssm_parameter "LIVEKIT_API_SECRET" "${SSM_PREFIX}/livekit_api_secret" "SecureString"
put_ssm_parameter "BACKEND_API_KEY" "${SSM_PREFIX}/backend_api_key" "SecureString"
put_ssm_parameter "PLAID_CLIENT_ID" "${SSM_PREFIX}/plaid_client_id" "SecureString"
put_ssm_parameter "PLAID_SECRET" "${SSM_PREFIX}/plaid_secret" "SecureString"

# Dynamic Config (String)
put_ssm_parameter "NEXT_PUBLIC_SUPABASE_URL" "${SSM_PREFIX}/next_public_supabase_url" "String"
put_ssm_parameter "SUPABASE_URL" "${SSM_PREFIX}/supabase_url" "String"
put_ssm_parameter "LANGGRAPH_API_URL" "${SSM_PREFIX}/langgraph_api_url" "String"
put_ssm_parameter "LIVEKIT_URL" "${SSM_PREFIX}/livekit_url" "String"
# If BACKEND_PUBLIC_URL needs to be dynamic, add it here too:
# put_ssm_parameter "BACKEND_PUBLIC_URL" "${SSM_PREFIX}/backend_public_url" "String"

echo 
echo "SSM Parameter update process finished!"
echo "Check logs above for any errors."
echo "You can now run ./deploy-to-aws.sh (it will run this script again automatically)." 