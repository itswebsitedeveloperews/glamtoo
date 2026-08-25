import type { ReactNode } from 'react';
import fashionImage from '@assets/glam-me-20260814-final-v2_1787646629461.png';
import logoImage from '@assets/Glam_me_logo_transparent.png';
import { Route, Router as WouterRouter, Switch } from 'wouter';
import NotFound from '@/pages/not-found';

const products = [
  { id: 'luna', name: 'Luna Ruffle Mini Dress', price: '£89.99', detail: 'Blush pink · Recycled satin', position: '34% 41%' },
  { id: 'ella', name: 'Ella Tuxedo Jumpsuit', price: '£59.99', detail: 'Midnight · Tailored crepe', position: '51% 40%' },
  { id: 'mila', name: 'Mila Satin Maxi Dress', price: '£44.99', detail: 'Powder blue · Bias cut', position: '64% 45%' },
  { id: 'cleo', name: 'Cleo Shoulder Bag', price: '£39.99', detail: 'Rose petal · Soft leather', position: '80% 36%' },
  { id: 'romi', name: 'Romi Bow Midi Dress', price: '£74.99', detail: 'Petal pink · Organza bow', position: '42% 39%' },
  { id: 'naya', name: 'Naya Wide Leg Trouser', price: '£49.99', detail: 'Oat · Fluid tailoring', position: '55% 46%' },
];

