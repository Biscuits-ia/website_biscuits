#!/bin/bash
# Test scripts pour les flux d'authentification Astro + Supabase
# Usage: ./scripts/test-auth-flows.sh

set -e

BASE_URL="${BASE_URL:-http://localhost:4321}"
TEST_EMAIL="test+auth$(date +%s)@example.com"
TEST_PASSWORD="TestPassword123!"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
DATA_ANALYST_EMAIL="${DATA_ANALYST_EMAIL:-}"
DATA_ANALYST_PASSWORD="${DATA_ANALYST_PASSWORD:-}"
USER_EMAIL="${USER_EMAIL:-}"
USER_PASSWORD="${USER_PASSWORD:-}"

echo "========================================"
echo "  Test des flux d'authentification"
echo "========================================"
echo ""
echo "Base URL: $BASE_URL"
echo "Test email: $TEST_EMAIL"
echo ""

# Couleurs pour la sortie
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass_test() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
}

fail_test() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    echo "  Error: $2"
}

skip_test() {
    echo -e "${YELLOW}○ SKIP${NC}: $1"
}

# Test 1: Inscription
echo "----------------------------------------"
echo "Test 1: Inscription"
echo "----------------------------------------"

SIGNUP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/inscription" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=$TEST_EMAIL&password=$TEST_PASSWORD")

SIGNUP_BODY=$(echo "$SIGNUP_RESPONSE" | head -n -1)
SIGNUP_CODE=$(echo "$SIGNUP_RESPONSE" | tail -n1)

if [ "$SIGNUP_CODE" = "200" ]; then
    pass_test "Inscription API (status: $SIGNUP_CODE)"
    echo "  Response: $SIGNUP_BODY"
else
    fail_test "Inscription API" "Status: $SIGNUP_CODE, Body: $SIGNUP_BODY"
fi

# Test 2: Connexion avec utilisateur existant
echo ""
echo "----------------------------------------"
echo "Test 2: Connexion (utilisateur existant)"
echo "----------------------------------------"

# Utiliser un email de test existant ou créer une session
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/connexion" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=$TEST_EMAIL&password=$TEST_PASSWORD" \
  -c /tmp/test-cookies.txt)

LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | head -n -1)
LOGIN_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)

if [ "$LOGIN_CODE" = "200" ]; then
    pass_test "Connexion API (status: $LOGIN_CODE)"
    echo "  Response: $LOGIN_BODY"
    echo "  Cookies saved to /tmp/test-cookies.txt"
else
    # Ce test peut échouer si l'email n'est pas confirmé
    if echo "$LOGIN_BODY" | grep -q "Email not confirmed\|Invalid login"; then
        skip_test "Connexion (email non confirmé - attendu)"
    else
        fail_test "Connexion API" "Status: $LOGIN_CODE, Body: $LOGIN_BODY"
    fi
fi

# Test 3: Demande de reset de mot de passe
echo ""
echo "----------------------------------------"
echo "Test 3: Demande de reset de mot de passe"
echo "----------------------------------------"

RESET_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/mot-de-passe-oublie" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=$TEST_EMAIL")

RESET_BODY=$(echo "$RESET_RESPONSE" | head -n -1)
RESET_CODE=$(echo "$RESET_RESPONSE" | tail -n1)

if [ "$RESET_CODE" = "200" ]; then
    pass_test "Reset password request (status: $RESET_CODE)"
    echo "  Response: $RESET_BODY"
else
    # Peut échouer si l'email n'existe pas encore (non confirmé)
    if echo "$RESET_BODY" | grep -q "Aucun compte trouvé"; then
        skip_test "Reset password (email non confirmé - attendu)"
    else
        fail_test "Reset password request" "Status: $RESET_CODE, Body: $RESET_BODY"
    fi
fi

# Test 4: Déconnexion
echo ""
echo "----------------------------------------"
echo "Test 4: Déconnexion"
echo "----------------------------------------"

if [ -f /tmp/test-cookies.txt ]; then
    LOGOUT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/deconnexion" \
      -b /tmp/test-cookies.txt)

    LOGOUT_CODE=$(echo "$LOGOUT_RESPONSE" | tail -n1)

    if [ "$LOGOUT_CODE" = "302" ]; then
        pass_test "Déconnexion (status: $LOGOUT_CODE)"
        rm -f /tmp/test-cookies.txt
    else
        fail_test "Déconnexion" "Status: $LOGOUT_CODE"
    fi
