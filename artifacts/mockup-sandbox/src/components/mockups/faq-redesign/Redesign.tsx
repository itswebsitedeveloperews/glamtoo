import { useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { ArrowUpRight, Headphones, Search } from 'lucide-react';
import './_group.css';
import './redesign.css';

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
const categories = ['All questions', 'Orders', 'Delivery', 'Returns', 'Products', 'Payments'];

function stopNavigation(event: MouseEvent<HTMLAnchorElement>) { event.preventDefault(); }

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); setSearchOpen(false); };
  return <header className="redesign-header">
    <div className="redesign-header-inner">
      <button className="redesign-menu" type="button" aria-label="Toggle menu" onClick={() => setMenuOpen((open) => !open)}><span /><span /></button>
      <button className="redesign-search-trigger" type="button" onClick={() => setSearchOpen((open) => !open)}><Search size={16} /> <span>Search</span></button>
      <a href="#home" onClick={stopNavigation}><img src={logoImage} alt="Glam Too" /></a>
      <nav aria-label="Primary navigation" className={menuOpen ? 'redesign-nav open' : 'redesign-nav'}>{['New In', 'Dresses', 'Clothing', 'Occasion', 'Co-Ords', 'Denim', 'Accessories', 'Sale'].map((item) => <a key={item} href={`#${item}`} onClick={(event) => { stopNavigation(event); setMenuOpen(false); }}>{item}</a>)}</nav>
      <div className="redesign-tools"><a href="#account" aria-label="Account" onClick={stopNavigation}>Account</a><a href="#wishlist" aria-label="Wishlist" onClick={stopNavigation}>Wishlist</a><a href="#cart" aria-label="Shopping bag" onClick={stopNavigation}>Bag (0)</a></div>
    </div>
    {searchOpen && <form className="redesign-header-search" onSubmit={submit}><label htmlFor="redesign-header-search">Search the shop</label><input id="redesign-header-search" type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search dresses, accessories..." /><button type="submit">Search</button></form>}
  </header>;
}

function Footer() {
  const preventSubmit = (event: FormEvent) => event.preventDefault();
  const linkGroup = (title: string, items: string[]) => <div><h4>{title}</h4><ul>{items.map((item) => <li key={item}><a href={`#${item}`} onClick={stopNavigation}>{item}</a></li>)}</ul></div>;
  return <><section className="redesign-newsletter"><div><span className="newsletter-kicker">A little something extra</span><h2>Don't miss a thing</h2><p>New drops, style inspo and exclusive perks, straight to your inbox.</p></div><form onSubmit={preventSubmit}><label className="sr-only" htmlFor="redesign-email">Email address</label><input id="redesign-email" type="email" placeholder="Enter your email address" required /><button type="submit">Sign me up <ArrowUpRight size={16} /></button></form></section><footer className="redesign-footer"><div className="redesign-footer-grid"><div className="redesign-footer-brand"><img src={logoImage} alt="Glam Too" /><p>Outfits that make every moment yours. Expressive pieces for the beautifully busy life.</p><div className="social-row"><a href="#Instagram" onClick={stopNavigation}>Instagram</a><a href="#Facebook" onClick={stopNavigation}>Facebook</a><a href="#TikTok" onClick={stopNavigation}>TikTok</a></div></div>{linkGroup('Shop', ['New In', 'Dresses', 'Clothing', 'Occasion', 'Sale'])}{linkGroup('Help', ['Delivery & Returns', 'Size Guide', 'FAQ', 'Contact Us'])}{linkGroup('About', ['About', 'Style Journal'])}<div><h4>Stay in the know</h4><p className="footer-note">Sign up for new arrivals<br />and exclusive offers.</p><form className="footer-email" onSubmit={preventSubmit}><label className="sr-only" htmlFor="redesign-footer-email">Email address</label><input id="redesign-footer-email" type="email" placeholder="Your email" required /><button type="submit" aria-label="Sign me up"><ArrowUpRight size={16} /></button></form></div></div><div className="redesign-footer-bottom"><span>© 2026 Glam Too. All rights reserved.</span><span><a href="#privacy" onClick={stopNavigation}>Privacy Policy</a> <i>|</i> <a href="#terms" onClick={stopNavigation}>Terms &amp; Conditions</a></span></div></footer></>;
}

export function Redesign() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All questions');
  const [openQuestion, setOpenQuestion] = useState(faqItems[0].question);
  const visibleQuestions = useMemo(() => faqItems.filter((item) => {
    const matchesCategory = category === 'All questions' || item.category === category;
    const normalized = query.trim().toLowerCase();
    return matchesCategory && (!normalized || `${item.question} ${item.answer}`.toLowerCase().includes(normalized));
  }), [category, query]);
  return <div className="glam-faq-redesign"><Header /><main>
    <section className="redesign-hero"><div className="hero-stamp">Customer care<br /><strong>GT / 01</strong></div><div className="redesign-hero-copy"><p className="eyebrow">The Glam Too guide</p><h1>Let’s make<br /><em>it easy.</em></h1><p className="hero-intro">Answers to the little things, from finding your fit to following your parcel home.</p><div className="redesign-search"><Search size={19} /><label className="sr-only" htmlFor="faq-redesign-search">Search for an answer</label><input id="faq-redesign-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What can we help with?" /></div></div><div className="hero-aside"><span>12 questions</span><span>Updated / 2026</span><div className="hero-rule" /><p>Good style should feel effortless. So should getting help.</p></div></section>
    <section className="redesign-faq-layout"><aside className="category-rail" aria-label="FAQ categories">{categories.map((item, index) => <button key={item} className={category === item ? 'active' : ''} type="button" onClick={() => { setCategory(item); setOpenQuestion(''); }}><span>0{index + 1}</span>{item}</button>)}</aside><div className="faq-column"><div className="faq-column-head"><p className="eyebrow">Browse by topic</p><p aria-live="polite">{visibleQuestions.length} {visibleQuestions.length === 1 ? 'answer' : 'answers'}</p></div>{visibleQuestions.length ? visibleQuestions.map((item, index) => <details className="redesign-faq-item" key={item.question} open={openQuestion === item.question}><summary onClick={(event) => { event.preventDefault(); setOpenQuestion((current) => current === item.question ? '' : item.question); }}><span className="faq-number">{String(index + 1).padStart(2, '0')}</span><span className="faq-question">{item.question}</span><span className="faq-plus" aria-hidden="true" /></summary><div className="redesign-answer"><p>{item.answer}</p></div></details>) : <div className="redesign-empty"><h2>No answers found yet.</h2><p>Try another search, or send our team a note and we'll help you find the right answer.</p><a href="#contact" onClick={stopNavigation}>Contact us <ArrowUpRight size={15} /></a></div>}</div></section>
    <section className="redesign-support"><div className="support-orbit"><Headphones size={31} /></div><div><p className="eyebrow">A human is here</p><h2>Still need help?</h2><p>Our friendly support team is here for you. Get in touch and we'll be happy to assist.</p><a href="#contact" onClick={stopNavigation}>Contact us <ArrowUpRight size={15} /></a></div><span className="support-side-note">hello@glamtoo.co.uk</span></section>
  </main><Footer /></div>;
}