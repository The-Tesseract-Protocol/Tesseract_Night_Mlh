import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Dashboard } from './screens/Dashboard';
import { SendBatch } from './screens/SendBatch';
import { Claim } from './screens/Claim';
import { PaymentRequest } from './screens/PaymentRequest';
import { Auditor } from './screens/Auditor';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
        {/* Simple mock header for all pages */}
        <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">Tesseract</h1>
          <nav className="space-x-4 text-sm font-medium text-gray-600">
            <a href="/" className="hover:text-black">Dashboard</a>
            <a href="/send" className="hover:text-black">Send Batch</a>
            <a href="/request" className="hover:text-black">Request</a>
            <a href="/audit" className="hover:text-black">Audit</a>
          </nav>
        </header>

        <main className="max-w-5xl mx-auto py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/send" element={<SendBatch />} />
            <Route path="/claim" element={<Claim />} />
            <Route path="/request" element={<PaymentRequest />} />
            <Route path="/audit" element={<Auditor />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