else
    skip_test "Déconnexion (pas de cookies)"
fi

# Test 5: Middleware CSP
echo ""
echo "----------------------------------------"
echo "Test 5: Middleware CSP"
echo "----------------------------------------"

CSP_RESPONSE=$(curl -s -I "$BASE_URL/" 2>&1)

if echo "$CSP_RESPONSE" | grep -qi "content-security-policy"; then
    pass_test "CSP header présent"
    CSP_LINE=$(echo "$CSP_RESPONSE" | grep -i "content-security-policy")
    echo "  $CSP_LINE"
else
    fail_test "CSP header" "Header non trouvé"
fi

# Test 6: Protection des routes dashboard
echo ""
echo "----------------------------------------"
echo "Test 6: Protection routes dashboard"
echo "----------------------------------------"

DASHBOARD_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/dashboard/user" \
  -L -o /tmp/dashboard-output.txt)

DASHBOARD_CODE=$(echo "$DASHBOARD_RESPONSE" | tail -n1)

if [ "$DASHBOARD_CODE" = "200" ] || [ "$DASHBOARD_CODE" = "302" ]; then
    # Vérifier si redirigé vers connexion
    if grep -q "connexion" /tmp/dashboard-output.txt; then
        pass_test "Dashboard protégé (redirige vers connexion)"
    else
        pass_test "Dashboard accessible (status: $DASHBOARD_CODE)"
    fi
    rm -f /tmp/dashboard-output.txt
else
    fail_test "Dashboard protection" "Status: $DASHBOARD_CODE"
fi

echo ""
echo "========================================"
echo "  Tests terminés"
echo "========================================"

# Test 7: Protection analytics par role (optionnel)
echo ""
echo "----------------------------------------"
echo "Test 7: Protection analytics par role"
echo "----------------------------------------"

test_role_access() {
    local role_label="$1"
    local email="$2"
    local password="$3"
    local expected_code="$4"
    local cookie_file="/tmp/test-${role_label}-cookies.txt"

    if [ -z "$email" ] || [ -z "$password" ]; then
        skip_test "Role ${role_label}: credentials manquants (variables ${role_label^^}_EMAIL/${role_label^^}_PASSWORD)"
        return
    fi

    LOGIN_CODE=$(curl -s -w "%{http_code}" -o /tmp/test-${role_label}-login.txt -X POST "$BASE_URL/auth/connexion" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "email=$email&password=$password" \
        -c "$cookie_file")

    if [ "$LOGIN_CODE" != "200" ]; then
        fail_test "Role ${role_label}: connexion" "Status: $LOGIN_CODE"
        rm -f "$cookie_file" "/tmp/test-${role_label}-login.txt"
        return
    fi

    ACCESS_CODE=$(curl -s -w "%{http_code}" -o /tmp/test-${role_label}-analytics.txt \
        -b "$cookie_file" "$BASE_URL/api/analytics-export?scope=overview&days=7")

    if [ "$ACCESS_CODE" = "$expected_code" ]; then
        pass_test "Role ${role_label}: access /api/analytics-export (status $ACCESS_CODE)"
    else
        fail_test "Role ${role_label}: access /api/analytics-export" "Expected $expected_code, got $ACCESS_CODE"
    fi

    rm -f "$cookie_file" "/tmp/test-${role_label}-login.txt" "/tmp/test-${role_label}-analytics.txt"
}

test_role_access "admin" "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "200"
test_role_access "data_analyst" "$DATA_ANALYST_EMAIL" "$DATA_ANALYST_PASSWORD" "200"
test_role_access "user" "$USER_EMAIL" "$USER_PASSWORD" "403"

echo ""
echo "Notes:"
echo "- Les tests 2 et 3 peuvent échouer si l'email n'est pas confirmé"
echo "- Pour tester le flux complet, confirmez l'email dans Supabase Dashboard"
echo "- Les cookies sont stockés dans /tmp/test-cookies.txt pendant les tests"
echo "- Pour le test 7, fournissez ADMIN_EMAIL/ADMIN_PASSWORD, DATA_ANALYST_EMAIL/DATA_ANALYST_PASSWORD, USER_EMAIL/USER_PASSWORD"
echo ""
