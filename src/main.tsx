import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { SeriesApp } from './badla/App';
import { RivalryApp } from './rivalry/App';
import './styles.css';

const params = new URLSearchParams(location.search);
const Prototype = params.get('classic') === '1' ? App : params.get('series') === '1' ? SeriesApp : RivalryApp;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Prototype />
  </StrictMode>,
);
