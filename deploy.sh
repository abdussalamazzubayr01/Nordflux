#!/bin/bash

# NORDLUXE Deployment Script
# Run this script to deploy your website securely

echo "🚀 Starting NORDLUXE Deployment Process..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found! Please copy .env.example to .env and configure your settings."
    exit 1
fi

print_status "Checking environment configuration..."
source .env

# Security checks
print_status "Running security checks..."

# Check for vulnerable dependencies
if command -v npm &> /dev/null; then
    print_status "Checking for vulnerable npm packages..."
    npm audit --audit-level=moderate
    if [ $? -ne 0 ]; then
        print_warning "Vulnerabilities found. Consider running 'npm audit fix'"
    fi
fi

# Check file permissions
print_status "Checking file permissions..."
find . -type f -name "*.html" -exec chmod 644 {} \;
find . -type f -name "*.css" -exec chmod 644 {} \;
find . -type f -name "*.js" -exec chmod 644 {} \;

# Create backup
print_status "Creating backup..."
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r *.html *.css *.js "$BACKUP_DIR/" 2>/dev/null || true
print_success "Backup created in $BACKUP_DIR"

# Minify files (optional)
read -p "Do you want to minify CSS and JS files? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Minifying files..."
    # You can add minification commands here
    # npm install -g clean-css-cli uglify-js
    # find . -name "*.css" -exec cleancss -o {}.min {} \;
    # find . -name "*.js" -exec uglifyjs {} -o {}.min \;
    print_warning "Minification not implemented yet. Add your preferred minification tools."
fi

# Deployment options
echo
echo "Select deployment method:"
echo "1) Vercel (Recommended for static sites)"
echo "2) Netlify"
echo "3) GitHub Pages"
echo "4) Manual FTP/SCP"
echo "5) Docker"
read -p "Enter your choice (1-5): " deployment_choice

case $deployment_choice in
    1)
        print_status "Deploying to Vercel..."
        if ! command -v vercel &> /dev/null; then
            print_status "Installing Vercel CLI..."
            npm install -g vercel
        fi
        vercel --prod
        ;;
    2)
        print_status "Deploying to Netlify..."
        if ! command -v netlify &> /dev/null; then
            print_status "Installing Netlify CLI..."
            npm install -g netlify-cli
        fi
        netlify deploy --prod --dir=.
        ;;
    3)
        print_status "Setting up GitHub Pages..."
        echo "Make sure your repository is pushed to GitHub"
        echo "Go to repository Settings > Pages"
        echo "Select main branch and / (root) folder"
        read -p "Press enter when ready to continue..."
        ;;
    4)
        print_status "Manual deployment selected"
        read -p "Enter your server hostname/IP: " server_host
        read -p "Enter username: " server_user
        read -p "Enter remote path: " remote_path

        print_status "Uploading files via SCP..."
        scp -r *.html *.css *.js "$server_user@$server_host:$remote_path/"
        ;;
    5)
        print_status "Creating Docker deployment..."
        if [ ! -f "Dockerfile" ]; then
            print_status "Creating Dockerfile..."
            cat > Dockerfile << EOF
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
EOF
        fi

        print_status "Building Docker image..."
        docker build -t nordluxe-website .
        print_success "Docker image built. Run with: docker run -p 8080:80 nordluxe-website"
        ;;
    *)
        print_error "Invalid choice. Exiting."
        exit 1
        ;;
esac

# Post-deployment checks
print_status "Running post-deployment checks..."

# Check if website is accessible
if [ ! -z "$DOMAIN" ]; then
    print_status "Checking if $DOMAIN is accessible..."
    if curl -s --head "$DOMAIN" | head -n 1 | grep "200\|301\|302" > /dev/null; then
        print_success "Website is accessible at $DOMAIN"
    else
        print_warning "Could not verify website accessibility. Please check manually."
    fi
fi

# SSL check
if [ ! -z "$DOMAIN" ]; then
    print_status "Checking SSL certificate..."
    if curl -s --head "https://$DOMAIN" | head -n 1 | grep "200\|301\|302" > /dev/null; then
        print_success "HTTPS is working on $DOMAIN"
    else
        print_warning "HTTPS check failed. Make sure SSL certificate is properly configured."
    fi
fi

print_success "🎉 Deployment completed!"
print_status "Don't forget to:"
echo "  - Update DNS records if needed"
echo "  - Configure SSL certificate"
echo "  - Set up monitoring and backups"
echo "  - Test all functionality"
echo "  - Update social media links with live URLs"

echo
print_status "For security monitoring, consider:"
echo "  - Setting up Google Analytics"
echo "  - Configuring error tracking (Sentry)"
echo "  - Setting up uptime monitoring"
echo "  - Regular security audits"

echo
print_success "NORDLUXE is now live! 🌟"