#!/bin/bash

# NORDLUXE Security Audit Script
# Run this script regularly to check for security vulnerabilities

echo "🔒 NORDLUXE Security Audit"
echo "=========================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
ISSUES_FOUND=0
WARNINGS_FOUND=0

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((ISSUES_FOUND++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS_FOUND++))
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

echo
info "Checking file permissions..."

# Check for world-writable files
WORLD_WRITABLE=$(find . -type f -perm -o+w 2>/dev/null | wc -l)
if [ "$WORLD_WRITABLE" -gt 0 ]; then
    check_fail "Found $WORLD_WRITABLE world-writable files"
    find . -type f -perm -o+w 2>/dev/null | head -10
else
    check_pass "No world-writable files found"
fi

echo
info "Checking for sensitive files..."

# Check for exposed environment files
if [ -f ".env" ]; then
    check_fail ".env file found in repository (should be in .gitignore)"
else
    check_pass ".env file properly excluded"
fi

# Check for backup files
BACKUP_FILES=$(find . -name "*.bak" -o -name "*.backup" -o -name "*~" | wc -l)
if [ "$BACKUP_FILES" -gt 0 ]; then
    check_warn "Found $BACKUP_FILES backup files that might contain sensitive data"
fi

echo
info "Checking HTML security..."

# Check for inline event handlers (basic XSS check)
INLINE_EVENTS=$(grep -r "on\w*=\".*\"" *.html 2>/dev/null | wc -l)
if [ "$INLINE_EVENTS" -gt 0 ]; then
    check_warn "Found $INLINE_EVENTS inline event handlers (consider using addEventListener)"
fi

# Check for missing CSP
CSP_COUNT=$(grep -l "Content-Security-Policy" *.html 2>/dev/null | wc -l)
if [ "$CSP_COUNT" -eq 0 ]; then
    check_warn "No Content Security Policy found in HTML files"
else
    check_pass "Content Security Policy implemented"
fi

echo
info "Checking JavaScript security..."

# Check for eval usage
EVAL_COUNT=$(grep -r "eval(" *.js 2>/dev/null | wc -l)
if [ "$EVAL_COUNT" -gt 0 ]; then
    check_fail "Found eval() usage - high security risk"
fi

# Check for innerHTML usage (potential XSS)
INNERHTML_COUNT=$(grep -r "innerHTML" *.js 2>/dev/null | wc -l)
if [ "$INNERHTML_COUNT" -gt 0 ]; then
    check_warn "Found innerHTML usage - ensure inputs are sanitized"
fi

# Check for console.log in production
CONSOLE_COUNT=$(grep -r "console\." *.js 2>/dev/null | wc -l)
if [ "$CONSOLE_COUNT" -gt 0 ]; then
    check_warn "Found console statements - remove for production"
fi

echo
info "Checking for dependency vulnerabilities..."

# Check if npm is available
if command -v npm &> /dev/null; then
    if [ -f "package.json" ]; then
        echo "Running npm audit..."
        AUDIT_RESULT=$(npm audit --audit-level=moderate 2>&1)
        if echo "$AUDIT_RESULT" | grep -q "found.*vulnerabilities"; then
            check_fail "NPM audit found vulnerabilities"
            echo "$AUDIT_RESULT" | grep "found.*vulnerabilities"
        else
            check_pass "No critical npm vulnerabilities found"
        fi
    fi
else
    info "npm not found - skipping dependency check"
fi

echo
info "Checking network security..."

# Check for HTTP URLs in production code
HTTP_URLS=$(grep -r "http://" *.html *.js 2>/dev/null | grep -v "https://" | wc -l)
if [ "$HTTP_URLS" -gt 0 ]; then
    check_warn "Found $HTTP_URLS HTTP URLs - consider using HTTPS"
fi

echo
info "Checking for exposed secrets..."

# Check for API keys in code
API_KEYS=$(grep -r -i "api[_-]*key\|secret[_-]*key\|password\|token" *.js *.html 2>/dev/null | grep -v ".env" | wc -l)
if [ "$API_KEYS" -gt 0 ]; then
    check_fail "Found potential API keys or secrets in code files"
fi

echo
echo "=========================="
echo "Security Audit Complete"
echo "Issues found: $ISSUES_FOUND"
echo "Warnings: $WARNINGS_FOUND"

if [ "$ISSUES_FOUND" -gt 0 ]; then
    echo -e "${RED}⚠️  Critical security issues found! Please address them immediately.${NC}"
    exit 1
elif [ "$WARNINGS_FOUND" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Security warnings found. Consider addressing them.${NC}"
    exit 0
else
    echo -e "${GREEN}✅ All security checks passed!${NC}"
    exit 0
fi