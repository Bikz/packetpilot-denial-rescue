#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <web_url> <api_url>"
  echo "Example: $0 https://packetpilot.vercel.app https://packetpilot-api.onrender.com"
  exit 1
fi

WEB_URL="${1%/}"
API_URL="${2%/}"

echo "==> Checking web app: ${WEB_URL}"
web_status="$(curl -s -o /dev/null -w "%{http_code}" "${WEB_URL}/onboarding/welcome")"
if [[ "${web_status}" != "200" ]]; then
  echo "FAIL: web onboarding returned HTTP ${web_status}"
  exit 2
fi
echo "PASS: web onboarding is reachable"

echo
echo "==> Checking API health: ${API_URL}/healthz"
health_payload="$(curl -fsSL "${API_URL}/healthz")"
echo "${health_payload}"
if ! echo "${health_payload}" | rg -q '"status"\s*:\s*"ok"'; then
  echo "FAIL: /healthz payload missing status=ok"
  exit 3
fi
echo "PASS: API health endpoint is healthy"

echo
echo "==> Checking model proof: ${API_URL}/model/status"
model_payload="$(curl -fsSL "${API_URL}/model/status")"
echo "${model_payload}"
if ! echo "${model_payload}" | rg -q '"backend"\s*:\s*"medgemma"'; then
  echo "FAIL: backend is not medgemma"
  exit 4
fi
if ! echo "${model_payload}" | rg -q '"strict_mode"\s*:\s*true'; then
  echo "FAIL: strict_mode is not true"
  exit 5
fi
if ! echo "${model_payload}" | rg -q '"model_id"\s*:\s*"google/medgemma-1.5-4b-it"'; then
  echo "FAIL: model_id mismatch"
  exit 6
fi
echo "PASS: model status confirms real MedGemma strict mode"

echo
echo "All production checks passed."
