import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx'; // ⚠️ Notice: no .jsx if you're using Vite

const root = document.getElementById('root');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
