import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => (
    <main className="min-h-screen bg-spotify-black px-5 py-16 text-white">
        <section className="mx-auto flex min-h-[60vh] max-w-5xl flex-col justify-center border-b border-spotify-hover pb-14">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-spotify-green">Conditions, without the guesswork</p>
            <h1 className="max-w-3xl text-5xl font-bold leading-tight">Ski Find</h1>
            <p className="mt-5 max-w-xl text-lg text-spotify-muted">
                Find a mountain, check the latest resort conditions, and keep your go-to destinations close.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/resorts" className="rounded-md bg-spotify-green px-6 py-3 font-bold text-black transition-colors hover:bg-spotify-green-hover">
                    Explore resorts
                </Link>
                <Link to="/signup" className="rounded-md border border-spotify-muted px-6 py-3 font-semibold text-white transition-colors hover:border-white">
                    Create account
                </Link>
            </div>
        </section>
        <section className="mx-auto grid max-w-5xl gap-8 py-10 sm:grid-cols-2">
            <div>
                <h2 className="text-lg font-semibold">Find your next mountain</h2>
                <p className="mt-2 text-sm text-spotify-muted">Search the resort directory and narrow it down by name, region, or country.</p>
            </div>
            <div>
                <h2 className="text-lg font-semibold">Keep a shortlist</h2>
                <p className="mt-2 text-sm text-spotify-muted">Sign in to save resorts to your personal list for your next trip.</p>
            </div>
        </section>
    </main>
);

export default LandingPage;
