import Link from 'next/link';
import { useState } from 'react';
import Footer from '../components/Footer';

export default function Services() {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  return (
    <div className="services">
      <header className="header">
        <div className="header-content">
          <h1 className="logo"><Link href="/">CryptoPay</Link></h1>
          <button className={`menu-toggle ${menuOpen ? 'active' : ''}`} onClick={toggleMenu}>
            <span></span>
            <span></span>
            <span></span>
          </button>
          <nav className={menuOpen ? 'active' : ''}>
            <Link href="/login" className="button">Login</Link>
          </nav>
        </div>
      </header>

      <main className="services-content">
        <h1>Our Services</h1>
        <div className="features">
          <div className="feature-card">
            <h2>UPI Payments</h2>
            <p>Make instant payments using UPI with QR codes or direct transfers.</p>
          </div>
          <div className="feature-card">
            <h2>QR Code Payments</h2>
            <p>Scan QR codes to pay securely at merchants or share your QR code to receive payments.</p>
          </div>
          <div className="feature-card">
            <h2>Transaction Tracking</h2>
            <p>Keep track of all your transactions with our detailed history feature.</p>
          </div>
          <div className="feature-card">
            <h2>Testing Wallet</h2>
            <p>Test payments in a safe environment with our testing wallet before going live.</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}