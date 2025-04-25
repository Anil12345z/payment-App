import Link from 'next/link';

export default function Home() {
  return (
    <div className="home">
      <header className="header">
        <div className="header-content">
        <h1 className="logo"><Link href="/" >CryptoPay</Link></h1> 
          <nav>
            <Link href="/login" className="button">Login</Link>
          </nav>
        </div>
      </header>
      <main className="hero">
        <h1>Welcome to CryptoPay</h1>
        <p>A secure, fast, and easy-to-use UPI payment platform.</p>
        <div className="features">
          <div className="feature-card">
            <h2>Instant UPI Payments</h2>
            <p>Pay via UPI apps like PhonePe, Paytm, or Google Pay using QR codes.</p>
          </div>
          <div className="feature-card">
            <h2>Secure Transactions</h2>
            <p>Your payments are protected with top-notch security.</p>
          </div>
          <div className="feature-card">
            <h2>Transaction History</h2>
            <p>Track all your payments in one place.</p>
          </div>
        </div>
        <Link href="/login" className="button">Get Started</Link>
      </main>
    </div>
  );
}