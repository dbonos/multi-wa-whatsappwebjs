#!/bin/bash
# Script to reorganize project structure

set -e

echo "🗂️  Reorganizing project structure..."
echo ""

# Create directories
mkdir -p docs/setup
mkdir -p docs/features
mkdir -p docs/deployment
mkdir -p docs/api
mkdir -p scripts

echo "✅ Created directories"
echo ""

# Move setup documentation
echo "📋 Moving setup documentation..."
mv SETUP-GUIDE.md docs/setup/ 2>/dev/null || true
mv SETUP-LOCALHOST.md docs/setup/ 2>/dev/null || true
mv SETUP-SERVER.md docs/setup/ 2>/dev/null || true
mv SETUP-DATABASE-SERVER.md docs/setup/ 2>/dev/null || true
mv MYSQL-SETUP.md docs/setup/ 2>/dev/null || true
mv MYSQL-PORT-CHECK.md docs/setup/ 2>/dev/null || true
mv MYSQL-PORT-UPDATE-INSTRUCTIONS.md docs/setup/ 2>/dev/null || true
mv START-HERE.md docs/setup/ 2>/dev/null || true
mv QUICK-START.md docs/setup/ 2>/dev/null || true
mv README-SETUP.md docs/setup/ 2>/dev/null || true
mv WHICH-SETUP.md docs/setup/ 2>/dev/null || true

# Move feature documentation
echo "✨ Moving feature documentation..."
mv FEATURES.md docs/features/ 2>/dev/null || true
mv CAPABILITIES.md docs/features/ 2>/dev/null || true
mv CONNECT-NEW-NUMBER.md docs/features/ 2>/dev/null || true
mv LID-HANDLING.md docs/features/ 2>/dev/null || true
mv PUPPETEER.md docs/features/ 2>/dev/null || true
mv REACTIONS-REPLIES-DELETED.md docs/features/ 2>/dev/null || true
mv FRAMER-MOTION.md docs/features/ 2>/dev/null || true
mv FRONTEND-SUMMARY.md docs/features/ 2>/dev/null || true
mv FRONTEND-UPDATE-SUMMARY.md docs/features/ 2>/dev/null || true
mv FRONTEND-TEST-RESULTS.md docs/features/ 2>/dev/null || true

# Move deployment documentation
echo "🚀 Moving deployment documentation..."
mv DEPLOYMENT.md docs/deployment/ 2>/dev/null || true
mv DEPLOYMENT-COMPLETE.md docs/deployment/ 2>/dev/null || true
mv DEPLOYMENT-STATUS.md docs/deployment/ 2>/dev/null || true
mv SERVER-CONFIG.md docs/deployment/ 2>/dev/null || true
mv WORKFLOW.md docs/deployment/ 2>/dev/null || true

# Move API documentation
echo "📡 Moving API documentation..."
mv API-DOCUMENTATION.md docs/api/ 2>/dev/null || true

# Move scripts
echo "🔧 Moving scripts..."
mv setup.sh scripts/ 2>/dev/null || true
mv setup-admin.js scripts/ 2>/dev/null || true
mv deploy.sh scripts/ 2>/dev/null || true
mv start-tunnel.sh scripts/ 2>/dev/null || true
mv update-mysql-port.sh scripts/ 2>/dev/null || true
mv test-lid.sh scripts/ 2>/dev/null || true
mv test-connect-new-number.sh scripts/ 2>/dev/null || true

# Move other documentation
echo "📚 Moving other documentation..."
mv IMPLEMENTATION-PLAN.md docs/ 2>/dev/null || true
mv TEST-RESULTS.md docs/ 2>/dev/null || true
mv TESTING-GUIDE.md docs/ 2>/dev/null || true
mv CHANGES-SUMMARY.md docs/ 2>/dev/null || true
mv NEXT-STEPS.md docs/ 2>/dev/null || true
mv SUMMARY.md docs/ 2>/dev/null || true
mv FINAL-STATUS.md docs/ 2>/dev/null || true

echo ""
echo "✅ Reorganization complete!"
echo ""
echo "New structure:"
echo "  docs/"
echo "    setup/       - Setup guides"
echo "    features/    - Feature documentation"
echo "    deployment/  - Deployment guides"
echo "    api/         - API documentation"
echo "  scripts/       - Utility scripts"
echo ""

