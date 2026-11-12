import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import getUserInfo from "../utilities/decodeJwt";

export default function Navbar() {
  // Re-read the token on every navigation so the nav reflects sign-in/sign-out.
  useLocation();
  const user = getUserInfo();

  return (
    <nav className="site-nav" aria-label="Main navigation">
      <div className="site-nav-inner">
        <Link to="/" className="site-brand" aria-label="Ski Find home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>Ski Find</span>
        </Link>
        <div className="site-nav-links">
          <NavLink to="/resorts" className={({ isActive }) => `site-nav-link${isActive ? ' is-active' : ''}`}>Resorts</NavLink>
          <NavLink to="/home" className={({ isActive }) => `site-nav-link${isActive ? ' is-active' : ''}`}>Home</NavLink>
          <NavLink to="/privateUserProfile" className={({ isActive }) => `site-nav-link${isActive ? ' is-active' : ''}`}>Profile</NavLink>
          {user?.isAdmin && <NavLink to="/admin/reports" className={({ isActive }) => `site-nav-link${isActive ? ' is-active' : ''}`}>Reports</NavLink>}
        </div>
        <div className="site-nav-actions">
          {user
            ? <Link to="/privateUserProfile" className="site-nav-signin">{user.username}</Link>
            : <Link to="/login" className="site-nav-signin">Sign in</Link>}
          <Link to="/resorts" className="site-nav-action">Find a resort <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </nav>
  );
}
