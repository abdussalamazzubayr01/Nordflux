# NORDLUXE - Cybersecurity & Deployment Guide

## � Authentication Features

NORDLUXE now includes customer account login with multiple authentication methods:

### Login Options
- **Google OAuth** - Seamless login with Google account
- **Apple Sign In** - Secure login with Apple ID
- **Email OTP** - One-time password sent to email (first login), then direct email login
- **Email/Password** - Traditional sign up/sign in with email and password

### Setup Authentication

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Copy `.env.example` to `.env` and fill in:
   - `EMAIL_USER` & `EMAIL_PASS` - Gmail credentials (use app password)
   - `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET` - From Google Cloud Console
   - `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, etc. - From Apple Developer Console
   - `MONGODB_URI` or `MONGO_URI` - MongoDB Atlas connection string

3. **Start Server**
   ```bash
   npm start
   ```

### User Flow
- Click "👤 Account" in navbar → redirects to `/login.html`
- Choose login method
- For email: Enter email → receive OTP → verify → logged in
- Subsequent logins: Direct email login (no OTP needed)

## �🔒 Protecting Your Website from Hackers

This guide provides comprehensive security measures and deployment strategies for your NORDLUXE website.

## 📁 Files Overview

- `SECURITY_DEPLOYMENT_GUIDE.md` - Complete security and deployment documentation
- `.env.example` - Template for environment variables (copy to `.env`)
- `.gitignore` - Prevents sensitive files from being committed
- `deploy.sh` - Automated deployment script (Linux/Mac)
- `security-audit.sh` - Automated security checking script (Linux/Mac)

## 🚀 Quick Start Deployment

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit with your actual values
nano .env  # or use any text editor
```

### 2. Security Audit

```bash
# Run security check (Linux/Mac)
./security-audit.sh

# Or manually check for issues
# - Ensure no .env file is committed
# - Check file permissions
# - Verify HTTPS usage
```

### 3. Deploy to Production

#### Option A: Vercel (Recommended for Static Sites)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

#### Option B: Netlify
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir=.
```

#### Option C: GitHub Pages
1. Push code to GitHub repository
2. Go to Repository Settings → Pages
3. Select main branch and root folder
4. Add custom domain

## 🛡️ Security Checklist

### Before Deployment
- [ ] Copy `.env.example` to `.env` and configure
- [ ] Run security audit: `./security-audit.sh`
- [ ] Ensure `.env` is in `.gitignore`
- [ ] Update all hardcoded URLs to production domain
- [ ] Enable HTTPS/SSL certificate
- [ ] Test all forms and functionality

### Essential Security Headers
Add these to your hosting provider or server config:

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
```

## 🌐 Domain & Hosting Setup

### Recommended Hosting Providers

1. **Vercel** (Best for static sites)
   - Free tier available
   - Automatic HTTPS
   - Global CDN
   - Excellent security

2. **Netlify**
   - Free tier with good features
   - Form handling
   - Automatic deployments from Git

3. **GitHub Pages**
   - Free hosting
   - Custom domain support
   - SSL certificates

### Domain Registration
- Use reputable registrars: Namecheap, Google Domains, Porkbun
- Enable domain privacy protection
- Set up DNSSEC
- Use strong passwords

## 🔐 Key Security Measures Implemented

### 1. Input Validation
- Email format validation
- Input sanitization to prevent XSS
- SQL injection prevention (when using databases)

### 2. Content Security Policy
- Restricts resource loading
- Prevents XSS attacks
- Controls external script execution

### 3. HTTPS Enforcement
- Automatic redirection to HTTPS
- Secure cookie settings
- HSTS headers

### 4. Environment Variables
- Sensitive data stored securely
- No hardcoded secrets in code
- Different configs for dev/prod

## 📊 Monitoring & Maintenance

### Regular Tasks
- Weekly security audits: `./security-audit.sh`
- Monthly dependency updates: `npm audit fix`
- SSL certificate renewal (Let's Encrypt auto-renews)
- Backup verification

### Monitoring Tools
- Google Analytics for user behavior
- Uptime monitoring services
- Error tracking (Sentry, LogRocket)
- Security scanning tools

## 🚨 Emergency Response

If you suspect a security breach:

1. **Isolate**: Disconnect affected systems
2. **Assess**: Determine breach scope
3. **Contain**: Prevent further damage
4. **Notify**: Inform users and authorities
5. **Recover**: Restore from clean backups
6. **Learn**: Update security measures

## 📞 Support & Resources

### Security Resources
- [OWASP Cheat Sheet](https://cheatsheetseries.owasp.org/)
- [Mozilla SSL Configuration](https://ssl-config.mozilla.org/)
- [Security Headers](https://securityheaders.com/)

### Hosting Support
- Vercel: [vercel.com/docs](https://vercel.com/docs)
- Netlify: [docs.netlify.com](https://docs.netlify.com)
- GitHub Pages: [pages.github.com](https://pages.github.com)

## 💡 Pro Tips

1. **Use a CDN** for faster loading and DDoS protection
2. **Implement rate limiting** to prevent abuse
3. **Regular backups** are your safety net
4. **Monitor logs** for suspicious activity
5. **Keep dependencies updated** to patch vulnerabilities
6. **Use strong, unique passwords** everywhere
7. **Enable 2FA** on all accounts
8. **Test regularly** in a staging environment first

## 🔄 Update Process

When updating your website:

1. Run security audit: `./security-audit.sh`
2. Test in development environment
3. Create backup of production
4. Deploy updates
5. Monitor for issues
6. Update documentation

---

**Remember**: Security is an ongoing process, not a one-time setup. Stay vigilant and keep your systems updated!

For questions or issues, refer to the detailed `SECURITY_DEPLOYMENT_GUIDE.md` file.