function Header() {
  return (
    <header className="site-header" data-testid="site-header">
      <div className="header-inner">
        <a href="/shop" className="tool-label search-link" data-testid="link-search">
          <span className="tool-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="img"><circle cx="10.8" cy="10.8" r="6.2" /><path d="m16 16 4.3 4.3" /></svg>
          </span>
          <span>Search</span>
        </a>
        <a href="/" data-testid="link-home-logo"><img className="logo" src={logoImage} alt="Glam Me" /></a>
        <div className="header-tools">
          <a href="/about" className="tool-label icon-link" aria-label="Account" data-testid="link-account">
            <span className="tool-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img"><circle cx="12" cy="8" r="3.2" /><path d="M5.8 20c.6-3.3 2.7-5.1 6.2-5.1s5.6 1.8 6.2 5.1" /></svg>
            </span>
          </a>
          <a href="/cart" className="tool-label icon-link bag-link" aria-label="Shopping bag, 1 item" data-testid="link-cart">
            <span className="tool-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img"><path d="M5.5 8.5h13l-1 11h-11z" /><path d="M9 9V6.8a3 3 0 0 1 6 0V9" /></svg>
              <span className="bag-count">1</span>
            </span>
          </a>
        </div>
      </div>
      <nav className="nav" aria-label="Primary navigation">
        <a href="/shop" data-testid="link-nav-new-in">New In</a>
        <a href="/category" data-testid="link-nav-dresses">Dresses</a>
        <a href="/shop" data-testid="link-nav-clothing">Clothing</a>
        <a href="/category" data-testid="link-nav-occasion">Occasion</a>
        <a href="/category" data-testid="link-nav-co-ords">Co-Ords</a>
        <a href="/shop" data-testid="link-nav-denim">Denim</a>
        <a href="/shop" data-testid="link-nav-accessories">Accessories</a>
        <a href="/shop" data-testid="link-nav-sale">Sale</a>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <>
      <section className="newsletter" aria-label="Newsletter signup">
        <div className="container newsletter-inner">
          <div>
            <h2 className="display">Don&apos;t miss a thing</h2>
            <p>New drops, daily inspiration and 10% off your first order, delivered with care.</p>
          </div>
          <form className="newsletter-form" action="/" method="get">
            <label className="sr-only" htmlFor="newsletter-email">Email address</label>
            <input id="newsletter-email" name="email" type="email" placeholder="Enter your email address" required data-testid="input-newsletter-email" />
            <button type="submit" data-testid="button-newsletter-submit">Sign me up</button>
          </form>
        </div>
      </section>
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <img className="footer-logo" src={logoImage} alt="Glam Me" />
              <p className="footer-intro">Outfits that make every moment yours. Expressive pieces for the beautifully busy life.</p>
            </div>
            <div><h4>Shop</h4><ul><li><a href="/shop" data-testid="link-footer-new-in">New In</a></li><li><a href="/category" data-testid="link-footer-dresses">Dresses</a></li><li><a href="/category" data-testid="link-footer-occasion">Occasion</a></li><li><a href="/shop" data-testid="link-footer-sale">Sale</a></li></ul></div>
            <div><h4>Help</h4><ul><li><a href="/delivery-returns" data-testid="link-footer-delivery">Delivery &amp; Returns</a></li><li><a href="/faq" data-testid="link-footer-faq">FAQ</a></li><li><a href="/contact" data-testid="link-footer-contact">Contact Us</a></li></ul></div>
            <div><h4>About</h4><ul><li><a href="/about" data-testid="link-footer-about">Our story</a></li><li><a href="/privacy" data-testid="link-footer-privacy">Privacy Policy</a></li><li><a href="/terms" data-testid="link-footer-terms">Terms &amp; Conditions</a></li></ul></div>
          </div>
          <div className="footer-bottom"><span>© 2026 Glam Me. All rights reserved.</span><span>Made for your next favourite moment.</span></div>
        </div>
      </footer>
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <><Header /><main className="page">{children}</main><Footer /></>;
}

function ProductCard({ product, featured = false }: { product: typeof products[number]; featured?: boolean }) {
  return (
    <article className="product-card" data-testid={`card-product-${product.id}`}>
      <a href="/product" data-testid={`link-product-${product.id}`}>
        <div className="product-image">
          {featured && <span className="badge">Just in</span>}
          <span className="heart" aria-hidden="true">♡</span>
          <img src={fashionImage} alt={`${product.name}, ${product.detail}`} style={{ objectPosition: product.position }} />
        </div>
        <div className="product-info">
          <div><div className="product-name">{product.name}</div><div className="product-meta">{product.detail}</div></div>
          <div className="price">{product.price}</div>
        </div>
      </a>
    </article>
  );
}

function Home() {
  return (
    <Shell>
      <section className="hero" aria-label="The new occasion edit">
        <img className="hero-image" src={fashionImage} alt="Woman in a pink dress beside a vintage pink car on a sunny street" />
        <div className="hero-copy">
          <div className="eyebrow">The new occasion edit</div>
          <h1>It&apos;s your moment.</h1>
          <p>Standout outfits for every plan on your calendar, from the first coffee to the last dance.</p>
          <a className="button button-pink" href="/shop" data-testid="link-hero-shop">Shop the edit</a>
        </div>
      </section>
      <div className="intro-strip"><div className="container intro-strip-inner"><span>Designed in London</span><span>Easy, joyful dressing</span><span>Free delivery over £75</span></div></div>
      <section className="products-section container" aria-labelledby="obsessions-heading">
        <div className="section-heading"><div><div className="eyebrow">The Glam Edit</div><h2 id="obsessions-heading">Our current obsessions</h2></div><a className="text-link" href="/shop" data-testid="link-view-all-products">View all pieces</a></div>
        <div className="product-grid">{products.slice(0, 4).map((product, index) => <ProductCard key={product.id} product={product} featured={index === 0} />)}</div>
      </section>
      <section className="moments" aria-labelledby="moments-heading">
        <div className="container"><div className="section-heading"><div><div className="eyebrow">Shop by moment</div><h2 id="moments-heading">Outfits for every plan</h2></div><a className="text-link" href="/category" data-testid="link-shop-moments">Explore all moments</a></div>
          <div className="moment-grid">
            {['Day Out', 'Date Night', 'Weddings', 'Weekend Plans'].map((moment, index) => <a className="moment-card" href="/category" key={moment} data-testid={`link-moment-${index}`}>
              <img src={fashionImage} alt={`${moment} fashion edit`} />
              <div className="moment-copy"><h3>{moment}</h3><p>{['Bright looks for sunny plans.', 'Turn heads from six to midnight.', 'Guest-ready looks for the loved-up days.', 'Effortless pieces for off-duty hours.'][index]}</p><span className="text-link">Shop now</span></div>
            </a>)}
          </div>
        </div>
      </section>
      <section className="editorial container">
        <div className="editorial-layout"><div className="editorial-art"><img src={fashionImage} alt="Editorial portrait from the Glam Me occasion collection" /></div><div className="editorial-copy"><div className="eyebrow">A little more you</div><h2>Dress like you mean it.</h2><p>There is no dress code for being exactly yourself. Find the colour, cut and confidence that follows you into the room.</p><a className="button" href="/about" data-testid="link-about-editorial">Meet Glam Me</a></div></div>
      </section>
    </Shell>
  );
}

function PageHero({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return <section className="page-hero"><div className="container"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{copy && <p>{copy}</p>}</div></section>;
}

function Shop() {
  return <Shell><PageHero eyebrow="The shop" title="Pieces with presence." copy="A considered wardrobe of colour, texture and easy confidence. Find something for the plan you have, and the one you haven't made yet." /><div className="container shop-layout"><aside className="filter"><h3>Browse</h3><a href="/shop">All pieces</a><a href="/category">Dresses</a><a href="/category">Occasionwear</a><a href="/shop">Tops &amp; tailoring</a><a href="/shop">Accessories</a><h3 style={{ marginTop: 36 }}>Sort by</h3><a href="/shop">New in</a><a href="/shop">Bestsellers</a><a href="/shop">Price: low to high</a></aside><section className="shop-main"><div className="shop-toolbar"><span>24 pieces</span><span>Showing all</span></div><div className="product-grid">{products.map((product, index) => <ProductCard key={product.id} product={product} featured={index < 2} />)}</div></section></div></Shell>;
}

function Category() {
  return <Shell><PageHero eyebrow="The occasion edit" title="Dress for the yes." copy="Wedding dates, birthday dinners, rooftop drinks and every reason to make an entrance." /><div className="container shop-layout"><aside className="filter"><h3>Occasion</h3><a href="/category">All occasion</a><a href="/category">Wedding guest</a><a href="/category">Date night</a><a href="/category">Party dressing</a><a href="/category">Holiday</a></aside><section className="shop-main"><div className="shop-toolbar"><span>Occasion / 12 pieces</span><a href="/shop">View all shop</a></div><div className="product-grid">{products.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} />)}</div></section></div></Shell>;
}

