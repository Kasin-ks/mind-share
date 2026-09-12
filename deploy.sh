#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Parse command line arguments
ENV=""
if [[ "$1" == "--dev" ]]; then
    ENV="dev"
elif [[ "$1" == "--stg" ]]; then
    ENV="stg"
elif [[ "$1" == "--prd" ]]; then
    ENV="prd"
else
    echo "❌ Error: Invalid or missing environment argument"
    echo "Usage: ./deploy.sh [--dev|--stg|--prd]"
    exit 1
fi

# Configuration variables (edit as needed)
PROJECT_PREFIX="mind-share-project"
REGION="asia-east1"
PROJECT_ID="mind-share-project"
REPOSITORY="${PROJECT_PREFIX}-repo"
TAG="latest"
PORT=3000

# Environment-specific variables (using pattern: {PROJECT_PREFIX}-{env})
IMAGE_NAME="${PROJECT_PREFIX}-${ENV}"
SERVICE_NAME="${PROJECT_PREFIX}-${ENV}"
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/$IMAGE_NAME:$TAG"
ENV_FILE=".env.$ENV"

# Environment-specific resource configuration
if [[ "$ENV" == "dev" ]]; then
    CPU="1"
    MEMORY="512Mi"
    MIN_INSTANCES="0"
    MAX_INSTANCES="2"
elif [[ "$ENV" == "stg" ]]; then
    CPU="2"
    MEMORY="1Gi"
    MIN_INSTANCES="0"
    MAX_INSTANCES="5"
elif [[ "$ENV" == "prd" ]]; then
    CPU="2"
    MEMORY="2Gi"
    MIN_INSTANCES="1"
    MAX_INSTANCES="10"
fi

echo "🚀 Deploying to $ENV environment..."
echo "📦 Image: $IMAGE_URI"
echo "🔧 Service: $SERVICE_NAME"
echo "📄 Env file: $ENV_FILE"
echo "📊 Resources: CPU=$CPU, Memory=$MEMORY, Min=$MIN_INSTANCES, Max=$MAX_INSTANCES"

# Check disk space before building
echo "❇️ Checking disk space..."
AVAILABLE_BYTES=$(df / | tail -1 | awk '{print $4}')
AVAILABLE_GB=$((AVAILABLE_BYTES / 1024 / 1024))
MIN_REQUIRED_GB=5

if [ "$AVAILABLE_GB" -lt "$MIN_REQUIRED_GB" ]; then
    echo "⚠️  WARNING: Low disk space detected (${AVAILABLE_GB}GB available)"
    echo "⚠️  Docker builds require at least ${MIN_REQUIRED_GB}GB of free space"
    echo "⚠️  Please free up disk space before continuing"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI is not installed."
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "⚠️  Not authenticated. Running gcloud auth login..."
    gcloud auth login
fi

echo "❇️ Setting Google Cloud project..."
gcloud config set project $PROJECT_ID

echo "❇️ Enabling required APIs..."
gcloud services enable artifactregistry.googleapis.com
gcloud services enable run.googleapis.com

echo "❇️ Creating Artifact Registry repository (if not exists)..."
gcloud artifacts repositories create $REPOSITORY \
    --repository-format=docker \
    --location=$REGION 2>/dev/null || echo "❇️ Repository already exists, skipping creation..."

echo "❇️ Configuring Docker authentication for Artifact Registry..."
gcloud auth configure-docker $REGION-docker.pkg.dev

echo "❇️ Running linting checks..."
set +e
pnpm lint
LINT_EXIT_CODE=$?
set -e
if [ $LINT_EXIT_CODE -ne 0 ]; then
    echo "❌ Linting failed! Build aborted."
    exit 1
fi
echo "✅ Linting passed!"
DEPLOY_START=$(date +%s)

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: $ENV_FILE not found!"
    echo "Please create $ENV_FILE with required environment variables."
    exit 1
fi

echo "❇️ Updating NEXT_PUBLIC_VERSION with git hash..."
GIT_HASH=$(git rev-parse --short HEAD)

if [ -f "$ENV_FILE" ]; then
    # Update NEXT_PUBLIC_VERSION to replace or append git hash
    if grep -q "NEXT_PUBLIC_VERSION=" "$ENV_FILE"; then
        # Backup the original file
        cp "$ENV_FILE" "${ENV_FILE}.bak"
        # Use sed to replace the line, handling both macOS and Linux sed syntax
        # First, try to replace hash if + sign exists, otherwise append +hash
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # Replace hash after + sign if it exists
            sed -i '' "s/\(NEXT_PUBLIC_VERSION=[^+]*+\).*$/\1${GIT_HASH}/" "$ENV_FILE"
            # If no + sign, append +hash to the end of the line
            sed -i '' "s/^\(NEXT_PUBLIC_VERSION=[^+]*\)$/\1+${GIT_HASH}/" "$ENV_FILE"
        else
            # Replace hash after + sign if it exists
            sed -i "s/\(NEXT_PUBLIC_VERSION=[^+]*+\).*$/\1${GIT_HASH}/" "$ENV_FILE"
            # If no + sign, append +hash to the end of the line
            sed -i "s/^\(NEXT_PUBLIC_VERSION=[^+]*\)$/\1+${GIT_HASH}/" "$ENV_FILE"
        fi
        echo "✅ Updated NEXT_PUBLIC_VERSION with git hash: ${GIT_HASH}"
    else
        echo "⚠️  NEXT_PUBLIC_VERSION not found in $ENV_FILE"
    fi
