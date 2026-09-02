import { useState, type FormEvent } from 'react';
import { Headphones, Search } from 'lucide-react';
import './_group.css';

const logoImage = '/__mockup/images/glam-too-logo.svg';
const faqItems = [
  { category: 'Orders', question: 'Where is my order?', answer: 'Once your order has been dispatched, you will receive a confirmation email with a tracking link. You can use this link to follow your parcel’s journey in real time.' },
  { category: 'Orders', question: 'Can I change or cancel my order?', answer: 'We start preparing orders quickly, but email hello@glamtoo.co.uk as soon as possible and our team will do their best to help before dispatch.' },
  { category: 'Orders', question: 'Can I update my delivery address?', answer: 'If your order has not been dispatched, contact us straight away with your order number and the corrected address. We cannot guarantee changes after dispatch.' },
  { category: 'Delivery', question: 'How long does delivery take?', answer: 'Standard delivery takes 2–4 working days and express delivery takes 1–2 working days. You will receive tracking as soon as your parcel leaves us.' },
  { category: 'Delivery', question: 'Do you deliver internationally?', answer: 'We currently deliver within the UK. Delivery options and costs are shown at checkout before you place your order.' },
  { category: 'Delivery', question: 'How much does delivery cost?', answer: 'Standard delivery is £3.95, or free on orders of £75 or more. Express delivery is £6.95.' },
  { category: 'Returns', question: 'How do I return an item?', answer: 'Send unworn, unwashed items back within 28 days of delivery with tags attached. Email hello@glamtoo.co.uk with your order number to start your return.' },
  { category: 'Returns', question: 'When will I receive my refund?', answer: 'We will process your refund once your return has been checked. Please allow up to 5 working days for the refund to appear in your original payment account.' },
  { category: 'Products', question: 'How do I choose the right size?', answer: 'Every product page includes fit notes and garment measurements to help you choose. If you are between sizes, we recommend sizing up in fitted styles.' },
  { category: 'Products', question: 'How should I care for my Glam Too pieces?', answer: 'Follow the care label on each garment. We recommend a cool wash where possible and keeping occasionwear away from perfume, makeup and deodorant.' },
  { category: 'Payments', question: 'Which payment methods do you accept?', answer: 'You can pay securely by card through Stripe. Your available card options are shown at checkout.' },
  { category: 'Payments', question: 'Is checkout secure?', answer: 'Yes. Card details are handled securely by Stripe and never stored by Glam Too. We only receive the payment confirmation needed to complete your order.' },
];

