@echo off
REM NORDLUXE Windows Deployment Script
echo ========================================
echo    NORDLUXE Live Deployment Script
echo ========================================
echo.

echo Checking prerequisites...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from: https://nodejs.org/
    echo.
    echo Press any key to open the download page...
    pause >nul
    start https://nodejs.org/
    exit /b 1
) else (
    echo ✓ Node.js is installed
)

REM Check if Git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Git is not installed!
    echo Please install Git from: https://git-scm.com/
    echo.
    echo Press any key to open the download page...
    pause >nul
    start https://git-scm.com/
    exit /b 1
) else (
    echo ✓ Git is installed
)

echo.
echo All prerequisites are installed!
echo.

echo Select deployment option:
echo 1) Vercel (Recommended)
echo 2) Netlify
echo 3) GitHub Pages
echo 4) Manual instructions
echo.

set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" goto vercel
if "%choice%"=="2" goto netlify
if "%choice%"=="3" goto github
if "%choice%"=="4" goto manual

echo Invalid choice. Exiting...
pause
exit /b 1

:vercel
echo.
echo ========================================
echo        Deploying to Vercel
echo ========================================
echo.

echo Installing Vercel CLI...
call npm install -g vercel

echo.
echo Logging into Vercel...
call vercel login

echo.
echo Deploying your site...
call vercel --prod

echo.
echo ✓ Deployment complete!
echo.
echo Next steps:
echo 1. Go to your Vercel dashboard
echo 2. Add your custom domain in Settings -^> Domains
echo 3. Update DNS records at your domain registrar
echo.
pause
goto end

:netlify
echo.
echo ========================================
echo        Deploying to Netlify
echo ========================================
echo.

echo Installing Netlify CLI...
call npm install -g netlify-cli

echo.
echo Logging into Netlify...
call netlify login

echo.
echo Deploying your site...
call netlify deploy --prod --dir=.

echo.
echo ✓ Deployment complete!
echo.
echo Next steps:
echo 1. Go to your Netlify dashboard
echo 2. Add your custom domain in Domain management
echo 3. Update DNS records as instructed
echo.
pause
goto end

:github
echo.
echo ========================================
echo      Deploying to GitHub Pages
echo ========================================
echo.

echo Initializing Git repository...
git init
git add .
git commit -m "Deploy NORDLUXE website"

echo.
echo IMPORTANT: Create a GitHub repository first!
echo 1. Go to https://github.com and create a new repository
echo 2. Name it 'nordluxe-website' or your preferred name
echo 3. Make it public
echo 4. Copy the repository URL
echo.

set /p repo_url="Paste your GitHub repository URL: "
git remote add origin %repo_url%
git push -u origin main

echo.
echo ✓ Code pushed to GitHub!
echo.
echo Next steps:
echo 1. Go to your repository Settings -^> Pages
echo 2. Select 'main' branch and '/ (root)' folder
echo 3. Your site will be live at: https://YOUR_USERNAME.github.io/REPOSITORY_NAME/
echo 4. Add custom domain in Pages settings
echo.
pause
goto end

:manual
echo.
echo ========================================
echo        Manual Deployment Guide
echo ========================================
echo.
echo Opening deployment guide...
start LIVE_DEPLOYMENT_GUIDE.md
echo.
echo Follow the instructions in the opened file.
echo.
pause
goto end

:end
echo.
echo ========================================
echo         Deployment Script Complete
echo ========================================
echo.
echo Thank you for using NORDLUXE!
echo Your luxury fashion website is going live! ✨
echo.
echo For support, check the documentation files.
echo.
pause