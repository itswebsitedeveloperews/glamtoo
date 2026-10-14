import "./_original.css";
export function Original() {
 const order = {id:"GM-DEMO",accountCreation:"created"};
  return <><div className="container confirmation"><div className="confirmation-mark">✓</div><div className="eyebrow">Order received</div><h1>It&apos;s a yes.</h1><p>Thank you for shopping Glam Too. Your order {order?.id} is being wrapped with care.</p>
    {order?.accountCreation && <div role="status" data-testid="confirmation-account-status">
      <p>{order.accountCreation === "created" ? "Your account has been created using your billing details. Verify your email and set a password to access your account and this order." : order.accountCreation === "existing" ? "An account already uses your billing email. Sign in with your existing details. For security, this guest purchase has not been linked to that account automatically." : "Your purchase is confirmed, but account creation is still pending. Refresh this page to retry account creation without paying again."}</p>
      {order.accountCreation === "created" && <a className="text-link" href="/account/recovery">Set your password</a>}
      {order.accountCreation === "existing" && <a className="text-link" href="/account">Sign in</a>}
      {order.accountCreation === "pending" && <button className="text-link" type="button" onClick={() => window.location.reload()}>Retry account creation</button>}
    </div>}
    <a className="button button-pink" href="/shop" data-testid="link-confirmation-shop">Keep browsing</a></div></>;
}
