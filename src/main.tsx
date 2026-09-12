import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.tsx';
import { AuthGate } from './auth/AuthGate.tsx';
import './index.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AuthGate>
        {(onDirtyChange) => <App onDirtyChange={onDirtyChange} />}
      </AuthGate>
    </React.StrictMode>
  );
}
