import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import '@gravity-ui/uikit/styles/fonts.css';
import '@gravity-ui/uikit/styles/styles.css';
import './index.css'
import { ThemeProvider, ToasterProvider, ToasterComponent } from '@gravity-ui/uikit';
import { toaster } from './utils/notifications';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme="light">
      <ToasterProvider toaster={toaster}>
        <App />
        <ToasterComponent />
      </ToasterProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
