import Link from 'next/link';
import { useState } from 'react';
import Footer from '../components/Footer';

export default function Terms() {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  return (
    <div className="terms">
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

      <main className="terms-content">
        <h1>Terms of Service</h1>
        <p>Last updated: May 01, 2025</p>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By using CryptoPay, you agree to these Terms of Service. If you do not agree, please do not use our services.
        </p>
        <h2>2. Use of Services</h2>
        <p>
          You must use CryptoPay in compliance with all applicable laws. Unauthorized use of our services may result in account suspension.
        </p>
        <h2>3. Limitation of Liability</h2>
        <p>
          CryptoPay is not liable for any damages resulting from the use of our services, including transaction failures due to network issues.
        </p>
        <h2>4. Contact Us</h2>
        <p>
          For questions about these terms, please <Link href="/Contact">contact us</Link>.
        </p>
      </main>

      <Footer />
    </div>
  );
}