import React, { useCallback, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import ResortMap from '../ResortMap';
import { REGION_NAMES } from '../../data/resortCatalog';
import { API_URL, useConditions, useResortDirectory, useSavedResorts } from '../../utilities/resortHooks';
import { CONDITION_SORTS, formatConditions, formatLocation, hasCoordinates, isEastCoast, sortByConditions } from '../../utilities/resorts';
import '../../css/resorts.css';

// Directory views. East Coast is the default because that is Ski Find's focus.
const SCOPES = [
    { id: 'east', label: 'East Coast' },
    { id: 'all', label: 'All regions' },
    { id: 'saved', label: 'Saved' }
];

const ResortsPage = () => {
    const navigate = useNavigate();
    const { resorts, loading, notice } = useResortDirectory();
    const { token, savedSlugs, savingSlug, savedError, toggleSaved } = useSavedResorts();
    const { conditionsBySlug } = useConditions();

    // Filters
    const [query, setQuery] = useState('');
    const [scope, setScope] = useState('east');
    const [stateFilter, setStateFilter] = useState('');
    // 'name', 'distance' (after a nearby search), or a CONDITION_SORTS id.
    const [sortBy, setSortBy] = useState('name');

    // "Find nearby" search (driving distances come from HERE via the backend)
    const [location, setLocation] = useState('');
    const [nearbyResorts, setNearbyResorts] = useState(null);
    const [nearbyOrigin, setNearbyOrigin] = useState('');
    const [nearbyPosition, setNearbyPosition] = useState(null);
    const [nearbyLoading, setNearbyLoading] = useState(false);
    const [nearbyError, setNearbyError] = useState('');

    // Resorts in the current scope, before the text search and nearby filters.
    const scopedResorts = resorts.filter((resort) => {
        if (scope === 'saved') return savedSlugs.has(resort.slug);
        if (scope === 'east') return isEastCoast(resort) && (!stateFilter || resort.region === stateFilter);
        return true;
    });

    const normalizedQuery = query.trim().toLowerCase();
    const nearbyBySlug = new Map((nearbyResorts || []).map((resort) => [resort.slug, resort]));
    const matchingResorts = scopedResorts
        .filter((resort) => !nearbyResorts || nearbyBySlug.has(resort.slug))
        .filter((resort) => `${resort.name} ${formatLocation(resort)} ${resort.region}`.toLowerCase().includes(normalizedQuery));
    const visibleResorts = nearbyResorts && sortBy === 'distance'
        ? [...matchingResorts].sort((first, second) => nearbyBySlug.get(first.slug).distance.value - nearbyBySlug.get(second.slug).distance.value)
        : sortByConditions(matchingResorts, sortBy, conditionsBySlug);
    const conditionSort = CONDITION_SORTS.find((option) => option.id === sortBy);
    const reportedCount = matchingResorts.filter((resort) => conditionsBySlug[resort.slug]?.found).length;

    // Only states that actually have resorts get a filter option.
    const eastCoastStates = Object.keys(REGION_NAMES).filter((code) => resorts.some((resort) => isEastCoast(resort) && resort.region === code));

    // Stable callback so the map does not redraw its markers on every render.
    const openResort = useCallback((slug) => navigate(`/resorts/${slug}`), [navigate]);

    async function findNearby(origin) {
        setNearbyLoading(true);
        setNearbyError('');
        try {
            // Search within the current scope so "East Coast" stays East Coast.
            const destinations = scopedResorts
                .filter(hasCoordinates)
                .map(({ slug, name, latitude, longitude }) => ({ slug, name, latitude, longitude }));
            const response = await axios.post(`${API_URL}/ski/nearby`, { origin, resorts: destinations });
            setNearbyResorts(response.data.resorts);
            setNearbyOrigin(response.data.origin);
            setNearbyPosition(response.data.originPosition);
            setSortBy('distance');
        } catch (requestError) {
            setNearbyError(requestError.response?.data?.error || 'Could not find nearby resorts. Make sure the backend server is running.');
        } finally {
            setNearbyLoading(false);
        }
    }

    function clearNearby() {
        setNearbyResorts(null);
        setSortBy((current) => (current === 'distance' ? 'name' : current));
        setNearbyOrigin('');
        setNearbyPosition(null);
    }

    function submitLocation(event) {
        event.preventDefault();
        if (location.trim()) findNearby({ address: location.trim() });
    }

    function useCurrentLocation() {
        if (!navigator.geolocation) {
            setNearbyError('Geolocation is not available in this browser.');
            return;
        }
        setNearbyLoading(true);
        setNearbyError('');
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => findNearby({ latitude: coords.latitude, longitude: coords.longitude }),
            () => {
                setNearbyLoading(false);
                setNearbyError('Could not access your location. Check browser permissions and try again.');
            },
            { enableHighAccuracy: false, timeout: 10000 }
        );
    }

    async function handleSave(resort) {
        const signedIn = await toggleSaved(resort);
        if (!signedIn) navigate('/login');
    }

    const message = nearbyError || savedError || notice;

    return (
        <main className="resorts-page">
            <div className="resorts-shell">
                <header className="resorts-heading">
                    <div>
                        <p className="resorts-eyebrow">Ski Find / Directory</p>
                        <h1>Resorts</h1>
                        <p className="resorts-heading-summary">From the Green Mountains to the Smokies: pick a mountain to see its stats, live conditions, and official site.</p>
                    </div>
                    <p className="resorts-count">{scopedResorts.length} destinations</p>
                </header>

                <section className="resorts-toolbar" aria-label="Resort filters">
                    <label className="resorts-search">
                        <span className="sr-only">Search resorts</span>
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search name or state"
                        />
                    </label>
                    {scope === 'east' && (
                        <label className="resorts-state">
                            <span className="sr-only">Filter by state</span>
                            <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
                                <option value="">All states</option>
                                {eastCoastStates.map((code) => <option key={code} value={code}>{REGION_NAMES[code]}</option>)}
                            </select>
                        </label>
                    )}
                    <label className="resorts-state">
                        <span className="sr-only">Sort resorts</span>
                        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                            <option value="name">Sort: Name (A–Z)</option>
                            {nearbyResorts && <option value="distance">Sort: Closest drive</option>}
                            {CONDITION_SORTS.map((option) => <option key={option.id} value={option.id}>Sort: {option.label}</option>)}
                        </select>
                    </label>
                    <div className="resorts-tabs" role="group" aria-label="Show resorts">
                        {SCOPES.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                className={scope === option.id ? 'is-active' : ''}
                                aria-pressed={scope === option.id}
                                onClick={() => { setScope(option.id); clearNearby(); }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </section>

                <form className="resorts-location" onSubmit={submitLocation}>
                    <label className="resorts-search">
                        <span className="sr-only">City or ZIP code</span>
                        <input
                            type="search"
                            value={location}
                            onChange={(event) => setLocation(event.target.value)}
                            placeholder="Find resorts near a city or ZIP code (e.g. Boston, 10001)"
                        />
                    </label>
                    <button className="resort-save" type="submit" disabled={nearbyLoading || !location.trim()}>
                        {nearbyLoading ? 'Searching…' : 'Find nearby'}
                    </button>
                    <button className="resort-save" type="button" onClick={useCurrentLocation} disabled={nearbyLoading}>
                        Use my location
                    </button>
                    {nearbyResorts && <button className="resort-clear" type="button" onClick={clearNearby}>Clear</button>}
                </form>
                {nearbyOrigin && <p className="resorts-nearby-status" role="status">Driving distances from {nearbyOrigin}. Showing up to 25 closest resorts.</p>}

                {conditionSort && (
                    <p className="resorts-nearby-status" role="status">
                        Sorted by {conditionSort.label.toLowerCase()} from AI-researched conditions. {reportedCount} of {matchingResorts.length} resorts have a report; the rest are listed last.
                    </p>
                )}

                {message && <p className="resorts-message" role="alert">{message}</p>}

                <section className="resorts-map-section" aria-labelledby="resorts-map-title">
                    <div className="resorts-map-heading">
                        <div>
                            <p className="resorts-eyebrow">Explore the terrain</p>
                            <h2 id="resorts-map-title">Resort map</h2>
                        </div>
                        <span>{visibleResorts.filter(hasCoordinates).length} mapped</span>
                    </div>
                    <ResortMap
                        resorts={visibleResorts}
                        nearbyBySlug={nearbyBySlug}
                        origin={nearbyPosition ? { ...nearbyPosition, label: nearbyOrigin } : null}
                        onSelectResort={openResort}
                    />
                </section>

                {!visibleResorts.length && !(loading && scope === 'all') && (
                    <div className="resorts-empty">
                        <h2>{scope === 'saved' ? 'No saved resorts yet' : 'No matching resorts'}</h2>
                        <p>{scope === 'saved' ? 'Save a resort from the directory and it will appear here.' : 'Try a different search or state.'}</p>
                        {!token && scope === 'saved' && <Link to="/login">Log in to save resorts</Link>}
                    </div>
                )}
                {loading && scope === 'all' && <p className="resorts-message" role="status">Loading the full resort directory…</p>}

                <section className="resorts-grid" aria-label="Ski resorts">
                    {visibleResorts.map((resort, index) => {
                        const saved = savedSlugs.has(resort.slug);
                        const route = nearbyBySlug.get(resort.slug);
                        const report = conditionsBySlug[resort.slug];
                        const current = report?.found ? formatConditions(report) : null;
                        return (
                            <article className="resort-row" key={resort.slug}>
                                <div className="resort-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
                                <div className="resort-details">
                                    <h2><Link className="resort-name-link" to={`/resorts/${resort.slug}`}>{resort.name}</Link></h2>
                                    <p>{formatLocation(resort, ' / ')}</p>
                                    {resort.curated && (
                                        <ul className="resort-quick-stats" aria-label={`${resort.name} quick stats`}>
                                            {resort.verticalFt && <li>{resort.verticalFt.toLocaleString()} ft vertical</li>}
                                            {resort.trails && <li>{resort.trails} trails</li>}
                                            {resort.lifts && <li>{resort.lifts} lifts</li>}
                                        </ul>
                                    )}
                                    {current && (
                                        <ul className="resort-quick-stats resort-live-stats" aria-label={`${resort.name} current conditions`}>
                                            {report.operatingStatus === 'closed' && <li className="is-closed">Closed</li>}
                                            {current.temp && <li>{current.temp}</li>}
                                            {current.newSnow && <li>{current.newSnow} new</li>}
                                            {current.baseDepth && <li>{current.baseDepth} base</li>}
                                            {current.lifts && <li>{current.lifts} lifts</li>}
                                            {current.trails && <li>{current.trails} trails</li>}
                                            {current.ticket && <li>{current.ticket} ticket</li>}
                                        </ul>
                                    )}
                                    {route && <p className="resort-distance">{route.distance.text} · {route.duration.text}</p>}
                                </div>
                                <div className="resort-actions">
                                    <Link className="resort-save" to={`/resorts/${resort.slug}`}>View resort</Link>
                                    <button
                                        type="button"
                                        className={`resort-save ${saved ? 'is-saved' : ''}`}
                                        onClick={() => handleSave(resort)}
                                        disabled={savingSlug === resort.slug}
                                        aria-pressed={saved}
                                    >
                                        {savingSlug === resort.slug ? 'Saving…' : saved ? 'Saved' : token ? 'Save' : 'Log in to save'}
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </section>
            </div>
        </main>
    );
};

export default ResortsPage;
