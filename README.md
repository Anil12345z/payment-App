CryptoPay
CryptoPay is a UPI-based payment application with support for three wallet types: Testing Wallet, Razorpay Test Wallet, and Razorpay Real Wallet. Users can add money, transfer funds via QR codes or UPI IDs, and view transaction history. The application is built with a Node.js backend (Express, Prisma, MySQL) and a Next.js frontend (React).

#Features

Three Wallet Types:
Testing Wallet: Add and transfer money without Razorpay for testing.
Razorpay Test Wallet: Uses Razorpay test mode for payments.
Razorpay Real Wallet: Uses Razorpay live mode for real transactions.


QR Code Payments: Generate and scan QR codes for transfers.
Camera Detection: Alerts if no camera is available, suggesting manual UPI entry.
Secure Authentication: JWT-based user authentication.
Transaction History: View all credits and debits.

#Prerequisites

Node.js: v20.19.0 (use nvm install 20.19.0 and nvm use 20.19.0 if needed).
MySQL: Running on localhost:3306 with a database named auth_demo.
Razorpay Account: Test and live API keys for payment integration.
Git: For version control.

Project Structure
crypto-app/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   └── index.js
│   └── package.json
├── frontend/
│   ├── pages/
│   │   └── Dashboard.js
│   └── package.json
├── .gitignore
└── README.md

Setup Instructions
1. Clone the Repository
git clone <repository-url>
cd crypto-app

2. Set Up MySQL

Ensure MySQL is running:mysql -u root -p


Create a database:CREATE DATABASE auth_demo;


Create a MySQL user (e.g., test11 with password ax12347):CREATE USER 'test11'@'localhost' IDENTIFIED BY 'ax12347';
GRANT ALL PRIVILEGES ON auth_demo.* TO 'test11'@'localhost';
FLUSH PRIVILEGES;
EXIT;



3. Configure Environment Variables

Create a .env file in backend/:cd backend
touch .env


Add the following to backend/.env:DATABASE_URL="mysql://Username:Password@Host:Port/Database"
JWT_SECRET=your_secure_jwt_secret
RAZORPAY_TEST_KEY_ID=rzp_test_xxxxxxxxxxxxxx
RAZORPAY_TEST_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
RAZORPAY_LIVE_KEY_ID=rzp_live_xxxxxxxxxxxxxx
RAZORPAY_LIVE_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx


Replace your_secure_jwt_secret with a strong secret (e.g., generate using openssl rand -hex 32).
Obtain Razorpay test and live keys from Razorpay Dashboard.



4. Install Backend Dependencies
cd backend
npm install

5. Apply Prisma Migrations

Ensure the prisma/schema.prisma includes testingBalance, testBalance, and realBalance in the Wallet model.
Run migrations:npx prisma migrate dev --name add_wallet_balances



6. Install Frontend Dependencies
cd ../frontend
npm install

7. Run the Backend
cd ../backend
node src/index.js


The backend runs on http://localhost:4000.

8. Run the Frontend
cd ../frontend
npm run dev


The frontend runs on http://localhost:3000.

Testing the Application
1. Create Users

Open http://localhost:3000 and register two users:
User 1: Email: user1@example.com, Name: John Doe, Password: password123, Phone: 1234567890.
User 2: Email: chahar568@example.com, Name: Jane Doe, Password: password123, Phone: 0987654321, UPI ID: chahar568-c043a594@cryptopay (auto-generated).


Log in as User 1 and User 2 (use incognito for User 2).

2. Test Testing Wallet Transfer

Add Money to User 1’s Testing Wallet:
Log in as User 1.
Select “Testing Wallet” in the dropdown.
Enter ₹500 and click “Add Testing Money”.
Verify: Testing Wallet balance is ₹500, transaction logged (“Added to Testing Wallet (Test Mode)”).


Transfer to User 2:
Enter chahar568-c043a594@cryptopay (or scan User 2’s QR code).
Enter ₹100 and click “Transfer (testing)”.
Confirm the transfer in the dialog.
Verify:
User 1: Testing Wallet ₹400.
User 2: Testing Wallet ₹100.
Transactions: User 1 (“Transfer to chahar568-c043a594@cryptopay (testing)”), User 2 (“Received from user X (testing)”).
No “Invalid payment signature” error.





3. Test Razorpay Test Wallet

Log in as User 1.
Select “Razorpay Test Wallet”, add ₹300 using Razorpay (UPI: success@razorpay).
Verify: Razorpay Test Wallet ₹300.
Transfer ₹50 to chahar568-c043a594@cryptopay.
Verify: User 1 Test Wallet ₹250, User 2 Test Wallet ₹50.

4. Test Camera Detection

On a device without a camera (emulate in browser dev tools):
Click “Start Scanning”.
Expect alert: “Camera is not available on this device...”.


Manually enter chahar568-c043a594@cryptopay and transfer ₹50 (Testing Wallet).
Verify transfer success.

5. Test Edge Cases

Insufficient Balance: Attempt to transfer ₹1000 from User 1’s Testing Wallet (balance ₹400). Expect error: “Insufficient balance”.
Invalid UPI ID: Enter invalid@cryptopay. Expect error: “Recipient not found”.
Negative Amount: Enter -100. Expect error: “Invalid amount”.

Troubleshooting
1. “Invalid payment signature” Error

Ensure Dashboard.js uses /transfer-testing for Testing Wallet transfers (check initiateRazorpayPayment).
Verify src/index.js has the /transfer-testing endpoint.
Test the endpoint:curl -X POST http://localhost:4000/transfer-testing \
-H "Authorization: Bearer <your_jwt_token>" \
-H "Content-Type: application/json" \
-d '{"amount": 100, "recipientUpiId": "chahar568-c043a594@cryptopay"}'



2. Database Issues

Verify schema:mysql -u test11 -pax12347 -h localhost -e "USE auth_demo; DESCRIBE Wallet;"

Expect testingBalance, testBalance, realBalance.
Reapply migration if needed:cd backend
npx prisma migrate dev --name add_wallet_balances



3. Recipient Not Found

Confirm chahar568-c043a594@cryptopay exists:mysql -u test11 -pax12347 -h localhost -e "USE auth_demo; SELECT upiId FROM User WHERE upiId='chahar568-c043a594@cryptopay';"



4. Frontend Errors

Check browser console for Wallet response, QR response.
Test /wallet endpoint:curl -H "Authorization: Bearer <your_jwt_token>" http://localhost:4000/wallet

