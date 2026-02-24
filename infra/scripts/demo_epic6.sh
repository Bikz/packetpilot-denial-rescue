#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${API_URL:-http://127.0.0.1:8000}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/apps/api/data/demo-artifacts}"
FHIR_PORT="${FHIR_PORT:-}"

mkdir -p "$OUTPUT_DIR"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for demo script."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for demo script."
  exit 1
fi

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    return $?
  fi
  return 1
}

if [[ -z "$FHIR_PORT" ]]; then
  for candidate in 8080 18080 28080; do
    if ! port_in_use "$candidate"; then
      FHIR_PORT="$candidate"
      break
    fi
  done
fi

if [[ -z "$FHIR_PORT" ]]; then
  echo "Could not find an available FHIR host port. Set FHIR_PORT manually and retry."
  exit 1
fi

if port_in_use "$FHIR_PORT"; then
  echo "FHIR_PORT=$FHIR_PORT is already in use. Set a different FHIR_PORT and retry."
  exit 1
fi

export FHIR_PORT
export APP_SECRET="${APP_SECRET:-packetpilot-demo-secret-please-change}"

echo "Starting PacketPilot stack..."
echo "Using FHIR host port: $FHIR_PORT"
(
  cd "$ROOT_DIR"
  docker compose up -d --build fhir fhir-seed api web
)

echo "Waiting for API and Web..."
ready=0
for _ in {1..60}; do
  if curl -fsS "$API_URL/healthz" >/dev/null 2>&1 && curl -fsS "$WEB_URL" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [[ "$ready" -ne 1 ]]; then
  echo "API/Web did not become ready in time."
  (
    cd "$ROOT_DIR"
    docker compose logs --tail=80 api web fhir || true
  )
  exit 1
fi

bootstrap_payload='{"organization_name":"Northwind Clinic","full_name":"Alex Kim","email":"admin@northwind.com","password":"super-secret-123"}'
bootstrap_response="$(curl -sS -X POST "$API_URL/auth/bootstrap" -H 'Content-Type: application/json' -d "$bootstrap_payload")"
admin_token="$(echo "$bootstrap_response" | jq -r '.access_token // empty')"

if [[ -z "$admin_token" ]]; then
  login_response="$(curl -sS -X POST "$API_URL/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@northwind.com","password":"super-secret-123"}')"
  admin_token="$(echo "$login_response" | jq -r '.access_token')"
fi

if [[ -z "$admin_token" || "$admin_token" == "null" ]]; then
  echo "Failed to acquire admin token."
  echo "$bootstrap_response"
  exit 1
fi

curl -sS -X POST "$API_URL/auth/users" \
  -H "Authorization: Bearer $admin_token" \
  -H 'Content-Type: application/json' \
  -d '{"email":"clinician@northwind.com","full_name":"Case Clinician","role":"clinician","password":"clinician-secret-123"}' \
  >/dev/null || true

clinician_token="$(curl -sS -X POST "$API_URL/auth/login" -H 'Content-Type: application/json' -d '{"email":"clinician@northwind.com","password":"clinician-secret-123"}' | jq -r '.access_token')"

if [[ -z "$clinician_token" || "$clinician_token" == "null" ]]; then
  echo "Failed to acquire clinician token."
  exit 1
fi

case_id="$(curl -sS -X POST "$API_URL/cases" \
  -H "Authorization: Bearer $admin_token" \
  -H 'Content-Type: application/json' \
  -d '{"patient_id":"pat-001","payer_label":"Aetna Gold","service_line_template_id":"imaging-mri-lumbar-spine"}' | jq -r '.id')"

if [[ -z "$case_id" || "$case_id" == "null" ]]; then
  echo "Failed to create case."
  exit 1
fi

echo "Created case $case_id"

