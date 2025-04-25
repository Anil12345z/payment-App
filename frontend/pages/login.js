import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function Login({ setToken }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePhone = (phone) => /^\d{10}$/.test(phone);

  const register = async () => {
    setError('');
    if (!name || !validateEmail(email) || !password || !validatePhone(phone)) {
      setError('Please fill all fields correctly (valid email and 10-digit phone)');
      return;
    }
    try {
      const res = await axios.post('http://localhost:4000/signup', { name, email, password, phone });
      setToken(res.data.token);
      localStorage.setItem('token', res.data.token);
      router.push('/dashboard');
    } catch (error) {
      setError(error.response?.data?.error || 'Registration failed');
    }
  };

  const login = async () => {
    setError('');
    if (!validateEmail(email) || !password) {
      setError('Please enter a valid email and password');
      return;
    }
    try {
      const res = await axios.post('http://localhost:4000/login', { email, password });
      setToken(res.data.token);
      localStorage.setItem('token', res.data.token);
      router.push('/dashboard');
    } catch (error) {
      setError(error.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div>
      <header className="header">
        <div className="header-content">
        <h1 className="logo"><Link href="/" >CryptoPay</Link></h1> 
          <nav>       
          </nav>
        </div>
      </header>
      <div className="container">
        <div className="card">
          <h1>{isRegistering ? 'Register' : 'Login'}</h1>
          {error && <p className="error">{error}</p>}
          {isRegistering && (
            <>
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
              />
              <input
                type="text"
                placeholder="Phone (10 digits)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input"
              />
            </>
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
          <button onClick={isRegistering ? register : login} className="button">
            {isRegistering ? 'Register' : 'Login'}
          </button>
          <p onClick={() => setIsRegistering(!isRegistering)} className="toggle">
            {isRegistering ? 'Already have an account? Login' : "Don't have an account? Register"}
          </p>
        </div>
      </div>
    </div>
  );
}