function Product() {
  return <Shell><div className="container product-detail"><div className="product-detail-layout"><div className="product-gallery"><div className="gallery-image"><img src={fashionImage} alt="Luna ruffle mini dress in blush pink, full editorial view" /></div><div className="gallery-image"><img src={fashionImage} alt="Luna ruffle mini dress detail" /></div><div className="gallery-image"><img src={fashionImage} alt="Luna ruffle mini dress styled for occasionwear" /></div></div><div className="detail-copy"><div className="eyebrow">The occasion edit · Just in</div><h1>Luna Ruffle Mini Dress</h1><div className="detail-price">£89.99</div><p>A little romance, a lot of movement. Luna is cut in soft recycled satin with a gathered neckline, floaty ruffles and a hem made for dancing.</p><form className="detail-form" action="/cart" method="get"><div className="field"><label htmlFor="dress-size">Select size</label><select id="dress-size" name="size" defaultValue="" required data-testid="select-product-size"><option value="" disabled>Choose a size</option><option>UK 6</option><option>UK 8</option><option>UK 10</option><option>UK 12</option><option>UK 14</option></select></div><div className="field"><label>Colour · Blush</label><div className="swatches" aria-label="Available colours"><span className="swatch swatch-pink" title="Blush"></span><span className="swatch swatch-black" title="Black"></span><span className="swatch swatch-blue" title="Sky"></span></div></div><button className="button" type="submit" data-testid="button-add-to-bag">Add to bag · £89.99</button></form><div className="detail-notes"><details open><summary>Fit &amp; details</summary><p>True to size with a relaxed, floaty fit. Adjustable straps and invisible side zip. Dress length: 82cm.</p></details><details><summary>Delivery &amp; returns</summary><p>Free standard delivery over £75. Return unworn pieces within 28 days.</p></details></div></div></div></div></Shell>;
}

function About() {
  return <Shell><div className="split-page"><div className="split-image"><img src={fashionImage} alt="Glam Me woman wearing pink in the sunshine" /></div><div className="split-copy"><div className="eyebrow">Our story</div><h1>More you, more often.</h1><p>Glam Me began with a simple belief: getting dressed should be one of the best parts of your day. We make expressive, feminine clothes for the many versions of you — the early riser, the plus-one, the main character and the one who stays out for one more.</p><p>Our collections are small, considered and designed to be worn on repeat. Expect confident colour, thoughtful details and pieces that make an ordinary Tuesday feel like a very good idea.</p><div className="quote">“Wear the thing that makes you stand a little taller.”</div></div></div></Shell>;
}

