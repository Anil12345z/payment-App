import Link from 'next/link';
import { useState } from 'react';
import Footer from '../components/Footer';

export default function Contact() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [formStatus, setFormStatus] = useState('');

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.email || !formData.message) {
      setFormStatus('Please fill out all fields.');
      return;
    }
    setFormStatus('Thank you for your message! We’ll get back to you soon.');
    setFormData({ name: '', email: '', message: '' });
  };

  return (
    <div className="contact">
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

      <main className="contact-content">
        <h1>Contact Us</h1>
        <p>Have questions or need support? Reach out to us, and we’ll respond as soon as possible.</p>
        <div className="contact-form">
          <input
            type="text"
            name="name"
            placeholder="Your Name"
            value={formData.name}
            onChange={handleInputChange}
            className="input"
          />
          <input
            type="email"
            name="email"
            placeholder="Your Email"
            value={formData.email}
            onChange={handleInputChange}
            className="input"
          />
          <textarea
            name="message"
            placeholder="Your Message"
            value={formData.message}
            onChange={handleInputChange}
            className="input textarea"
          />
          <button onClick={handleSubmit} className="button">Send Message</button>
          {formStatus && <p className={formStatus.includes('Thank') ? 'success' : 'error'}>{formStatus}</p>}
        </div>
      </main>

      <Footer />
    </div>
  );
}