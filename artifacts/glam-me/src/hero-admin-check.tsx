import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminHeroSlides from './components/admin-hero-slides';
import './index.css';
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><div className="admin-main"><AdminHeroSlides availableImages={['/images/home-hero-original.webp']} /></div></QueryClientProvider>);
