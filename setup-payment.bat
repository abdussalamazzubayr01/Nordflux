@echo off
echo ========================================
echo   NORDLUXE Payment Integration Setup
echo ========================================
echo.

echo Installing Node.js dependencies...
npm install

echo.
echo Setup complete! Next steps:
echo.
echo 1. Configure your .env file with Flutterwave credentials
echo 2. Set up Gmail app password for email notifications
echo 3. Start the backend server: npm run dev
echo 4. Start the frontend server: python -m http.server 8000
echo.
echo For detailed instructions, see PAYMENT_INTEGRATION_README.md
echo.
pause