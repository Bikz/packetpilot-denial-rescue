#!/bin/sh
set -eu

FHIR_BASE_URL="${FHIR_BASE_URL:-http://fhir:8080/fhir}"
SEED_FILE="${SEED_FILE:-/seed/seed-bundle.json}"

until curl -fsS "${FHIR_BASE_URL}/metadata" >/dev/null; do
  echo "Waiting for FHIR server at ${FHIR_BASE_URL}..."
  sleep 2
done

echo "Seeding FHIR bundle from ${SEED_FILE}"
curl -fsS -X POST \
  -H "Content-Type: application/fhir+json" \
  -H "Accept: application/fhir+json" \
  --data-binary "@${SEED_FILE}" \
  "${FHIR_BASE_URL}"

echo "FHIR seed complete"
