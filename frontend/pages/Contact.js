import Link from 'next/link';
import { useState } from 'react';
import Footer from '../components/Footer';

export default function Contact() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [formStatus, setFormStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); // To manage loading state
  const [errors, setErrors] = useState({ name: '', email: '', message: '' });

  // Toggle menu for responsive design
  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  // Handle input change for the contact form
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: '' })); // Reset the error message when the user starts typing
  };

  // Form validation before submission
  const validateForm = () => {
    const newErrors = { name: '', email: '', message: '' };
    let isValid = true;

    if (!formData.name) {
      newErrors.name = 'Name is required';
      isValid = false;
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
      isValid = false;
    }

    if (!formData.message) {
      newErrors.message = 'Message is required';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate form data before submitting
    if (!validateForm()) {
      setFormStatus('Please enter a valid details.');
      return;
    }

    setIsSubmitting(true);
    setFormStatus('');

    try {
      const response = await fetch('/api/contact', {  // Assuming your API is hosted on Next.js at /api/contact
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok) {
        setFormStatus('Thank you for your message! We’ll get back to you soon.');
        setFormData({ name: '', email: '', message: '' }); // Clear form fields on success
      } else {
        setFormStatus(result.error || 'Something went wrong, please try again later.');
      }
    } catch (error) {
      console.error('Error:', error);
      setFormStatus('Server error. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="contact">
      <header className="header">
        <div className="header-content">
          <h1 className="logo">
            <Link href="/">CryptoPay</Link>
          </h1>
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
            className={`input ${errors.name ? 'error' : ''}`}
          />
          {errors.name && <p className="error-message">{errors.name}</p>}

          <input
            type="email"
            name="email"
            placeholder="Your Email"
            value={formData.email}
            onChange={handleInputChange}
            className={`input ${errors.email ? 'error' : ''}`}
          />
          {errors.email && <p className="error-message">{errors.email}</p>}

          <textarea
            name="message"
            placeholder="Your Message"
            value={formData.message}
            onChange={handleInputChange}
            className={`input textarea ${errors.message ? 'error' : ''}`}
          />
          {errors.message && <p className="error-message">{errors.message}</p>}

          <button onClick={handleSubmit} className="button" disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Send Message'}
          </button>

          {formStatus && (
            <p className={formStatus.includes('Thank') ? 'success' : 'error'}>
              {formStatus}
            </p>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
