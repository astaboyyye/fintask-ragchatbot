import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

function AuthWidget() {
  const [me, setMe] = useState(null);
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => {});
  }, []);
  if (!me?.authEnabled) return null;
  if (me.user) {
    return (
      <div className="auth">
        {me.user.image && <img src={me.user.image} alt="" className="avatar" />}
        <span className="auth-name">{me.user.name}</span>
        <a href="/api/auth/signout" className="btn btn-ghost btn-sm">Sign out</a>
      </div>
    );
  }
  return (
    <a href="/api/auth/signin/github" className="btn btn-ghost btn-sm">Sign in with GitHub</a>
  );
}

export default function Layout({ title, children, wide = false }) {
  const { pathname } = useRouter();
  const nav = [
    { href: "/", label: "Upload" },
    { href: "/documents", label: "Documents" },
  ];
  return (
    <>
      <Head>
        <title>{title ? `${title} · DocQuery` : "DocQuery · Chat with your PDFs"}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Upload a PDF and ask questions. Answers come from the document, with page citations." />
        <link rel="icon" href="/favicon.svg" />
      </Head>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><circle cx="11.5" cy="14" r="2.5" /><path d="m13.5 16 2 2" /></svg>
            </span>
            DocQuery
          </Link>
          <nav className="nav">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${pathname === item.href ? "active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <AuthWidget />
        </div>
      </header>
      <main className={wide ? "page page-wide" : "page"}>{children}</main>
    </>
  );
}