function stopNavigation(event: React.MouseEvent<HTMLAnchorElement>) { event.preventDefault(); }

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const submitSearch = (event: FormEvent) => { event.preventDefault(); setSearchOpen(false); };
  return <header className="site-header">
    <div className="header-inner">
      <button className="menu-toggle" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><span className="menu-toggle-icon" aria-hidden="true"><span /><span /><span /></span></button>
      <button className="tool-label search-link" type="button" aria-expanded={searchOpen} onClick={() => setSearchOpen((open) => !open)}><span className="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.2" /><path d="m16 16 4.3 4.3" /></svg></span><span>Search</span></button>
      <a href="#home" onClick={stopNavigation}><img className="logo" src={logoImage} alt="Glam Too" /></a>
      <div className="header-tools">
        <a href="#account" className="tool-label" aria-label="Account" onClick={stopNavigation}><span className="tool-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2" /><path d="M5.8 20c.6-3.3 2.7-5.1 6.2-5.1s5.6 1.8 6.2 5.1" /></svg></span></a>
        <a href="#wishlist" className="tool-label" aria-label="Wishlist, 0 saved products" onClick={stopNavigation}><span className="tool-icon"><svg viewBox="0 0 24 24"><path d="M20.8 8.7c0 5.1-8.8 10.2-8.8 10.2S3.2 13.8 3.2 8.7A4.6 4.6 0 0 1 12 6a4.6 4.6 0 0 1 8.8 2.7Z" /></svg></span></a>
        <a href="#cart" className="tool-label" aria-label="Shopping bag, 0 items" onClick={stopNavigation}><span className="tool-icon"><svg viewBox="0 0 24 24"><path d="M5.5 8.5h13l-1 11h-11z" /><path d="M9 9V6.8a3 3 0 0 1 6 0V9" /></svg></span></a>
      </div>
    </div>
    {menuOpen && <button className="nav-overlay" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
    <nav className={menuOpen ? 'nav nav-open' : 'nav'} aria-label="Primary navigation"><div className="mobile-nav-head"><img src={logoImage} alt="Glam Too" /><button className="mobile-nav-close" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>×</button></div>{['New In', 'Dresses', 'Clothing', 'Occasion', 'Co-Ords', 'Denim', 'Accessories', 'Sale'].map((item) => <a href={`#${item}`} onClick={(event) => { stopNavigation(event); setMenuOpen(false); }} key={item}>{item}</a>)}</nav>
    {searchOpen && <form className="header-search-panel" onSubmit={submitSearch}><label htmlFor="header-search-input">Search the shop</label><div className="header-search-form-row"><input id="header-search-input" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search dresses, accessories..." autoFocus /><button type="submit" className="header-search-submit">Search</button></div></form>}
  </header>;
}

function Footer() {
  const preventSubmit = (event: FormEvent) => event.preventDefault();
  const nav = (items: string[]) => <ul>{items.map((item) => <li key={item}><a href={`#${item}`} onClick={stopNavigation}>{item}</a></li>)}</ul>;
  const socialLinks = [
    { name: 'Instagram', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="12" cy="12" r="3.5" /><circle cx="17.3" cy="6.8" r=".8" fill="currentColor" stroke="none" /></svg> },
    { name: 'Facebook', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 20v-7h2.4l.4-3H14V8.2c0-.9.3-1.5 1.6-1.5H17V4.1c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 4v2H8.5v3h2.4v7" /></svg> },
    { name: 'TikTok', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4v10.2a3.7 3.7 0 1 1-3-3.6" /><path d="M14 4c.5 2.5 2 4 4.5 4.3" /></svg> },
    { name: 'Pinterest', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 20c1-2 1.2-3.2 1.7-5.2.4.8 1.4 1.6 2.8 1.6 3.7 0 6-3.1 6-6.8C20 6.2 16.8 4 12.4 4 7 4 4 7.4 4 11c0 2.1.8 4 2.5 4.7.2.1.4 0 .5-.2l.4-1.5c.1-.2 0-.3-.1-.5-.5-.6-.8-1.4-.8-2.5 0-3.3 2.5-6.2 6.5-6.2 3.5 0 5.4 2.1 5.4 4.9 0 3.7-1.6 6.8-4 6.8-1.3 0-2.3-1-2-2.3.4-1.7 1.1-3.5 1.1-4.7 0-1.1-.6-2-1.8-2-1.4 0-2.5 1.4-2.5 3.3 0 1.2.4 2 .4 2l-1.6 6.8" /></svg> },
  ];
  return <><section className="newsletter" aria-label="Newsletter signup"><div className="container newsletter-inner"><div className="newsletter-copy-group"><div className="newsletter-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><rect x="5" y="9" width="38" height="30" rx="1.5" /><path d="m6 11 18 15L42 11" /><path d="m6 37 13-12M42 37 29 25" /></svg></div><div><h2 className="display">Don't miss a thing</h2><p>New drops, style inspo and exclusive perks straight to your inbox.</p></div></div><form className="newsletter-form" onSubmit={preventSubmit}><label className="sr-only" htmlFor="newsletter-email">Email address</label><input id="newsletter-email" type="email" placeholder="Enter your email address" required /><button type="submit">Sign me up</button></form></div></section>
    <footer className="footer"><div className="container"><div className="footer-grid"><div className="footer-brand"><img className="footer-logo" src={logoImage} alt="Glam Too" /><p className="footer-intro">Outfits that make every moment yours. Expressive pieces for the beautifully busy life.</p><div className="footer-socials" aria-label="Social links">{socialLinks.map(({ name, icon }) => <a href={`#${name}`} aria-label={name} onClick={stopNavigation} key={name}>{icon}</a>)}</div></div><div><h4>Shop</h4>{nav(['New In', 'Dresses', 'Clothing', 'Occasion', 'Co-Ords', 'Denim', 'Accessories', 'Sale'])}</div><div><h4>Help</h4>{nav(['Delivery & Returns', 'Size Guide', 'FAQ', 'Contact Us'])}</div><div><h4>About</h4>{nav(['About', 'Style Journal'])}</div><div className="footer-knowledge"><h4>Stay in the know</h4><p>Sign up for new arrivals<br />and exclusive offers.</p><form className="footer-newsletter-form" onSubmit={preventSubmit}><label className="sr-only" htmlFor="footer-email">Email address</label><input id="footer-email" type="email" placeholder="Enter your email" required /><button type="submit" aria-label="Sign me up">→</button></form></div></div><div className="footer-bottom"><span>© 2026 Glam Too. All rights reserved.</span><div className="footer-legal-links"><a href="#privacy" onClick={stopNavigation}>Privacy Policy</a><span aria-hidden="true">|</span><a href="#terms" onClick={stopNavigation}>Terms & Conditions</a></div></div></div></footer></>;
}

export function Current() {
  const [openQuestion, setOpenQuestion] = useState(faqItems[0].question);
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleQuestions = faqItems.filter((item) => !normalizedQuery || `${item.question} ${item.answer}`.toLowerCase().includes(normalizedQuery));
  return <div className="glam-faq-current"><Header /><main className="page"><div className="faq-page"><section className="faq-hero" aria-labelledby="faq-heading"><div className="eyebrow">Help centre</div><h1 id="faq-heading">Frequently asked questions</h1><p>Find quick answers to our most common questions.<br /> Can't find what you're looking for? We're here to help.</p><div className="faq-search-wrap"><Search aria-hidden="true" /><label className="sr-only" htmlFor="faq-search">Search for an answer</label><input id="faq-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search for an answer" /></div></section><div className="container faq-content"><div className="faq-results" aria-live="polite">{visibleQuestions.length ? visibleQuestions.map((item) => <details className="faq-item" key={item.question} open={openQuestion === item.question}><summary onClick={(event) => { event.preventDefault(); setOpenQuestion((current) => current === item.question ? '' : item.question); }}><span>{item.question}</span><span className="faq-item-symbol" aria-hidden="true" /></summary><div className="faq-answer"><p>{item.answer}</p></div></details>) : <div className="faq-empty"><h2>No answers found yet.</h2><p>Try another search, or send our team a note and we'll help you find the right answer.</p><a className="button button-pink" href="#contact" onClick={stopNavigation}>Contact us</a></div>}</div><section className="faq-support" aria-labelledby="faq-support-heading"><div className="faq-support-icon" aria-hidden="true"><Headphones /></div><div><div className="eyebrow">Customer care</div><h2 id="faq-support-heading">Still need help?</h2><p>Our friendly support team is here for you. Get in touch and we'll be happy to assist.</p><a className="button button-pink" href="#contact" onClick={stopNavigation}>Contact us</a></div></section></div></div></main><Footer /></div>;
}