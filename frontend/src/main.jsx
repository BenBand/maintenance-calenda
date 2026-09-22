import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './services/auth';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './components/ThemeProvider';
import { registerServiceWorker } from './pwa';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>
  </>
);

registerServiceWorker();
