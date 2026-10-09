import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import getUserInfo from '../../utilities/decodeJwt';

const API_URL = process.env.REACT_APP_BACKEND_SERVER_URI || 'http://localhost:8081';

const HomePage = () => {
    const [user] = useState(() => getUserInfo());
    const [savedResorts, setSavedResorts] = useState([]);
    const [savedLoading, setSavedLoading] = useState(false);
    const [savedError, setSavedError] = useState('');
    const token = localStorage.getItem('accessToken');

    useEffect(() => {
        if (!token) return undefined;

        const controller = new AbortController();
        setSavedLoading(true);
        axios.get(`${API_URL}/resorts`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal
        })
            .then((response) => setSavedResorts(response.data))
            .catch((error) => {
                if (error.code !== 'ERR_CANCELED') {
                    setSavedError('Your saved resorts are unavailable right now.');
                }
            })
            .finally(() => setSavedLoading(false));

        return () => controller.abort();
    }, [token]);

    return (
        <main className="site-home-dashboard">
            <div className="dashboard-shell">
                <header className="dashboard-heading">
                    <div>
                        <p className="dashboard-kicker">Ski Find / Home</p>
                        <h1>{user ? `Welcome back, ${user.username}.` : 'Plan your next mountain day.'}</h1>
                        <p className="dashboard-summary">Find a resort, check its conditions, and keep your next trip moving.</p>
                    </div>
                    <Link to="/resorts" className="dashboard-primary-link">Browse resorts <span aria-hidden="true">↗</span></Link>
                </header>

                <section className="dashboard-tools" aria-label="Resort tools">
                    <Link to="/resorts" className="dashboard-tool">
                        <span className="dashboard-tool-number">01</span>
                        <span><strong>Find nearby</strong><small>Search by city, ZIP code, or current location.</small></span>
                        <span className="dashboard-tool-arrow" aria-hidden="true">↗</span>
                    </Link>
                    <Link to="/resorts" className="dashboard-tool">
                        <span className="dashboard-tool-number">02</span>
                        <span><strong>Check conditions</strong><small>Open a resort for snow, lifts, trails, and weather.</small></span>
                        <span className="dashboard-tool-arrow" aria-hidden="true">↗</span>
                    </Link>
                    <Link to={user ? '/privateUserProfile' : '/login'} className="dashboard-tool">
                        <span className="dashboard-tool-number">03</span>
                        <span><strong>{user ? 'Your account' : 'Sign in'}</strong><small>{user ? 'Manage your profile and account details.' : 'Sign in to keep a personal resort shortlist.'}</small></span>
                        <span className="dashboard-tool-arrow" aria-hidden="true">↗</span>
                    </Link>
                </section>

                <section className="dashboard-saved" aria-labelledby="saved-heading">
                    <div className="dashboard-section-heading">
                        <div>
                            <p className="dashboard-kicker">Your shortlist</p>
                            <h2 id="saved-heading">Saved resorts</h2>
                        </div>
                        {user && <span className="dashboard-saved-count">{savedResorts.length}</span>}
                    </div>

                    {!user ? (
                        <div className="dashboard-empty">
                            <p>Sign in to save resorts and keep your next trip close.</p>
                            <Link to="/login">Sign in</Link>
                        </div>
                    ) : savedLoading ? (
                        <p className="dashboard-feedback" role="status">Loading your saved resorts…</p>
                    ) : savedError ? (
                        <p className="dashboard-feedback" role="status">{savedError}</p>
                    ) : savedResorts.length ? (
                        <div className="dashboard-saved-list">
                            {savedResorts.slice(0, 5).map((resort) => (
                                <Link className="dashboard-saved-row" to={`/resorts/${resort.slug}`} key={resort.slug}>
                                    <span className="saved-resort-mark" aria-hidden="true">S</span>
                                    <span className="saved-resort-info">
                                        <strong>{resort.name}</strong>
                                        <small>{[resort.region, resort.country].filter(Boolean).join(' / ') || 'Location unavailable'}</small>
                                    </span>
                                    <span className="dashboard-tool-arrow" aria-hidden="true">↗</span>
                                </Link>
                            ))}
                            {savedResorts.length > 5 && <Link className="dashboard-more-link" to="/resorts">View all {savedResorts.length} saved resorts</Link>}
                        </div>
                    ) : (
                        <div className="dashboard-empty">
                            <p>No resorts saved yet. Start with a place you want to ride.</p>
                            <Link to="/resorts">Explore the directory</Link>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
};

export default HomePage;