else
    echo "⚠️  $ENV_FILE not found, skipping version update"
fi

BUILD_START=$(date +%s)
export DOCKER_BUILDKIT=1
echo "❇️ Pulling previous image for cache (if any)..."
docker pull $IMAGE_URI 2>/dev/null || true

echo "❇️ Building Docker image for $IMAGE_URI with ENV=$ENV..."
docker build --platform=linux/amd64 \
    --cache-from $IMAGE_URI \
    -f apps/web/Dockerfile \
    --build-arg ENV=$ENV \
    -t $IMAGE_URI .

echo "   ⏱️  Docker build: $(($(date +%s) - BUILD_START))s"

PUSH_START=$(date +%s)
echo "❇️ Pushing Docker image to Artifact Registry ..."
docker push $IMAGE_URI
echo "   ⏱️  Docker push: $(($(date +%s) - PUSH_START))s"

echo "❇️ Parsing environment variables from $ENV_FILE..."
# Parse .env file and convert to KEY=VALUE format for gcloud
# Filters out comments and empty lines, handles quoted values
ENV_VARS=""
while IFS= read -r line || [ -n "$line" ]; do
  # Skip empty lines and comments
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  
  # Remove leading/trailing whitespace
  line=$(echo "$line" | xargs)
  
  # Skip if line doesn't contain =
  [[ ! "$line" =~ = ]] && continue
  
  # Extract key (everything before first =)
  key=$(echo "$line" | sed 's/=.*//' | xargs)
  # Extract value (everything after first =)
  value=$(echo "$line" | sed 's/[^=]*=//' | xargs)
  
  # Skip if key is empty
  [[ -z "$key" ]] && continue
  
  # Skip Google Cloud Run reserved environment variables
  # For services: PORT, K_SERVICE, K_REVISION, K_CONFIGURATION
  # For jobs: CLOUD_RUN_JOB, CLOUD_RUN_EXECUTION, CLOUD_RUN_TASK_INDEX, CLOUD_RUN_TASK_ATTEMPT, CLOUD_RUN_TASK_COUNT
  if [[ "$key" == "PORT" ]] || \
     [[ "$key" == "K_SERVICE" ]] || \
     [[ "$key" == "K_REVISION" ]] || \
     [[ "$key" == "K_CONFIGURATION" ]] || \
     [[ "$key" == "CLOUD_RUN_JOB" ]] || \
     [[ "$key" == "CLOUD_RUN_EXECUTION" ]] || \
     [[ "$key" == "CLOUD_RUN_TASK_INDEX" ]] || \
     [[ "$key" == "CLOUD_RUN_TASK_ATTEMPT" ]] || \
     [[ "$key" == "CLOUD_RUN_TASK_COUNT" ]]; then
    echo "⚠️  Skipping reserved variable: $key"
    continue
  fi
  
  # Handle quoted values - preserve quotes if they wrap the entire value
  # This helps gcloud handle values with commas or special characters
  if [[ "$value" =~ ^\".*\"$ ]] || [[ "$value" =~ ^\'.*\'$ ]]; then
    # Value is already properly quoted, keep as is
    :
  elif [[ "$value" =~ , ]]; then
    # Value contains comma, quote it
    value="\"${value}\""
  fi
  
  # Append to ENV_VARS with comma separator
  if [ -z "$ENV_VARS" ]; then
    ENV_VARS="${key}=${value}"
  else
    ENV_VARS="${ENV_VARS},${key}=${value}"
  fi
done < "$ENV_FILE"

if [ -z "$ENV_VARS" ]; then
  echo "⚠️  No environment variables found in $ENV_FILE"
else
  echo "✅ Found environment variables in $ENV_FILE"
fi

RUN_DEPLOY_START=$(date +%s)
echo "❇️ Deploying to Google Cloud Run ..."
echo "📊 Resource configuration:"
echo "   CPU: $CPU"
echo "   Memory: $MEMORY"
echo "   Min Instances: $MIN_INSTANCES"
echo "   Max Instances: $MAX_INSTANCES"

if [ -n "$ENV_VARS" ]; then
  gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_URI \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --port $PORT \
    --cpu $CPU \
    --memory $MEMORY \
    --min-instances $MIN_INSTANCES \
    --max-instances $MAX_INSTANCES \
    --set-env-vars "$ENV_VARS"
else
  gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_URI \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --port $PORT \
    --cpu $CPU \
    --memory $MEMORY \
    --min-instances $MIN_INSTANCES \
    --max-instances $MAX_INSTANCES
fi
echo "   ⏱️  Cloud Run deploy: $(($(date +%s) - RUN_DEPLOY_START))s"

# Restore backup if it exists
if [ -f "${ENV_FILE}.bak" ]; then
    mv "${ENV_FILE}.bak" "$ENV_FILE"
    echo "✅ Restored original $ENV_FILE"
fi

TOTAL=$(( $(date +%s) - DEPLOY_START ))
echo "✅ Deployment complete! Total: ${TOTAL}s"
