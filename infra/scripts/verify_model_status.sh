#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <api_base_url>"
  echo "Example: $0 https://packetpilot-api.onrender.com"
  exit 1
fi

API_BASE_URL="${1%/}"

echo "Checking model status at ${API_BASE_URL}/model/status ..."
payload="$(curl -fsSL "${API_BASE_URL}/model/status")"
echo "${payload}"

if ! echo "${payload}" | rg -q '"backend"\s*:\s*"medgemma"'; then
  echo "FAIL: backend is not medgemma"
  exit 2
fi

if ! echo "${payload}" | rg -q '"strict_mode"\s*:\s*true'; then
  echo "FAIL: strict_mode is not true"
  exit 3
fi

if ! echo "${payload}" | rg -q '"model_id"\s*:\s*"google/medgemma-1.5-4b-it"'; then
  echo "FAIL: model_id mismatch"
  exit 4
fi

echo "PASS: production model status confirms real MedGemma strict mode."
