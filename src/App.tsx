import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WalletProvider } from './context/WalletContext.js';
import { AppShell } from './components/AppShell.js';
import { Landing } from './screens/Landing.js';
import { Dashboard } from './screens/Dashboard.js';
import { SendBatch } from './screens/SendBatch.js';
import { Claim } from './screens/Claim.js';
import { Reclaim } from './screens/Reclaim.js';
import { PaymentRequest } from './screens/PaymentRequest.js';
import { Auditor } from './screens/Auditor.js';

export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="send"      element={<SendBatch />} />
            <Route path="claim"     element={<Claim />} />
            <Route path="reclaim"   element={<Reclaim />} />
            <Route path="request"   element={<PaymentRequest />} />
            <Route path="audit"     element={<Auditor />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
}
