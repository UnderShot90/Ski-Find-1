import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import '../../css/resorts.css';

const API_URL = process.env.REACT_APP_BACKEND_SERVER_URI || 'http://localhost:8081';
const RESORT_CACHE_KEY = 'skiFindResortDirectory';
const FALLBACK_RESORTS = [
    { slug: '49-degrees-north', name: '49 Degrees North', country: 'US', region: 'WA', latitude: 48.302353, longitude: -117.564011 },
    { slug: 'alpine-meadows', name: 'Alpine Meadows', country: 'US', region: 'CA', latitude: 39.148201, longitude: -120.150902 },
    { slug: 'alta', name: 'Alta', country: 'US', region: 'UT', latitude: 40.583828, longitude: -111.63726 },
    { slug: 'alyeska', name: 'Alyeska', country: 'US', region: 'AK', latitude: 60.961445, longitude: -149.102676 },
    { slug: 'arapahoe-basin', name: 'Arapahoe Basin', country: 'US', region: 'CO', latitude: 39.6425, longitude: -105.8719 },
    { slug: 'aspen-highlands', name: 'Aspen Highlands', country: 'US', region: 'CO', latitude: 39.1822, longitude: -106.855 },
    { slug: 'aspen-mountain', name: 'Aspen Mountain', country: 'US', region: 'CO', latitude: 39.1875, longitude: -106.8186 },
    { slug: 'beaver-creek', name: 'Beaver Creek', country: 'US', region: 'CO', latitude: 39.6042, longitude: -106.5165 },
    { slug: 'breckenridge', name: 'Breckenridge', country: 'US', region: 'CO', latitude: 39.4817, longitude: -106.0384 },
    { slug: 'brighton', name: 'Brighton', country: 'US', region: 'UT', latitude: 40.598, longitude: -111.5832 },
    { slug: 'copper-mountain', name: 'Copper Mountain', country: 'US', region: 'CO', latitude: 39.5022, longitude: -106.15 },
    { slug: 'crystal-mountain', name: 'Crystal Mountain', country: 'US', region: 'WA', latitude: 46.928, longitude: -121.504 },
    { slug: 'jackson-hole', name: 'Jackson Hole', country: 'US', region: 'WY', latitude: 43.5875, longitude: -110.8279 },
    { slug: 'keystone', name: 'Keystone', country: 'US', region: 'CO', latitude: 39.6061, longitude: -105.9717 },
    { slug: 'mammoth-mountain', name: 'Mammoth Mountain', country: 'US', region: 'CA', latitude: 37.6308, longitude: -119.0326 },
    { slug: 'park-city', name: 'Park City', country: 'US', region: 'UT', latitude: 40.6514, longitude: -111.508 },
    { slug: 'palisades-tahoe', name: 'Palisades Tahoe', country: 'US', region: 'CA', latitude: 39.1969, longitude: -120.2358 },
    { slug: 'snowbird', name: 'Snowbird', country: 'US', region: 'UT', latitude: 40.583, longitude: -111.655 },
    { slug: 'steamboat', name: 'Steamboat', country: 'US', region: 'CO', latitude: 40.4572, longitude: -106.8045 },
    { slug: 'telluride', name: 'Telluride', country: 'US', region: 'CO', latitude: 37.9375, longitude: -107.8123 },
    { slug: 'vail', name: 'Vail', country: 'US', region: 'CO', latitude: 39.6403, longitude: -106.3742 },
    { slug: 'whistler-blackcomb', name: 'Whistler Blackcomb', country: 'Canada', region: 'British Columbia', latitude: 50.1163, longitude: -122.9574 },
    { slug: 'alpe-lusia-san-pellegrino', name: 'Alpe Lusia / San Pellegrino', country: 'IT', region: 'Trentino', latitude: 46.3844919, longitude: 11.7834612 },
    { slug: 'arabba', name: 'Arabba / Marmolada', country: 'IT', region: 'Veneto', latitude: 46.4972239, longitude: 11.8720102 }
];

function extractResorts(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    for (const key of ['resorts', 'data', 'results', 'result']) {
        const items = extractResorts(payload[key]);
        if (items.length) return items;
    }

    return Object.values(payload).filter((item) => item && typeof item === 'object');
}

