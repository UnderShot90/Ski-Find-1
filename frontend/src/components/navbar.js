import React from "react";
import { Link, NavLink } from "react-router-dom";

export default function Navbar() {
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
        </div>
        <div className="site-nav-actions">
          <Link to="/login" className="site-nav-signin">Sign in</Link>
          <Link to="/resorts" className="site-nav-action">Find a resort <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </nav>
  );
}
