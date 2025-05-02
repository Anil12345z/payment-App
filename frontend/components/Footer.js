import Link from 'next/link';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h3>Quick Links</h3>
          <Link href="/About">About Us</Link>
          <Link href="/Services">Services</Link>
          <Link href="/Contact">Contact</Link>
          <Link href="/Privacy">Privacy Policy</Link>
        </div>
        <div className="footer-section">
          <h3>Connect With Us</h3>
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">Twitter</a>
          <a href="https://facebook.com" target="_blank" rel="noopener noreferrer">Facebook</a>
          <a href="https://instagram.com" target="_blank" rel="noopener noreferrer">Instagram</a>
          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        </div>
        <div className="footer-section">
          <h3>Support</h3>
          <a href="/Help">Help Center</a>
          <a href="/Faq">FAQ</a>
          <a href="/Terms">Terms of Service</a>
        </div>
      </div>
      <div className="footer-bottom">
        <p>&copy; {new Date().getFullYear()} CryptoPay. All rights reserved. <span role="img" aria-label="heart"></span></p>
      </div>
    </footer>
  );
};

export default Footer;