import Link from 'next/link';
import { useState } from 'react';
import Footer from '../components/Footer';

export default function About() {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  return (
    <div className="about">
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

      <main className="about-content">
        <h1>About CryptoPay</h1>
        <p>
          CryptoPay is a revolutionary UPI payment platform designed to make your transactions faster, safer, and more convenient. 
          Founded in 2023, our mission is to empower users with seamless digital payments, whether you're sending money to a friend or paying at a store using QR codes.
        </p>
        <h2>Our Vision</h2>
        <p>
          We envision a world where payments are as easy as a tap on your phone. By leveraging the power of UPI, we aim to bridge the gap between traditional banking and modern digital transactions, ensuring security and speed for every user.
        </p>
        <h2>Our Team</h2>
        <p>
          Our team consists of passionate developers, designers, and financial experts working together to redefine the payment experience. 
          Backed by xAI, we're committed to innovation and excellence.
        </p>
      </main>

      <Footer />
    </div>
  );
}