function FAQ() {
  const questions = [['How do Glam Me pieces fit?', 'Most pieces fit true to size. Every product page includes fit notes and garment measurements to help you choose. If you are between sizes, we recommend sizing up in fitted styles.'], ['When will my order arrive?', 'Standard delivery takes 2–4 working days and express delivery takes 1–2 working days. You will receive tracking as soon as your parcel leaves us.'], ['Can I return something?', 'Of course. Send unworn, unwashed items back within 28 days of delivery with tags attached. Visit Delivery & Returns for the full guide.'], ['Do you deliver internationally?', 'We currently deliver across the UK and selected European destinations. Delivery options and costs are shown at checkout.'], ['How can I contact you?', 'Our team is here Monday to Friday, 9am–5pm. Email hello@glamme.co.uk or use our contact form.']];
  return <Shell><PageHero eyebrow="Need to know" title="Questions, answered." copy="The useful details, without the fine-print maze." /><div className="container faq-list">{questions.map(([question, answer], index) => <details key={question} open={index === 0}><summary data-testid={`text-faq-question-${index}`}>{question}</summary><p>{answer}</p></details>)}</div></Shell>;
}

function Contact() {
  return <Shell><div className="container form-page"><div className="form-layout"><div className="form-copy"><div className="eyebrow">Say hello</div><h1>Let&apos;s talk.</h1><p>Questions about a fit, an order or your next big moment? Our small, lovely customer care team is ready.</p><p>hello@glamme.co.uk<br />Monday–Friday, 9am–5pm</p></div><form className="form-stack" action="/contact" method="get"><div className="field"><label htmlFor="contact-name">Your name</label><input id="contact-name" name="name" type="text" required data-testid="input-contact-name" /></div><div className="field"><label htmlFor="contact-email">Email address</label><input id="contact-email" name="email" type="email" required data-testid="input-contact-email" /></div><div className="field"><label htmlFor="contact-topic">What can we help with?</label><select id="contact-topic" name="topic" defaultValue="" data-testid="select-contact-topic"><option value="" disabled>Choose a topic</option><option>Order help</option><option>Fit &amp; styling</option><option>Returns</option><option>Something else</option></select></div><div className="field"><label htmlFor="contact-message">Your message</label><textarea id="contact-message" name="message" required data-testid="textarea-contact-message"></textarea></div><button className="button" type="submit" data-testid="button-contact-submit">Send message</button></form></div></div></Shell>;
}

function LegalPage({ type }: { type: 'privacy' | 'terms' | 'delivery' }) {
  const copy = type === 'privacy' ? { eyebrow: 'The small print', title: 'Privacy policy', heads: ['The short version', 'What we collect', 'How we use your information'], paras: ['We respect your information and only collect what we need to make your Glam Me experience work well. This policy explains what happens to your details when you browse or shop with us.', 'When you place an order, sign up to our notes or contact us, we may collect your name, contact details, delivery address and order information. We never sell your personal information.', 'We use information to process orders, answer your questions, improve our website and send emails you have chosen to receive. You can unsubscribe at any time.'] } : type === 'terms' ? { eyebrow: 'The small print', title: 'Terms & conditions', heads: ['Using this site', 'Products and pricing', 'Orders'], paras: ['By using glamme.co.uk, you agree to use the site lawfully and with respect for our content, team and community. These terms apply to every visit and purchase.', 'We take care to keep product descriptions, colours and prices accurate. Occasionally a detail may change; if it affects your order, we will contact you before dispatch.', 'An order is confirmed when you receive our email confirmation. If we cannot fulfil an item, we will let you know and refund the unavailable part of your order.'] } : { eyebrow: 'The useful details', title: 'Delivery & returns', heads: ['Delivery', 'Returns', 'The good-to-know bit'], paras: ['Standard delivery is £3.95 and takes 2–4 working days. Express delivery is £6.95 and takes 1–2 working days. Standard delivery is free on orders over £75.', 'Changed your mind? Return unworn items with tags attached within 28 days of delivery. Start your return by emailing hello@glamme.co.uk with your order number.', 'Please try on occasionwear over underwear and keep makeup, perfume and deodorant away from garments. Items showing signs of wear may not be accepted.'] };
  return <Shell><div className="container legal"><div className="eyebrow">{copy.eyebrow}</div><h1>{copy.title}</h1>{copy.heads.map((head, index) => <section key={head}><h2>{head}</h2><p>{copy.paras[index]}</p></section>)}<p>Last updated: February 2026. For any questions, please <a className="text-link" href="/contact">contact our team</a>.</p></div></Shell>;
}

