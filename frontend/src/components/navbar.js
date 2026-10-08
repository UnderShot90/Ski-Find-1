import React from "react";
import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="bg-spotify-dark border-b border-spotify-hover">
      <div className="max-w-2xl mx-auto px-6 py-3 flex gap-6">
        <Link to="/" className="text-white hover:text-spotify-green font-medium transition-colors">Ski Find</Link>
        <Link to="/resorts" className="text-white hover:text-spotify-green font-medium transition-colors">Resorts</Link>
        <Link to="/home" className="text-white hover:text-spotify-green font-medium transition-colors">Home</Link>
        <Link to="/privateUserProfile" className="text-white hover:text-spotify-green font-medium transition-colors">Profile</Link>
      </div>
    </nav>
  );
}