function normalizeResort(source) {
    const name = source.name || source.resortName || source.title || source.resort;
    if (typeof name !== 'string' || !name.trim()) return null;

    const slug = source.slug || source.id || name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const country = typeof source.country === 'object' ? source.country?.name : source.country;
    const region = typeof source.region === 'object' ? source.region?.name : source.region;
    const coordinates = source.coordinates || source.location || {};
    let latitude = Number(source.latitude ?? source.lat ?? coordinates.latitude ?? coordinates.lat ?? (Array.isArray(coordinates) ? coordinates[1] : undefined));
    let longitude = Number(source.longitude ?? source.lng ?? source.lon ?? coordinates.longitude ?? coordinates.lng ?? coordinates.lon ?? (Array.isArray(coordinates) ? coordinates[0] : undefined));
    if (String(country).toUpperCase() === 'IT' && Math.abs(latitude) < 20 && Math.abs(longitude) >= 35 && Math.abs(longitude) <= 55) {
        [latitude, longitude] = [longitude, latitude];
    }

    return {
        slug: String(slug).toLowerCase(),
        name: name.trim(),
        country: typeof country === 'string' ? country : '',
        region: typeof region === 'string' ? region : (source.state || source.province || ''),
        latitude: Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 ? latitude : null,
        longitude: Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 ? longitude : null
    };
}

function flattenDetails(value, prefix = '') {
    if (!value || typeof value !== 'object') return [];

    return Object.entries(value).flatMap(([key, item]) => {
        const label = prefix ? `${prefix} / ${key}` : key;
        if (item === null || item === undefined || /^(id|slug|name|resort)$/i.test(key)) return [];
        if (Array.isArray(item)) {
            if (item.every((entry) => ['string', 'number', 'boolean'].includes(typeof entry))) {
                return [{ label, value: item.slice(0, 5).join(', ') }];
            }
            return item.slice(0, 5).flatMap((entry, index) => flattenDetails(entry, `${label} ${index + 1}`));
        }
        if (typeof item === 'object') return flattenDetails(item, label);
        return [{ label, value: String(item) }];
    }).slice(0, 24);
}

function getDetailFacts(payload) {
    let details = payload;
    for (const key of ['data', 'result', 'resort']) {
        if (details && !Array.isArray(details) && details[key] && typeof details[key] === 'object') {
            details = details[key];
        }
    }
    const facts = flattenDetails(details);
    return facts.sort((first, second) => {
        const priority = /snow|lift|trail|open|weather|temp|wind|condition|depth|status/i;
        return Number(priority.test(second.label)) - Number(priority.test(first.label));
    });
}

