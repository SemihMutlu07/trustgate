#!/bin/bash
set -e

PROJECT_ID="trustgate-dev-505913"
REGION="europe-west1"
SERVICE_NAME="trustgate"

echo "========================================================"
echo "  Deploying Agent Trust Gate to Google Cloud Run"
echo "  Project: ${PROJECT_ID} (${REGION})"
echo "========================================================"

# 1. Enable Required GCP APIs
echo "--> Enabling Cloud Run and Artifact Registry APIs..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com --project="${PROJECT_ID}"

# 2. Deploy to Cloud Run (Scale-to-Zero)
echo "--> Deploying service '${SERVICE_NAME}' to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --min-instances=0 \
  --max-instances=2 \
  --memory=512Mi \
  --cpu=1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,GEMINI_API_KEY=${GEMINI_API_KEY}"

echo "========================================================"
echo "✅ Deployment Successful!"
echo "Get Service URL with: gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)'"
echo "========================================================"
