import logoImage from '@assets/glam_me_logo_1787652435373.svg';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <main className="not-found-page">
      <section className="not-found-shell" aria-labelledby="not-found-title">
        <Link className="not-found-logo" href="/" aria-label="Glam Too home">
          <img src={logoImage} alt="Glam Too" />
        </Link>

        <div className="not-found-copy">
          <p className="not-found-kicker">A little detour</p>
          <div className="not-found-number" aria-hidden="true">404</div>
          <h1 id="not-found-title">We couldn&apos;t find that page.</h1>
          <p className="not-found-message">
            The page may have moved, or the link may be wearing yesterday&apos;s look.
            Let&apos;s get you back to something lovely.
          </p>
          <div className="not-found-actions">
            <Link className="button button-pink" href="/">Back to home</Link>
            <Link className="not-found-shop-link" href="/shop">Shop the collection <span aria-hidden="true">→</span></Link>
          </div>
        </div>

        <div className="not-found-art" aria-hidden="true">
          <span className="not-found-art-number">04</span>
          <span className="not-found-art-label">Glam Too / Since 2026</span>
          <span className="not-found-art-line" />
        </div>
      </section>
    </main>
  );
}
