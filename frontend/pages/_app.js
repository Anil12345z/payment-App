import '../styles/globals.css';

import { useState, useEffect } from 'react';

export default function MyApp({ Component, pageProps }) {
  const [token, setToken] = useState(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) setToken(storedToken);
  }, []);

  return <Component {...pageProps} token={token} setToken={setToken} />;
}