evidence_file="$(mktemp)"
denial_file=""
cleanup() {
  rm -f "$evidence_file" "$denial_file"
}
trap cleanup EXIT
cat >"$evidence_file" <<'TXT'
Primary diagnosis: Lumbar radiculopathy
Symptom duration (weeks): 12
Neurologic deficit present: yes
Conservative therapy duration (weeks): 8
Physical therapy trial documented: yes
Date of prior imaging: 2025-10-22
Clinical rationale: Persistent neurologic deficits and failed conservative treatment justify MRI authorization.
TXT

curl -sS -X POST "$API_URL/cases/$case_id/documents/upload" \
  -H "Authorization: Bearer $admin_token" \
  -F "file=@$evidence_file;filename=evidence-note.txt;type=text/plain" >/dev/null

autofill_response="$(curl -sS -X POST "$API_URL/cases/$case_id/autofill" -H "Authorization: Bearer $admin_token")"
if [[ "$(echo "$autofill_response" | jq -r '.fills | type')" != "array" ]]; then
  echo "Autofill failed."
  echo "$autofill_response"
  exit 1
fi

attest_response="$(curl -sS -X POST "$API_URL/cases/$case_id/attest" -H "Authorization: Bearer $clinician_token")"
if [[ "$(echo "$attest_response" | jq -r '.attested_at // empty')" == "" ]]; then
  echo "Attestation failed."
  echo "$attest_response"
  exit 1
fi

denial_file="$(mktemp)"
cat >"$denial_file" <<'TXT'
Reference ID: DEN-2026-041
Deadline: 2026-03-10
Denial reason: Medical necessity was not established due to missing documentation.
Please provide:
- Updated clinical note
- Prior imaging report
- Conservative therapy documentation
TXT

denial_response="$(curl -sS -X POST "$API_URL/cases/$case_id/denial/upload" \
  -H "Authorization: Bearer $admin_token" \
  -F "file=@$denial_file;filename=denial-letter.txt;type=text/plain")"
if [[ "$(echo "$denial_response" | jq -r '.reasons | type')" != "array" ]]; then
  echo "Denial upload/parsing failed."
  echo "$denial_response"
  exit 1
fi

initial_export="$(curl -sS -X POST "$API_URL/cases/$case_id/exports/generate" \
  -H "Authorization: Bearer $clinician_token" \
  -H 'Content-Type: application/json' \
  -d '{"export_type":"initial"}')"

appeal_export="$(curl -sS -X POST "$API_URL/cases/$case_id/exports/generate" \
  -H "Authorization: Bearer $clinician_token" \
  -H 'Content-Type: application/json' \
  -d '{"export_type":"appeal"}')"

if [[ "$(echo "$initial_export" | jq -r '.packet_json | type')" != "object" ]]; then
  echo "Initial export failed."
  echo "$initial_export"
  exit 1
fi
if [[ "$(echo "$appeal_export" | jq -r '.packet_json | type')" != "object" ]]; then
  echo "Appeal export failed."
  echo "$appeal_export"
  exit 1
fi
if [[ -z "$(echo "$initial_export" | jq -r '.pdf_base64 // empty')" ]]; then
  echo "Initial export PDF payload missing."
  echo "$initial_export"
  exit 1
fi

case_dir="$OUTPUT_DIR/case-$case_id"
mkdir -p "$case_dir"

echo "$initial_export" | jq '.packet_json' >"$case_dir/packet.json"
echo "$initial_export" | jq '.metrics_json' >"$case_dir/metrics.json"
echo "$appeal_export" | jq '.packet_json' >"$case_dir/appeal.packet.json"

python3 - "$case_dir/packet.pdf" "$(echo "$initial_export" | jq -r '.pdf_base64')" <<'PY'
import base64
import sys

path = sys.argv[1]
payload = sys.argv[2]
with open(path, "wb") as handle:
    handle.write(base64.b64decode(payload))
PY

echo "Demo complete."
echo "Case: $case_id"
echo "Artifacts: $case_dir"
echo "Open: $WEB_URL/case/$case_id"
echo "FHIR sandbox: http://127.0.0.1:$FHIR_PORT/fhir"