const ResortsPage = () => {
    const navigate = useNavigate();
    const [token] = useState(() => localStorage.getItem('accessToken'));
    const [resorts, setResorts] = useState([]);
    const [savedSlugs, setSavedSlugs] = useState(() => new Set());
    const [query, setQuery] = useState('');
    const [view, setView] = useState('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [savingSlug, setSavingSlug] = useState('');
    const [detailsBySlug, setDetailsBySlug] = useState({});
    const [conditionErrors, setConditionErrors] = useState({});
    const [loadingDetailsSlug, setLoadingDetailsSlug] = useState('');
    const [expandedSlug, setExpandedSlug] = useState('');
    const [location, setLocation] = useState('');
    const [nearbyResorts, setNearbyResorts] = useState(null);
    const [nearbyOrigin, setNearbyOrigin] = useState('');
    const [nearbyLoading, setNearbyLoading] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        axios.get(`${API_URL}/ski/v1/resort`, { signal: controller.signal })
            .then((response) => {
                const normalized = extractResorts(response.data)
                    .map(normalizeResort)
                    .filter(Boolean);
                setResorts(normalized);
                if (!normalized.length) {
                    setError('The live resort list is unavailable. Showing the built-in directory instead.');
                    setResorts(FALLBACK_RESORTS);
                    return;
                }
                localStorage.setItem(RESORT_CACHE_KEY, JSON.stringify(normalized));
            })
            .catch((requestError) => {
                if (requestError.code !== 'ERR_CANCELED') {
                    const cachedResorts = (() => {
                        try {
                            const cached = JSON.parse(localStorage.getItem(RESORT_CACHE_KEY) || '[]');
                            return Array.isArray(cached) && cached.length ? cached : FALLBACK_RESORTS;
                        } catch (error) {
                            return FALLBACK_RESORTS;
                        }
                    })();
                    setResorts(cachedResorts);
                    setError('The live resort feed is temporarily unavailable. Showing the offline directory; live resort conditions may be unavailable.');
                }
            })
            .finally(() => setLoading(false));

        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!token) return;
        axios.get(`${API_URL}/resorts`, { headers: { Authorization: `Bearer ${token}` } })
            .then((response) => setSavedSlugs(new Set(response.data.map((resort) => resort.slug))))
            .catch((requestError) => {
                setError(requestError.response?.data?.message || 'Could not load your saved resorts.');
            });
    }, [token]);

    const normalizedQuery = query.trim().toLowerCase();
    const nearbyBySlug = new Map((nearbyResorts || []).map((resort) => [resort.slug, resort]));
    const sourceResorts = nearbyResorts ? resorts.filter((resort) => nearbyBySlug.has(resort.slug)) : resorts;
    const visibleResorts = sourceResorts.filter((resort) => {
        const matchesQuery = `${resort.name} ${resort.country} ${resort.region}`.toLowerCase().includes(normalizedQuery);
        return matchesQuery && (view === 'all' || savedSlugs.has(resort.slug));
    }).sort((first, second) => nearbyBySlug.has(first.slug) && nearbyBySlug.has(second.slug)
        ? nearbyBySlug.get(first.slug).distance.value - nearbyBySlug.get(second.slug).distance.value
        : 0);

    async function findNearby(origin) {
        setNearbyLoading(true);
        setError('');
        try {
            const destinations = resorts
                .filter((resort) => resort.latitude !== null && resort.longitude !== null)
                .map(({ slug, name, latitude, longitude }) => ({ slug, name, latitude, longitude }));
            const response = await axios.post(`${API_URL}/ski/nearby`, { origin, resorts: destinations });
            setNearbyResorts(response.data.resorts);
            setNearbyOrigin(response.data.origin);
            setView('all');
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Could not find nearby resorts. Check the Maps API configuration.');
        } finally {
            setNearbyLoading(false);
        }
    }

    function submitLocation(event) {
        event.preventDefault();
        if (location.trim()) findNearby({ address: location.trim() });
    }

    function useCurrentLocation() {
        if (!navigator.geolocation) {
            setError('Geolocation is not available in this browser.');
            return;
        }
        setNearbyLoading(true);
        setError('');
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => findNearby({ latitude: coords.latitude, longitude: coords.longitude }),
            () => {
                setNearbyLoading(false);
                setError('Could not access your location. Check browser permissions and try again.');
            },
            { enableHighAccuracy: false, timeout: 10000 }
        );
    }

    async function toggleSaved(resort) {
        if (!token) {
            navigate('/login');
            return;
        }

        setSavingSlug(resort.slug);
        setError('');
        try {
            if (savedSlugs.has(resort.slug)) {
                await axios.delete(`${API_URL}/resorts/${encodeURIComponent(resort.slug)}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setSavedSlugs((current) => {
                    const next = new Set(current);
                    next.delete(resort.slug);
                    return next;
                });
            } else {
                await axios.post(`${API_URL}/resorts`, resort, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setSavedSlugs((current) => new Set(current).add(resort.slug));
            }
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Could not update your saved resorts.');
        } finally {
            setSavingSlug('');
        }
    }

    async function toggleDetails(resort) {
        if (detailsBySlug[resort.slug]) {
            setDetailsBySlug((current) => {
                const next = { ...current };
                delete next[resort.slug];
                return next;
            });
            setConditionErrors((current) => {
                const next = { ...current };
                delete next[resort.slug];
                return next;
            });
            return;
        }

        setLoadingDetailsSlug(resort.slug);
        setError('');
        try {
            const response = await axios.get(`${API_URL}/ski/v1/resort/${encodeURIComponent(resort.slug)}`);
            setDetailsBySlug((current) => ({ ...current, [resort.slug]: getDetailFacts(response.data) }));
        } catch (requestError) {
            const status = requestError.response?.status;
            const message = status === 429
                ? 'Live conditions are temporarily rate-limited. Try again later.'
                : requestError.response?.data?.error || 'Could not load live resort conditions.';
            setDetailsBySlug((current) => ({ ...current, [resort.slug]: [] }));
            setConditionErrors((current) => ({ ...current, [resort.slug]: message }));
        } finally {
            setLoadingDetailsSlug('');
        }
    }

    return (
        <main className="resorts-page">
            <div className="resorts-shell">
                <header className="resorts-heading">
                    <div>
                        <p className="resorts-eyebrow">Ski Find / Directory</p>
                        <h1>Resorts</h1>
                    </div>
                    <p className="resorts-count">{resorts.length} destinations</p>
                </header>

                <section className="resorts-toolbar" aria-label="Resort filters">
                    <label className="resorts-search">
                        <span className="sr-only">Search resorts</span>
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search name, region, or country"
                        />
                    </label>
                    <div className="resorts-tabs" role="group" aria-label="Show resorts">
                        <button className={view === 'all' ? 'is-active' : ''} onClick={() => setView('all')}>All resorts</button>
                        <button className={view === 'saved' ? 'is-active' : ''} onClick={() => setView('saved')}>Saved</button>
                    </div>
                </section>

                <form className="resorts-location" onSubmit={submitLocation}>
                    <label className="resorts-search">
                        <span className="sr-only">City or ZIP code</span>
                        <input
                            type="search"
                            value={location}
                            onChange={(event) => setLocation(event.target.value)}
                            placeholder="Find resorts near a city or ZIP code"
                        />
                    </label>
                    <button className="resort-save" type="submit" disabled={nearbyLoading || !location.trim()}>
                        {nearbyLoading ? 'Searching…' : 'Find nearby'}
                    </button>
                    <button className="resort-save" type="button" onClick={useCurrentLocation} disabled={nearbyLoading}>
                        Use my location
                    </button>
                    {nearbyResorts && <button className="resort-clear" type="button" onClick={() => { setNearbyResorts(null); setNearbyOrigin(''); }}>Clear</button>}
                </form>
                {nearbyOrigin && <p className="resorts-nearby-status" role="status">Driving distances from {nearbyOrigin}. Showing up to 25 closest resorts.</p>}

                {error && <p className="resorts-message" role="alert">{error}</p>}
                {loading && <p className="resorts-message" role="status">Loading resort directory…</p>}

                {!loading && !visibleResorts.length && (
                    <div className="resorts-empty">
                        <h2>{view === 'saved' ? 'No saved resorts yet' : 'No matching resorts'}</h2>
                        <p>{view === 'saved' ? 'Save a resort from the directory and it will appear here.' : 'Try a different search, or check the API configuration.'}</p>
                        {!token && view === 'saved' && <Link to="/login">Log in to save resorts</Link>}
                    </div>
                )}

                <section className="resorts-grid" aria-label="Ski resorts">
                    {visibleResorts.map((resort) => {
                        const saved = savedSlugs.has(resort.slug);
                        return (
                            <article className="resort-row" key={resort.slug}>
                                <div className="resort-index" aria-hidden="true">{String(resorts.indexOf(resort) + 1).padStart(2, '0')}</div>
                                <div className="resort-details">
                                    <h2>
                                        <button
                                            className="resort-name-button"
                                            type="button"
                                            onClick={() => setExpandedSlug((current) => current === resort.slug ? '' : resort.slug)}
                                            aria-expanded={expandedSlug === resort.slug}
                                        >
                                            {resort.name}
                                        </button>
                                    </h2>
                                    <p>{[resort.region, resort.country].filter(Boolean).join(' / ') || 'Location unavailable'}</p>
                                    {nearbyBySlug.has(resort.slug) && <p className="resort-distance">{nearbyBySlug.get(resort.slug).distance.text} · {nearbyBySlug.get(resort.slug).duration.text}</p>}
                                </div>
                                <div className="resort-actions">
                                    <button
                                        className="resort-save"
                                        onClick={() => toggleDetails(resort)}
                                        disabled={loadingDetailsSlug === resort.slug}
                                        aria-expanded={Boolean(detailsBySlug[resort.slug])}
                                    >
                                        {loadingDetailsSlug === resort.slug ? 'Loading…' : detailsBySlug[resort.slug] ? 'Hide conditions' : 'Conditions'}
                                    </button>
                                    <button
                                        className={`resort-save ${saved ? 'is-saved' : ''}`}
                                        onClick={() => toggleSaved(resort)}
                                        disabled={savingSlug === resort.slug}
                                        aria-pressed={saved}
                                    >
                                        {savingSlug === resort.slug ? 'Saving…' : saved ? 'Saved' : token ? 'Save' : 'Log in to save'}
                                    </button>
                                </div>
                                {expandedSlug === resort.slug && (
                                    <div className="resort-overview">
                                        <div><dt>Location</dt><dd>{[resort.region, resort.country].filter(Boolean).join(', ') || 'Location unavailable'}</dd></div>
                                        <div><dt>Coordinates</dt><dd>{resort.latitude !== null && resort.longitude !== null ? `${resort.latitude.toFixed(4)}, ${resort.longitude.toFixed(4)}` : 'Not available'}</dd></div>
                                        {nearbyBySlug.has(resort.slug) && <div><dt>Drive from {nearbyOrigin}</dt><dd>{nearbyBySlug.get(resort.slug).distance.text} · {nearbyBySlug.get(resort.slug).duration.text}</dd></div>}
                                        <p>Open Conditions for current snow, lift, trail, and weather details.</p>
                                    </div>
                                )}
                                {detailsBySlug[resort.slug] && (
                                    <div className="resort-conditions">
                                        {conditionErrors[resort.slug] ? (
                                            <p role="status">{conditionErrors[resort.slug]}</p>
                                        ) : detailsBySlug[resort.slug].length ? (
                                            <dl>
                                                {detailsBySlug[resort.slug].map((fact) => (
                                                    <div key={fact.label}>
                                                        <dt>{fact.label.replace(/[_-]/g, ' ')}</dt>
                                                        <dd>{fact.value}</dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        ) : <p>No condition details are available for this resort.</p>}
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </section>
            </div>
        </main>
    );
};

export default ResortsPage;