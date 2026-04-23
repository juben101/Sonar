#!/bin/bash
# ══════════════════════════════════════════════════════
# Sonar — AWS Deployment Script
# Usage: ./deploy.sh [frontend|backend|all]
# ══════════════════════════════════════════════════════

set -e

# ── Configuration ──
S3_BUCKET="sonar-music-frontend-199702507675-ap-south-1-an"
CLOUDFRONT_DIST_ID="EDZ362DZNB32Q"
EC2_IP="13.204.145.132"
EC2_KEY="$HOME/Downloads/Sonar-Key_EC2.pem"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Ensure node/npm are in PATH (nvm or homebrew)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" 2>/dev/null
export PATH="$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node/" 2>/dev/null | sort -V | tail -1)/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

deploy_frontend() {
  echo -e "${CYAN}🔨 Building frontend...${NC}"
  cd "$PROJECT_DIR/frontend"
  npm run build

  echo -e "${CYAN}☁️  Uploading to S3...${NC}"
  aws s3 sync dist/ "s3://$S3_BUCKET/" --delete

  echo -e "${CYAN}🔄 Invalidating CloudFront cache...${NC}"
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DIST_ID" \
    --paths "/*" > /dev/null

  echo -e "${GREEN}✅ Frontend deployed!${NC}"
}

deploy_backend() {
  echo -e "${CYAN}🚀 Deploying backend to EC2...${NC}"
  ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
    -i "$EC2_KEY" ec2-user@"$EC2_IP" << 'REMOTE'
    set -e
    cd /opt/sonar
    git pull origin main
    cd backend
    source sonarvenv/bin/activate
    pip install -r requirements.txt --quiet
    python3.11 -m alembic upgrade head
    sudo systemctl restart sonar-api
    echo "Backend updated and restarted"
REMOTE

  echo -e "${GREEN}✅ Backend deployed!${NC}"
}

# ── Parse argument ──
case "${1:-all}" in
  frontend)
    deploy_frontend
    ;;
  backend)
    deploy_backend
    ;;
  all)
    deploy_backend
    deploy_frontend
    ;;
  *)
    echo "Usage: ./deploy.sh [frontend|backend|all]"
    exit 1
    ;;
esac

echo -e "${GREEN}🎉 Deployment complete!${NC}"
