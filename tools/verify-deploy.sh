#!/bin/bash
set -u
KC="http://localhost:8080/realms/stats-hunter"
API="http://localhost:3000"

echo "=== 1. CORS check (Origin http://158.160.204.124:8081) ==="
curl -s -D - -o /dev/null -X POST "$KC/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Origin: http://158.160.204.124:8081" \
  -d "grant_type=password&client_id=stats-hunter-frontend&username=x&password=x&scope=openid" \
  | grep -i "access-control-allow-origin" || echo "(no CORS header)"

echo ""
echo "=== 2. token grant for test@example.com (expect 400/401 if user absent) ==="
curl -s -o /dev/null -w "http=%{http_code}\n" -X POST "$KC/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=stats-hunter-frontend&username=test@example.com&password=Test1234&scope=openid"

echo ""
echo "=== 3. register deploy-test@example.com via backend ==="
curl -s -w "\nregister_http=%{http_code}\n" -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Deploy Test","email":"deploy-test@example.com","password":"Deploy1234"}'

echo ""
echo "=== 4. login with deploy-test@example.com ==="
curl -s -o /dev/null -w "login_http=%{http_code}\n" -X POST "$KC/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=stats-hunter-frontend&username=deploy-test@example.com&password=Deploy1234&scope=openid"
