import Link from 'next/link';
import { useState } from 'react';
import Footer from '../components/Footer';

export default function Help() {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  return (
    <div className="help">
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

      <main className="help-content">
        <h1>Help Center</h1>
        <p>Welcome to the CryptoPay Help Center. Find answers to common questions or reach out for support.</p>
        <h2>Common Issues</h2>
        <ul>
          <li><strong>Payment Failed:</strong> Ensure your UPI app is linked and has sufficient balance.</li>
          <li><strong>QR Code Not Working:</strong> Verify the QR code is generated correctly or contact support.</li>
          <li><strong>Transaction Not Showing:</strong> Refresh your transaction history or check your internet connection.</li>
        </ul>
        <h2>Need More Help?</h2>
        <p>Visit our <Link href="/Faq">FAQ</Link> page or <Link href="/Contact">contact us</Link> for personalized assistance.</p>
      </main>

      <Footer />
    </div>
  );
}