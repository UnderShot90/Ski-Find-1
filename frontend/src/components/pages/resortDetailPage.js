import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ResortMap from '../ResortMap';
import ResortComments from '../ResortComments';
import { API_URL, useResortDirectory, useSavedResorts } from '../../utilities/resortHooks';
import { formatLocation, hasCoordinates, milesBetween, parseConditions } from '../../utilities/resorts';
import '../../css/resorts.css';

// ---------------------------------------------------------------------------
// One page per mountain, served by the single route /resorts/:slug.
// Everything shown here comes from the resort's catalog entry
// (src/data/resortCatalog.js) and, when available, the live ski API, so a new
// mountain only needs a new catalog entry.
// ---------------------------------------------------------------------------
const NEARBY_COUNT = 6;

// The stat tiles shown under the hero. Missing values are skipped.
const STAT_FIELDS = [
    { key: 'summitFt', label: 'Summit', format: (value) => `${value.toLocaleString()} ft` },
    { key: 'verticalFt', label: 'Vertical drop', format: (value) => `${value.toLocaleString()} ft` },
    { key: 'trails', label: 'Trails', format: String },
    { key: 'lifts', label: 'Lifts', format: String }
];

// Fetches live lift conditions for one resort. `liveSlug` is null when the
// resort is known not to be in the ski API, in which case nothing is requested.
function useLiveConditions(liveSlug) {
    const [state, setState] = useState({ loading: false, error: '', conditions: null });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!liveSlug) {
            setState({ loading: false, error: '', conditions: null });
            return undefined;
        }

        const controller = new AbortController();
        setState({ loading: true, error: '', conditions: null });
        axios.get(`${API_URL}/ski/v1/resort/${encodeURIComponent(liveSlug)}`, { signal: controller.signal })
            .then((response) => setState({ loading: false, error: '', conditions: parseConditions(response.data) }))
            .catch((requestError) => {
                if (requestError.code === 'ERR_CANCELED') return;
                const status = requestError.response?.status;
                const error = status === 429
                    ? 'The live conditions service has hit its daily limit. Try again later.'
                    : status === 404
                        ? 'Live conditions are not available for this resort yet.'
                        : requestError.response?.data?.error || 'Could not load live conditions. Make sure the backend server is running.';
                setState({ loading: false, error, conditions: null });
            });

        return () => controller.abort();
    }, [liveSlug, attempt]);

    const retry = useCallback(() => setAttempt((count) => count + 1), []);
    return { ...state, retry };
}

