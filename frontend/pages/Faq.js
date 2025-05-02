import Link from 'next/link';
import { useState } from 'react';
import Footer from '../components/Footer';

export default function Faq() {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  return (
    <div className="faq">
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

      <main className="faq-content">
        <h1>Frequently Asked Questions</h1>
        <h2>1. What is CryptoPay?</h2>
        <p>CryptoPay is a UPI payment platform that allows you to send and receive money instantly using QR codes or direct transfers.</p>
        <h2>2. Is my data secure?</h2>
        <p>Yes, we use top-notch security measures to protect your data. Read our <Link href="/privacy">Privacy Policy</Link> for more details.</p>
        <h2>3. How do I add money to my wallet?</h2>
        <p>Log in to your dashboard, select your wallet, and add money using Razorpay or a testing wallet for practice.</p>
        <h2>4. What if I encounter an issue?</h2>
        <p>Visit our <Link href="/Help">Help Center</Link> or <Link href="/Contact">contact us</Link> for support.</p>
      </main>

      <Footer />
    </div>
  );
}