#!/usr/bin/env bash
# Builds with Cloud Build (source deploy), deploys to Cloud Run and (re)creates the reminder Scheduler job.
# Usage: PROJECT=my-project REGION=asia-south1 ./scripts/deploy.sh
# Optional: set USE_SMTP=1 after creating the SMTP_USER and SMTP_PASS secrets to send real email.
set -euo pipefail

: "${PROJECT:?set PROJECT}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-carecircle}"
RUN_SA="carecircle-run@${PROJECT}.iam.gserviceaccount.com"
SCHED_SA="carecircle-scheduler@${PROJECT}.iam.gserviceaccount.com"
NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
URL="https://${SERVICE}-${NUMBER}.${REGION}.run.app"

SECRETS="SESSION_SECRET=SESSION_SECRET:latest"
if [ "${USE_SMTP:-0}" = "1" ]; then SECRETS="${SECRETS},SMTP_USER=SMTP_USER:latest,SMTP_PASS=SMTP_PASS:latest"; fi

gcloud run deploy "$SERVICE" --source . --region "$REGION" --project "$PROJECT" \
  --allow-unauthenticated \
  --service-account "$RUN_SA" \
  --set-secrets "$SECRETS" \
  --set-env-vars "APP_URL=${URL},DATA_STORE=firestore,GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=gemini-3.8-flash,CRON_INVOKER_EMAIL=${SCHED_SA}" \
  --memory 512Mi --cpu 1 --min-instances 0 --max-instances 3 --timeout 60 --quiet

# Only the scheduler identity may invoke the service as a principal (the route also checks the OIDC token).
gcloud run services add-iam-policy-binding "$SERVICE" --region "$REGION" --project "$PROJECT" \
  --member "serviceAccount:${SCHED_SA}" --role roles/run.invoker --quiet >/dev/null

# Every 5 minutes, POST /api/cron/reminders with an OIDC token whose audience is the route URL.
JOB_ARGS=(--location "$REGION" --project "$PROJECT" --schedule "*/5 * * * *" --http-method POST
  --uri "${URL}/api/cron/reminders" --oidc-service-account-email "$SCHED_SA"
  --oidc-token-audience "${URL}/api/cron/reminders" --time-zone "Asia/Kolkata" --attempt-deadline 60s)
gcloud scheduler jobs update http carecircle-reminders "${JOB_ARGS[@]}" 2>/dev/null \
  || gcloud scheduler jobs create http carecircle-reminders "${JOB_ARGS[@]}"

curl -fsS "${URL}/api/health" && echo && echo "Deployed: ${URL}"