const ResortDetailPage = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { resorts, loading } = useResortDirectory();
    const { token, savedSlugs, savingSlug, savedError, toggleSaved } = useSavedResorts();

    // Match on either our slug or the API slug so old links keep working.
    const resort = resorts.find((item) => item.slug === slug || item.liveSlug === slug);
    const live = useLiveConditions(resort?.liveSlug);

    useEffect(() => {
        document.title = resort ? `${resort.name} | Ski Find` : 'Ski Find';
        return () => { document.title = 'Ski Find'; };
    }, [resort]);

    // Closest other resorts by straight-line distance, for the map and the list.
    const nearby = resort && hasCoordinates(resort)
        ? resorts
            .filter((item) => item.slug !== resort.slug && hasCoordinates(item))
            .map((item) => ({ ...item, miles: milesBetween(resort, item) }))
            .sort((first, second) => first.miles - second.miles)
            .slice(0, NEARBY_COUNT)
        : [];

    const openResort = useCallback((nextSlug) => navigate(`/resorts/${nextSlug}`), [navigate]);

    if (!resort) {
        return (
            <main className="resorts-page">
                <div className="resorts-shell">
                    <div className="resorts-empty">
                        {loading ? <p role="status">Loading resort…</p> : (
                            <>
                                <h2>Resort not found</h2>
                                <p>We could not find a resort called "{slug}".</p>
                                <Link to="/resorts">Back to the directory</Link>
                            </>
                        )}
                    </div>
                </div>
            </main>
        );
    }

    const saved = savedSlugs.has(resort.slug);
    const stats = STAT_FIELDS.filter((field) => Number.isFinite(resort[field.key]));
    const directionsUrl = hasCoordinates(resort)
        ? `https://www.google.com/maps/dir/?api=1&destination=${resort.latitude},${resort.longitude}`
        : '';

    async function handleSave() {
        const signedIn = await toggleSaved(resort);
        if (!signedIn) navigate('/login');
    }

    return (
        <main className="resorts-page">
            <div className="resorts-shell">
                <nav className="resort-breadcrumb" aria-label="Breadcrumb">
                    <Link to="/resorts">Resorts</Link>
                    <span aria-hidden="true">/</span>
                    <span aria-current="page">{resort.name}</span>
                </nav>

                {/* Hero: name, location, description, and the main actions */}
                <header className="resorts-heading resort-hero">
                    <div>
                        <p className="resorts-eyebrow">{formatLocation(resort)}</p>
                        <h1>{resort.name}</h1>
                        {resort.description && <p className="resorts-heading-summary">{resort.description}</p>}
                        <div className="resort-hero-actions">
                            {resort.website && (
                                <a className="resort-hero-primary" href={resort.website} target="_blank" rel="noopener noreferrer">
                                    Official website <span aria-hidden="true">↗</span>
                                </a>
                            )}
                            {directionsUrl && (
                                <a className="resort-hero-secondary" href={directionsUrl} target="_blank" rel="noopener noreferrer">
                                    Directions <span aria-hidden="true">↗</span>
                                </a>
                            )}
                            <button
                                type="button"
                                className={`resort-hero-secondary ${saved ? 'is-saved' : ''}`}
                                onClick={handleSave}
                                disabled={savingSlug === resort.slug}
                                aria-pressed={saved}
                            >
                                {savingSlug === resort.slug ? 'Saving…' : saved ? '✓ Saved' : token ? 'Save resort' : 'Log in to save'}
                            </button>
                        </div>
                    </div>
                </header>

                {savedError && <p className="resorts-message" role="alert">{savedError}</p>}

                {/* Mountain stats from the catalog */}
                {stats.length > 0 && (
                    <section className="resort-stats" aria-label="Mountain stats">
                        {stats.map((field) => (
                            <div key={field.key}>
                                <dt>{field.label}</dt>
                                <dd>{field.format(resort[field.key])}</dd>
                            </div>
                        ))}
                        <p>Approximate figures. Check the official site for this season's numbers.</p>
                    </section>
                )}

                <div className="resort-layout">
                    {/* Live conditions from the ski API */}
                    <section className="resort-panel" aria-labelledby="conditions-title">
                        <p className="resorts-eyebrow">Know before you go</p>
                        <h2 id="conditions-title">Live conditions</h2>
                        {!resort.liveSlug && <p className="resort-panel-note">Live conditions are not available for this resort yet. Check the official website for today's report.</p>}
                        {live.loading && <p className="resort-panel-note" role="status">Loading live conditions…</p>}
                        {live.error && (
                            <p className="resort-panel-note" role="alert">
                                {live.error} <button type="button" className="resort-clear" onClick={live.retry}>Retry</button>
                            </p>
                        )}
                        {live.conditions && <ConditionsReport conditions={live.conditions} />}
                    </section>

                    {/* Nearby mountains by straight-line distance */}
                    <section className="resort-panel" aria-labelledby="nearby-title">
                        <p className="resorts-eyebrow">Make it a road trip</p>
                        <h2 id="nearby-title">Nearby mountains</h2>
                        <ul className="resort-nearby-list">
                            {nearby.map((item) => (
                                <li key={item.slug}>
                                    <Link to={`/resorts/${item.slug}`}>
                                        <strong>{item.name}</strong>
                                        <small>{formatLocation(item)}</small>
                                    </Link>
                                    <span>{Math.round(item.miles)} mi</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>

                <section className="resorts-map-section" aria-labelledby="resort-map-title">
                    <div className="resorts-map-heading">
                        <div>
                            <p className="resorts-eyebrow">Location</p>
                            <h2 id="resort-map-title">{resort.name} and nearby resorts</h2>
                        </div>
                        {hasCoordinates(resort) && <span>{resort.latitude.toFixed(4)}, {resort.longitude.toFixed(4)}</span>}
                    </div>
                    <ResortMap resorts={[resort, ...nearby]} activeSlug={resort.slug} maxZoom={9} onSelectResort={openResort} />
                </section>

                {/* Keyed by slug so the thread resets when moving to another resort */}
                <ResortComments key={resort.slug} slug={resort.slug} resortName={resort.name} />
            </div>
        </main>
    );
};

// Renders the parsed live conditions: lift counts, individual lifts, and any
// other fields the API returned.
const ConditionsReport = ({ conditions }) => {
    const { liftStats, lifts, facts, reportUrl } = conditions;
    const hasLiftCounts = liftStats && Object.values(liftStats).some((count) => count > 0);

    return (
        <div className="resort-conditions-report">
            {hasLiftCounts ? (
                <dl className="resort-lift-stats">
                    {Object.entries(liftStats).map(([status, count]) => (
                        <div key={status} className={`is-${status}`}>
                            <dt>{status}</dt>
                            <dd>{count}</dd>
                        </div>
                    ))}
                </dl>
            ) : (
                <p className="resort-panel-note">No lifts are reporting right now. The resort may be closed for the season.</p>
            )}

            {lifts.length > 0 && (
                <ul className="resort-lift-list">
                    {lifts.map((lift) => (
                        <li key={lift.name}><span>{lift.name}</span><span className={`lift-status is-${lift.status.toLowerCase()}`}>{lift.status}</span></li>
                    ))}
                </ul>
            )}

            {facts.length > 0 && (
                <dl className="resort-facts">
                    {facts.map((fact) => (
                        <div key={fact.label}>
                            <dt>{fact.label.replace(/[_-]/g, ' ')}</dt>
                            <dd>{fact.value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            {reportUrl && (
                <a className="resort-report-link" href={reportUrl} target="_blank" rel="noopener noreferrer">
                    Full lift and trail report <span aria-hidden="true">↗</span>
                </a>
            )}
        </div>
    );
};

export default ResortDetailPage;
