#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting setup...${NC}\n"

# Step 1: Copy .env.example to .env.local
if [ -f ".env.example" ]; then
    if [ -f ".env.local" ]; then
        echo -e "${YELLOW}⚠️  .env.local already exists. Skipping copy.${NC}\n"
    else
        echo -e "${YELLOW}📋 Copying .env.example to .env.local...${NC}"
        cp .env.example .env.local
        echo -e "${GREEN}✅ .env.local created${NC}\n"
    fi
else
    echo -e "${RED}❌ Error: .env.example not found${NC}"
    exit 1
fi

# Step 2: Check if DATABASE_URL is configured
echo -e "${YELLOW}🔍 Checking DATABASE_URL configuration...${NC}"
if [ -f ".env.local" ]; then
    # Source the .env.local file to check variables
    set -a
    source .env.local 2>/dev/null || true
    set +a
    
    if [ -z "${DATABASE_URL}" ] || [ "${DATABASE_URL}" = "" ]; then
        echo -e "${RED}❌ Error: DATABASE_URL is not configured in .env.local${NC}"
        echo -e "${YELLOW}   Please set DATABASE_URL in .env.local before continuing${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ DATABASE_URL is configured${NC}\n"
    fi
else
    echo -e "${RED}❌ Error: .env.local not found${NC}"
    exit 1
fi

# Step 3: Check if BETTER_AUTH_SECRET is configured, generate if missing
echo -e "${YELLOW}🔍 Checking BETTER_AUTH_SECRET configuration...${NC}"
if [ -z "${BETTER_AUTH_SECRET}" ] || [ "${BETTER_AUTH_SECRET}" = "" ]; then
    echo -e "${YELLOW}🔐 BETTER_AUTH_SECRET not found. Generating a new one...${NC}"
    BETTER_AUTH_SECRET=$(openssl rand -base64 32)
    
    # Add or update BETTER_AUTH_SECRET in .env.local
    if grep -q "^BETTER_AUTH_SECRET=" .env.local 2>/dev/null; then
        # Update existing line (works on both macOS and Linux)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET|" .env.local
        else
            sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET|" .env.local
        fi
    else
        # Append new line
        echo "BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET" >> .env.local
    fi
    
    echo -e "${GREEN}✅ BETTER_AUTH_SECRET generated and added to .env.local${NC}\n"
else
    echo -e "${GREEN}✅ BETTER_AUTH_SECRET is configured${NC}\n"
fi

# Step 4: Check Node.js version
echo -e "${YELLOW}🔍 Checking Node.js version...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed${NC}"
    echo -e "${YELLOW}   Required: Node.js version 22 or higher${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR_VERSION=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR_VERSION" -lt 22 ]; then
    echo -e "${RED}❌ Error: Node.js version $NODE_VERSION is too old${NC}"
    echo -e "${YELLOW}   Required: Node.js version 22 or higher${NC}"
    echo -e "${YELLOW}   Current: Node.js version $NODE_VERSION${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Node.js version $NODE_VERSION is compatible${NC}\n"
fi

# Step 5: Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
pnpm i
echo -e "${GREEN}✅ Dependencies installed${NC}\n"

# Step 6: Push database schema
echo -e "${YELLOW}🗄️  Pushing database schema...${NC}"
pnpm --filter database push
echo -e "${GREEN}✅ Database schema pushed${NC}\n"

# Step 7: Seed database
echo -e "${YELLOW}🌱 Seeding database...${NC}"
pnpm --filter scripts seed
echo -e "${GREEN}✅ Database seeded${NC}\n"

# Setup complete
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo -e "${YELLOW}   You can now start the development server with: ${NC}pnpm dev\n"

