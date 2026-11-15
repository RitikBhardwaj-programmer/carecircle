#!/usr/bin/env bash
# One-time Google Cloud setup for CareCircle. Idempotent where gcloud allows it.
# Usage: PROJECT=my-project REGION=asia-south1 ./scripts/gcp-setup.sh
# Creates no secret values in the shell history: SESSION_SECRET is generated and piped straight into Secret Manager.
set -euo pipefail

: "${PROJECT:?set PROJECT}"
REGION="${REGION:-asia-south1}"
RUN_SA="carecircle-run@${PROJECT}.iam.gserviceaccount.com"
SCHED_SA="carecircle-scheduler@${PROJECT}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT"

# APIs: Cloud Run, Cloud Build, Artifact Registry, Firestore, Vertex AI, Cloud Scheduler, Secret Manager.
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com aiplatform.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com

# Firestore in Native mode, same region as Cloud Run.
gcloud firestore databases create --location="$REGION" --type=firestore-native 2>/dev/null || echo "Firestore database exists"

# Least-privilege runtime identity: only Firestore, Vertex AI and reading secrets.
gcloud iam service-accounts create carecircle-run --display-name "CareCircle Cloud Run" 2>/dev/null || true
for role in roles/datastore.user roles/aiplatform.user roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:${RUN_SA}" --role "$role" --condition=None --quiet >/dev/null
done

# Identity that Cloud Scheduler uses to sign its OIDC token for the cron route.
gcloud iam service-accounts create carecircle-scheduler --display-name "CareCircle Scheduler invoker" 2>/dev/null || true

# Session signing key, generated locally and never printed.
if ! gcloud secrets describe SESSION_SECRET >/dev/null 2>&1; then
  openssl rand -base64 48 | tr -d '\n' | gcloud secrets create SESSION_SECRET --replication-policy=automatic --data-file=-
fi

echo "Setup done. Runtime SA: ${RUN_SA}  Scheduler SA: ${SCHED_SA}"
