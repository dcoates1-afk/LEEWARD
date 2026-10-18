import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('MARNAV root element is missing');

createRoot(container).render(<App />);
