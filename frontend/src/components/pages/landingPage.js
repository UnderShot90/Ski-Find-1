import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => (
    <main className="landing-page">
        <section className="landing-hero">
            <div className="landing-hero-content">
                <p className="landing-kicker"><span className="status-dot" /> Your next day on the mountain starts here</p>
                <h1>Find your<br /><em>mountain.</em></h1>
                <p className="landing-summary">Compare East Coast ski resorts from Maine to North Carolina, check live lift conditions, and keep the places you love within reach.</p>
                <div className="landing-actions">
                    <Link to="/resorts" className="button-primary">Explore resorts <span aria-hidden="true">↗</span></Link>
                    <Link to="/signup" className="button-quiet">Create an account</Link>
                    <Link to="/login" className="button-signin">Sign in</Link>
                </div>
            </div>
            <div className="hero-caption"><span>01 / 03</span><span>Fresh tracks are closer than you think</span></div>
        </section>

        <section className="landing-content">
            <header className="section-heading">
                <p className="section-kicker">A better day starts with a little planning</p>
                <h2>From first search<br />to first chair.</h2>
            </header>
            <div className="feature-list">
                <article className="feature-item">
                    <span className="feature-number">01</span>
                    <div><h3>Find your mountain</h3><p>Browse East Coast mountains by state, or find the closest ones by driving distance from a city or ZIP code.</p></div>
                    <span className="feature-arrow" aria-hidden="true">↗</span>
                </article>
                <article className="feature-item">
                    <span className="feature-number">02</span>
                    <div><h3>Know before you go</h3><p>Every resort has its own page with mountain stats, live lift status, and a link to its official site.</p></div>
                    <span className="feature-arrow" aria-hidden="true">↗</span>
                </article>
                <article className="feature-item">
                    <span className="feature-number">03</span>
                    <div><h3>Keep your shortlist</h3><p>Save the places you want to ride next and return to them whenever inspiration hits.</p></div>
                    <span className="feature-arrow" aria-hidden="true">↗</span>
                </article>
            </div>
        </section>
        <footer className="landing-footer"><span>SKI FIND</span><span>Find the snow. Find your people. Find your line.</span></footer>
    </main>
);

export default LandingPage;