function Cart() {
  return <Shell><div className="container cart-page"><div className="eyebrow">Your edit</div><h1>Your bag.</h1><div className="cart-layout"><div><div className="cart-item"><img src={fashionImage} alt="Luna Ruffle Mini Dress in blush pink" /><div><h3>Luna Ruffle Mini Dress</h3><p>Blush · UK 10 · Qty 1</p><a className="text-link" href="/product">Edit item</a></div><strong>£89.99</strong></div><a className="text-link" href="/shop" data-testid="link-cart-continue">Continue shopping</a></div><aside className="cart-summary"><h2>Summary</h2><div className="summary-row"><span>Subtotal</span><span>£89.99</span></div><div className="summary-row"><span>Delivery</span><span>Free</span></div><div className="summary-row total"><span>Total</span><span>£89.99</span></div><a className="button button-pink" href="/checkout" data-testid="link-checkout">Go to checkout</a></aside></div></div></Shell>;
}

function Checkout() {
  return <Shell><div className="container form-page"><div className="form-layout"><div className="form-copy"><div className="eyebrow">Nearly yours</div><h1>Checkout.</h1><p>Complete your details below. You will receive an order confirmation by email.</p><a className="text-link" href="/cart">Return to bag</a></div><form className="form-stack" action="/order-confirmation" method="get"><div className="field"><label htmlFor="checkout-email">Email address</label><input id="checkout-email" name="email" type="email" required data-testid="input-checkout-email" /></div><div className="field"><label htmlFor="checkout-name">Full name</label><input id="checkout-name" name="name" type="text" required data-testid="input-checkout-name" /></div><div className="field"><label htmlFor="checkout-address">Address</label><input id="checkout-address" name="address" type="text" required data-testid="input-checkout-address" /></div><div className="field"><label htmlFor="checkout-city">Town or city</label><input id="checkout-city" name="city" type="text" required data-testid="input-checkout-city" /></div><div className="field"><label htmlFor="checkout-postcode">Postcode</label><input id="checkout-postcode" name="postcode" type="text" required data-testid="input-checkout-postcode" /></div><div className="field"><label htmlFor="checkout-delivery">Delivery method</label><select id="checkout-delivery" name="delivery" defaultValue="standard" data-testid="select-checkout-delivery"><option value="standard">Standard · Free</option><option value="express">Express · £6.95</option></select></div><button className="button" type="submit" data-testid="button-place-order">Place order · £89.99</button></form></div></div></Shell>;
}

function Confirmation() {
  return <Shell><div className="container confirmation"><div className="confirmation-mark">✓</div><div className="eyebrow">Order received</div><h1>It&apos;s a yes.</h1><p>Thank you for shopping Glam Me. Your order GM-260214 is being wrapped with care. We&apos;ve sent all the details to your inbox.</p><a className="button button-pink" href="/shop" data-testid="link-confirmation-shop">Keep browsing</a></div></Shell>;
}

function App() {
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Switch>
    <Route path="/" component={Home} />
    <Route path="/about" component={About} />
    <Route path="/shop" component={Shop} />
    <Route path="/product" component={Product} />
    <Route path="/category" component={Category} />
    <Route path="/faq" component={FAQ} />
    <Route path="/contact" component={Contact} />
    <Route path="/privacy" component={() => <LegalPage type="privacy" />} />
    <Route path="/terms" component={() => <LegalPage type="terms" />} />
    <Route path="/delivery-returns" component={() => <LegalPage type="delivery" />} />
    <Route path="/cart" component={Cart} />
    <Route path="/checkout" component={Checkout} />
    <Route path="/order-confirmation" component={Confirmation} />
    <Route component={NotFound} />
  </Switch></WouterRouter>;
}

export default App;