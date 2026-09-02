import { Link } from 'wouter';

export default function NotFound() {
  return (
    <section className="not-found-page" aria-labelledby="not-found-title">
      <div className="not-found-stage">
        <div className="not-found-backdrop-number" aria-hidden="true">404</div>
        <div className="not-found-art" aria-hidden="true">
          <span className="not-found-art-number">04</span>
          <span className="not-found-art-label">Glam Too / Since 2026</span>
          <span className="not-found-art-line" />
        </div>
        <div className="not-found-copy">
          <p className="not-found-kicker">A little detour</p>
          <h1 id="not-found-title">We couldn&apos;t find that page.</h1>
          <p className="not-found-message">
            The page may have moved, or the link may be wearing yesterday&apos;s look.
            Let&apos;s get you back to something lovely.
          </p>
          <div className="not-found-actions">
            <Link className="button button-pink" href="/">Return home</Link>
            <Link className="not-found-shop-link" href="/shop">Shop new arrivals <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
