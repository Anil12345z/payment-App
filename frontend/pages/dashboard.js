import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import QRCode from 'react-qr-code';
import Webcam from 'react-webcam';
import Link from 'next/link';
import { useRouter } from 'next/router';
import jsQR from 'jsqr';

export default function Dashboard({ token, setToken }) {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [amount, setAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [userUpiId, setUserUpiId] = useState('');
  const [userName, setUserName] = useState('');
  const [scanResult, setScanResult] = useState('');
  const [error, setError] = useState('');
  const [paymentMode, setPaymentMode] = useState('testing');
  const [isScanning, setIsScanning] = useState(false);
  const [webcamPermission, setWebcamPermission] = useState('unknown');
  const [copyStatus, setCopyStatus] = useState('');
  const [isQrLoaded, setIsQrLoaded] = useState(false);
  const [hasCamera, setHasCamera] = useState(true);
  const webcamRef = useRef(null);
  const router = useRouter();

  // Load Razorpay Checkout script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  // Check webcam permission and camera availability
  useEffect(() => {
    // Check camera availability
    navigator.mediaDevices.enumerateDevices()
      .then((devices) => {
        const hasVideoInput = devices.some(device => device.kind === 'videoinput');
        setHasCamera(hasVideoInput);
      })
      .catch((err) => {
        console.error('Device enumeration error:', err);
        setHasCamera(false);
      });

    // Check webcam permission
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'camera' })
        .then((permissionStatus) => {
          setWebcamPermission(permissionStatus.state);
          permissionStatus.onchange = () => setWebcamPermission(permissionStatus.state);
        })
        .catch((err) => {
          console.error('Permission query error:', err);
          setWebcamPermission('unknown');
        });
    }
  }, []);

  // Fetch wallet, QR code, and transactions
  useEffect(() => {
    const storedToken = token || localStorage.getItem('token');
    if (!storedToken) {
      router.push('/login');
      return;
    }

    // Fetch wallet
    axios
      .get('http://localhost:4000/wallet', { headers: { Authorization: `Bearer ${storedToken}` } })
      .then((res) => {
        console.log('Wallet response:', res.data);
        setWallet(res.data);
      })
      .catch((error) => {
        setError('Wallet fetch failed: ' + (error.response?.data?.error || 'Network error'));
        if (error.response?.status === 401) {
          setToken(null);
          localStorage.removeItem('token');
          router.push('/login');
        }
      });

    // Fetch QR code
    axios
      .get('http://localhost:4000/wallet/qr', { headers: { Authorization: `Bearer ${storedToken}` } })
      .then((res) => {
        console.log('QR response:', res.data);
        if (!res.data.upiId || typeof res.data.upiId !== 'string') {
          console.error('Invalid UPI ID in QR response:', res.data.upiId);
          setError('Invalid UPI ID received from server');
          setIsQrLoaded(false);
          return;
        }
        setQrCode(res.data.qrCode || '');
        setUserUpiId(res.data.upiId);
        setUserName(res.data.name || '');
        setIsQrLoaded(true);
      })
      .catch((error) => {
        console.error('QR fetch error:', error);
        setError('QR code fetch failed: ' + (error.response?.data?.error || 'Network error'));
        setIsQrLoaded(false);
        if (error.response?.status === 401) {
          setToken(null);
          localStorage.removeItem('token');
          router.push('/login');
        }
      });

    // Fetch transaction history
    axios
      .get('http://localhost:4000/transactions', { headers: { Authorization: `Bearer ${storedToken}` } })
      .then((res) => {
        console.log('Transactions response:', res.data);
        setTransactions(res.data);
      })
      .catch((error) => {
        setError(
          'Transaction history fetch failed: ' +
            (error.response?.data?.error || 'Network error') +
            (error.response?.data?.details ? ` (${error.response.data.details})` : '')
        );
        if (error.response?.status === 401) {
          setToken(null);
          localStorage.removeItem('token');
          router.push('/login');
        }
      });
  }, [token, router, setToken]);

  // QR code scanning
  const scanQR = () => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState !== 4 || video.videoWidth === 0 || video.videoHeight === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code) handleScan(code.data);
  };

  useEffect(() => {
    if (isScanning) {
      const interval = setInterval(scanQR, 2000);
      return () => clearInterval(interval);
    }
  }, [isScanning]);

  const addTestingMoney = async () => {
    setError('');
    if (!amount || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    try {
      await axios.post(
        'http://localhost:4000/add-testing-money',
        { amount: parseFloat(amount) },
        { headers: { Authorization: `Bearer ${token || localStorage.getItem('token')}` } }
      );
      setWallet((prev) => ({
        ...prev,
        testingBalance: prev.testingBalance + parseFloat(amount),
      }));
      setTransactions((prev) => [
        {
          id: Date.now(),
          amount: parseFloat(amount),
          type: 'CREDIT',
          status: 'COMPLETED',
          description: 'Added to Testing Wallet (Test Mode)',
          createdAt: new Date(),
        },
        ...prev,
      ]);
      setAmount('');
    } catch (error) {
      setError('Failed to add testing money: ' + (error.response?.data?.error || 'Network error'));
    }
  };

  const initiateRazorpayPayment = async (type) => {
    setError('');
    if (!amount || amount <= 0 || (type === 'TRANSFER' && !upiId)) {
      setError('Please enter a valid amount' + (type === 'TRANSFER' ? ' and UPI ID' : ''));
      return;
    }
    if (type === 'TRANSFER') {
      if (!upiId.includes('@cryptopay')) {
        setError('Invalid UPI ID. Must be a CryptoPay UPI ID (e.g., user@cryptopay).');
        return;
      }
      if (!window.confirm(`Pay ₹${amount} to ${upiId} using ${paymentMode} mode?`)) {
        return;
      }
    }
    if (paymentMode === 'testing' && type === 'TRANSFER') {
      // Handle Testing Wallet transfer
      try {
        await axios.post(
          'http://localhost:4000/transfer-testing',
          {
            amount: parseFloat(amount),
            recipientUpiId: upiId,
          },
          { headers: { Authorization: `Bearer ${token || localStorage.getItem('token')}` } }
        );
        setWallet((prev) => ({
          ...prev,
          testingBalance: prev.testingBalance - parseFloat(amount),
        }));
        setTransactions((prev) => [
          {
            id: Date.now(),
            amount: parseFloat(amount),
            type: 'DEBIT',
            status: 'COMPLETED',
            description: `Transfer to ${upiId} (testing)`,
            createdAt: new Date(),
          },
          ...prev,
        ]);
        setAmount('');
        setUpiId('');
        setScanResult('');
      } catch (error) {
        setError('Transfer failed: ' + (error.response?.data?.error || 'Network error'));
      }
      return;
    }
    try {
      const res = await axios.post(
        'http://localhost:4000/create-order',
        { amount: parseFloat(amount), type, mode: paymentMode },
        { headers: { Authorization: `Bearer ${token || localStorage.getItem('token')}` } }
      );
      const options = {
        key: res.data.key,
        amount: res.data.amount,
        currency: res.data.currency,
        order_id: res.data.orderId,
        handler: async (response) => {
          try {
            const verifyRes = await axios.post(
              'http://localhost:4000/verify-payment',
              {
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                amount: parseFloat(amount),
                type,
                recipientUpiId: type === 'TRANSFER' ? upiId : undefined,
                mode: paymentMode,
              },
              { headers: { Authorization: `Bearer ${token || localStorage.getItem('token')}` } }
            );
            const balanceField = paymentMode === 'test' ? 'testBalance' : 'realBalance';
            if (type === 'ADD_MONEY') {
              setWallet((prev) => ({
                ...prev,
                [balanceField]: prev[balanceField] + parseFloat(amount),
              }));
            } else {
              setWallet((prev) => ({
                ...prev,
                [balanceField]: prev[balanceField] - parseFloat(amount),
              }));
            }
            setTransactions((prev) => [
              {
                id: Date.now(),
                amount: parseFloat(amount),
                type: type === 'ADD_MONEY' ? 'CREDIT' : 'DEBIT',
                status: 'COMPLETED',
                description: type === 'ADD_MONEY' ? `Added from bank via Razorpay (${paymentMode})` : `Transfer to ${upiId} via Razorpay (${paymentMode})`,
                createdAt: new Date(),
                razorpayPaymentId: response.razorpay_payment_id,
              },
              ...prev,
            ]);
            setAmount('');
            setUpiId('');
            setScanResult('');
          } catch (error) {
            setError('Payment verification failed: ' + (error.response?.data?.error || 'Network error'));
          }
        },
        prefill: {
          email: wallet?.user.email,
          contact: wallet?.user.phone,
        },
        theme: {
          color: '#007bff',
        },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      setError(
        'Payment initiation failed: ' +
          (error.response?.data?.error || 'Network error') +
          (error.response?.data?.details ? ` (${error.response.data.details})` : '')
      );
    }
  };

  const handleScan = (result) => {
    if (!result) return;
    setScanResult(result);
    if (result.startsWith('upi://pay')) {
      try {
        const urlParams = new URLSearchParams(result.split('?')[1]);
        const scannedUpiId = urlParams.get('pa');
        const scannedName = urlParams.get('pn');
        if (scannedUpiId && scannedUpiId.includes('@cryptopay')) {
          setUpiId(scannedUpiId);
          setScanResult(`Scanned: ${scannedUpiId}${scannedName ? ` (${decodeURIComponent(scannedName)})` : ''}`);
        } else {
          setError('Invalid QR code. Please scan a valid CryptoPay QR code.');
        }
      } catch (err) {
        setError('Failed to parse QR code. Please try again.');
      }
    } else {
      setError('Invalid QR code format. Please scan a CryptoPay QR code.');
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('token');
    router.push('/login');
  };

  const toggleScanning = () => {
    if (!isScanning) {
      if (!hasCamera) {
        alert('Camera is not available on this device. Please use a device with a camera, such as a phone, to scan the QR code, or enter the UPI ID manually.');
        return;
      }
      if (webcamPermission === 'denied') {
        setError(
          'Webcam access is denied. Please enable camera permissions in your browser settings and refresh the page.'
        );
        return;
      }
    }
    setIsScanning((prev) => !prev);
    setError('');
  };

  const copyUpiId = async () => {
    console.log('Attempting to copy UPI ID:', userUpiId, 'Type:', typeof userUpiId);
    if (!userUpiId || typeof userUpiId !== 'string' || !userUpiId.includes('@cryptopay')) {
      console.warn('Invalid UPI ID for copying:', userUpiId);
      setCopyStatus('Failed to copy: UPI ID not available');
      setTimeout(() => setCopyStatus(''), 2000);
      return;
    }
    try {
      await navigator.clipboard.write(userUpiId);
      setCopyStatus('UPI ID copied!');
      setTimeout(() => setCopyStatus(''), 2000);
    } catch (err) {
      console.error('Failed to copy UPI ID:', err);
      setCopyStatus('Failed to copy UPI ID');
      setTimeout(() => setCopyStatus(''), 2000);
    }
  };

  return (
    <div>
      <header className="header">
        <div className="header-content">
        <h1 className="logo"><Link href="/" >CryptoPay</Link></h1> 
          <nav>
            <button onClick={handleLogout} className="button">Logout</button>
          </nav>
        </div>
      </header>
      <div className="dashboard">
        <h1>Dashboard</h1>
        {error && <p className="error">{error}</p>}
        {copyStatus && <p className={copyStatus.includes('Failed') ? 'error' : 'success'}>{copyStatus}</p>}
        {wallet ? (
          <div className="grid">
            <div className="section">
              <h2>Testing Wallet</h2>
              <p>Balance: ₹{wallet.testingBalance.toFixed(2)}</p>
              <h2>Razorpay Test Wallet</h2>
              <p>Balance: ₹{wallet.testBalance.toFixed(2)}</p>
              <h2>Razorpay Real Wallet</h2>
              <p>Balance: ₹{wallet.realBalance.toFixed(2)}</p>
              <label htmlFor="paymentMode">Payment Mode:</label>
              <select
                id="paymentMode"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="input"
              >
                <option value="testing">Testing Wallet</option>
                <option value="test">Razorpay Test Wallet</option>
                <option value="live">Razorpay Real Wallet</option>
              </select>
              <input
                type="number"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input"
              />
              {paymentMode === 'testing' ? (
                <button onClick={addTestingMoney} className="button">
                  Add Testing Money
                </button>
              ) : (
                <button onClick={initiateRazorpayPayment.bind(null, 'ADD_MONEY')} className="button">
                  Add Money ({paymentMode})
                </button>
              )}
              <input
                type="text"
                placeholder="Recipient UPI ID (e.g., user@cryptopay)"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="input"
              />
              <button onClick={initiateRazorpayPayment.bind(null, 'TRANSFER')} className="button button-green">
                Transfer ({paymentMode})
              </button>
            </div>
            <div className="section qr-section">
              <h2>Receive Payments</h2>
              {qrCode && isQrLoaded ? (
                <>
                  <QRCode value={qrCode} size={200} style={{ margin: '10px 0' }} />
                  <p><strong>UPI ID:</strong> {userUpiId || 'Loading...'}</p>
                  <p><strong>Name:</strong> {userName || 'Loading...'}</p>
                  <button onClick={copyUpiId} className="button button-small" disabled={!isQrLoaded}>
                    {copyStatus.includes('copied') ? 'Copied!' : 'Copy UPI ID'}
                  </button>
                  <p className="info-text">Share this QR code or UPI ID with other CryptoPay users to receive payments.</p>
                </>
              ) : (
                <p>Loading QR code...</p>
              )}
              <h2>Send Payments</h2>
              <p className="info-text">Scan another user’s QR code or enter their UPI ID manually to send money.</p>
              <button onClick={toggleScanning} className="button">
                {isScanning ? 'Stop Scanning' : 'Start Scanning'}
              </button>
              {isScanning && webcamPermission !== 'denied' && hasCamera ? (
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ width: 640, height: 480 }}
                  onUserMedia={() => console.log('Webcam started')}
                  onUserMediaError={() =>
                    setError(
                      'Webcam access denied or unavailable. Please allow camera access, ensure a webcam is connected, or enter the UPI ID manually.'
                    )
                  }
                  style={{ width: '100%', maxWidth: '640px', margin: '10px 0' }}
                />
              ) : (
                webcamPermission === 'denied' && (
                  <p className="error">
                    Webcam access is denied. Please enable camera permissions in your browser settings and refresh the
                    page, or enter the UPI ID manually.
                  </p>
                )
              )}
              {scanResult && <p className="scan-result">{scanResult}</p>}
            </div>
            <div className="section">
              <h2>Transaction History</h2>
              <table className="transaction-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Payment ID</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{new Date(tx.createdAt).toLocaleDateString()}</td>
                      <td>₹{tx.amount.toFixed(2)}</td>
                      <td>{tx.type}</td>
                      <td>{tx.description}</td>
                      <td>{tx.razorpayPaymentId || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p>Loading wallet...</p>
        )}
      </div>
      {/* <style jsx>{`
        .dashboard {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background-color: #007bff;
          color: white;
          padding: 10px 20px;
        }
        .header-content {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .logo {
          margin: 0;
          font-size: 1.5em;
        }
        .header-link {
          color: white;
          text-decoration: none;
          margin-right: 20px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
        }
        .section {
          background: #f9f9f9;
          padding: 20px;
          border-radius: 8px;
        }
        .qr-section {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .input,
        .button {
          display: block;
          width: 100%;
          padding: 10px;
          margin: 10px 0;
          border-radius: 4px;
        }
        .input {
          border: 1px solid #ccc;
        }
        .button {
          background: #007bff;
          color: white;
          border: none;
          cursor: pointer;
        }
        .button-green {
          background: #28a745;
        }
        .button-small {
          width: auto;
          padding: 5px 10px;
        }
        .button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .error {
          color: red;
        }
        .success {
          color: green;
        }
        .info-text {
          font-size: 0.9em;
          color: #666;
        }
        .scan-result {
          color: #007bff;
          font-weight: bold;
        }
        .transaction-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        .transaction-table th,
        .transaction-table td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        .transaction-table th {
          background: #007bff;
          color: white;
        }
      `}</style> */}
    </div>
  );
}