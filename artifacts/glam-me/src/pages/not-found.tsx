import notFoundDisplayImage from '@assets/glam-too-404-display-reference-no-bg.png';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <section className="not-found-page" aria-label="Page not found">
      <div className="not-found-stage">
        <div className="not-found-art">
          <img src={notFoundDisplayImage} alt="Glam Too fashion display with a satin dress, shopping bags, and a pedestal" />
        </div>
        <div className="not-found-copy">
          <div className="not-found-actions">
            <Link className="button button-pink" href="/">Return home</Link>
            <Link className="not-found-shop-link" href="/shop">Shop new arrivals <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
