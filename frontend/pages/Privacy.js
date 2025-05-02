import Link from 'next/link';
import { useState } from 'react';
import Footer from '../components/Footer';

export default function Privacy() {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  return (
    <div className="privacy">
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

      <main className="privacy-content">
        <h1>Privacy Policy</h1>
        <p>Last updated: May 01, 2025</p>
        <h2>1. Introduction</h2>
        <p>
          At CryptoPay, we value your privacy and are committed to protecting your personal information. 
          This Privacy Policy explains how we collect, use, and safeguard your data.
        </p>
        <h2>2. Information We Collect</h2>
        <p>
          We collect information such as your name, email, phone number, and transaction details when you use our services. 
          This helps us process payments and improve your experience.
        </p>
        <h2>3. How We Use Your Information</h2>
        <p>
          Your data is used to facilitate transactions, provide customer support, and ensure the security of our platform. 
          We do not sell your information to third parties.
        </p>
        <h2>4. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy, please <Link href="/Contact">contact us</Link>.
        </p>
      </main>

      <Footer />
    </div>
  );
}