import notFoundDisplayImage from '@assets/glam-too-404-display-no-bg.png';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <section className="not-found-page" aria-labelledby="not-found-title">
      <div className="not-found-stage">
        <div className="not-found-backdrop-number" aria-hidden="true">404</div>
        <div className="not-found-art">
          <img src={notFoundDisplayImage} alt="Glam Too 404 fashion display with a satin dress, shopping bags, and a pedestal" />
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
