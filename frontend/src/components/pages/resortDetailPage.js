import React, { useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ResortMap from '../ResortMap';
import ResortComments from '../ResortComments';
import { useConditions, useResortDirectory, useSavedResorts, useSkillLevel, useTerrain } from '../../utilities/resortHooks';
import { SKILL_LEVELS, formatConditions, formatLocation, getDifficulty, getSkillLevel, hasCoordinates, hasTerrain, milesBetween, recommendForSkill, skillFit, timeAgo, withTerrain } from '../../utilities/resorts';
import '../../css/resorts.css';

// ---------------------------------------------------------------------------
// One page per mountain, served by the single route /resorts/:slug.
// Everything shown here comes from the resort's catalog entry
// (src/data/resortCatalog.js), the live resort directory, and current
// conditions researched by Claude, so a new mountain only needs a new
// catalog entry.
// ---------------------------------------------------------------------------
const NEARBY_COUNT = 6;
const SKILL_MATCH_COUNT = 6;

// What to tell a skier about this resort compared with their level.
const FIT_MESSAGES = {
    match: 'A good match for your level.',
    easier: 'Should feel comfortable. You may find fewer challenging runs.',
    harder: 'May be challenging at your level. Stick to marked easier trails.'
};

// The stat tiles shown under the hero. Missing values are skipped.
const STAT_FIELDS = [
    { key: 'summitFt', label: 'Summit', format: (value) => `${value.toLocaleString()} ft` },
    { key: 'verticalFt', label: 'Vertical drop', format: (value) => `${value.toLocaleString()} ft` },
    { key: 'trails', label: 'Trails', format: String },
    { key: 'lifts', label: 'Lifts', format: String }
];

const ResortDetailPage = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { resorts: directory, loading } = useResortDirectory();
    const { token, savedSlugs, savingSlug, savedError, toggleSaved } = useSavedResorts();
    const [skillLevel, setSkillLevel] = useSkillLevel();
    const terrain = useTerrain();
    // Trail mixes looked up by Claude feed into every resort's suggested level.
    const resorts = withTerrain(directory, terrain.terrainBySlug);

    // Match on either our slug or the API slug so old links keep working.
    const resort = resorts.find((item) => item.slug === slug || item.liveSlug === slug);

    // Current conditions researched by Claude. For signed-in visitors, a
    // missing or old report is refreshed automatically, once per resort.
    const conditions = useConditions();
    const { refresh: refreshConditions } = conditions;
    const report = resort ? conditions.conditionsBySlug[resort.slug] : undefined;
    const needsRefresh = Boolean(resort) && conditions.loaded && (!report || report.stale);
    const resortRef = useRef(resort);
    resortRef.current = resort;
    const autoRefreshed = useRef(new Set());
    const resortSlug = resort?.slug;
    useEffect(() => {
        if (!needsRefresh || !token || autoRefreshed.current.has(resortSlug)) return;
        autoRefreshed.current.add(resortSlug);
        refreshConditions(resortRef.current);
    }, [needsRefresh, token, resortSlug, refreshConditions]);

    // Keyed on the name, since `resort` is a new object on every render.
    const resortName = resort?.name;
    useEffect(() => {
        document.title = resortName ? `${resortName} | Ski Find` : 'Ski Find';
        return () => { document.title = 'Ski Find'; };
    }, [resortName]);

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
    const difficulty = getDifficulty(resort);
    const fit = skillFit(difficulty, skillLevel);
    const skillMatches = recommendForSkill(resorts, skillLevel, resort, SKILL_MATCH_COUNT);
    const directionsUrl = hasCoordinates(resort)
        ? `https://www.google.com/maps/dir/?api=1&destination=${resort.latitude},${resort.longitude}`
        : '';

    async function handleTerrainLookup() {
        const signedIn = await terrain.lookUp(resort);
        if (!signedIn) navigate('/login');
    }

    async function handleConditionsRefresh() {
        const signedIn = await refreshConditions(resort);
        if (!signedIn) navigate('/login');
    }

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
                        {difficulty && (
                            <div>
                                <dt>Suggested level</dt>
                                <dd><span className={`difficulty-badge is-${difficulty.id}`}>{difficulty.label}</span></dd>
                            </div>
                        )}
                        <p>Approximate figures. Check the official site for this season's numbers.</p>
                    </section>
                )}

                <div className="resort-layout">
                    {/* Current conditions researched by Claude */}
                    <section className="resort-panel" aria-labelledby="conditions-title">
                        <p className="resorts-eyebrow">Know before you go</p>
                        <h2 id="conditions-title">Live conditions</h2>
                        <ConditionsReport
                            report={report}
                            loaded={conditions.loaded}
                            refreshing={conditions.refreshing === resort.slug}
                            error={conditions.refreshError}
                            signedIn={Boolean(token)}
                            onRefresh={handleConditionsRefresh}
                        />
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

                {/* Suggested difficulty and mountains matched to the skier's level */}
                <section className="resort-panel resort-skill" aria-labelledby="skill-title">
                    <p className="resorts-eyebrow">Find your level</p>
                    <h2 id="skill-title">Matched to your skill level</h2>
                    {difficulty ? (
                        <p className="resort-panel-note">
                            {resort.name} is rated <span className={`difficulty-badge is-${difficulty.id}`}>{difficulty.label}</span>. {difficulty.summary} {difficulty.reason}
                        </p>
                    ) : (
                        <p className="resort-panel-note">There is not enough data to suggest a level for {resort.name} yet.</p>
                    )}

                    {hasTerrain(resort) ? (
                        <TrailMix terrain={resort.terrain} />
                    ) : terrain.notFound.has(resort.slug) ? (
                        <p className="resort-panel-note">No published trail breakdown could be found for {resort.name}.</p>
                    ) : (
                        <div className="trail-lookup">
                            <button type="button" className="resort-hero-secondary" onClick={handleTerrainLookup} disabled={terrain.lookingUp === resort.slug}>
                                {terrain.lookingUp === resort.slug
                                    ? 'Researching trails… (up to a minute)'
                                    : token ? 'Look up trail breakdown with AI' : 'Log in to look up trail breakdown'}
                            </button>
                            <small>Claude searches the web for {resort.name}'s green, blue, and black trail mix to sharpen this rating.</small>
                        </div>
                    )}
                    {terrain.lookupError && <p className="resorts-message" role="alert">{terrain.lookupError}</p>}

                    <div className="skill-picker" role="group" aria-label="Your skill level">
                        <span>I ski at</span>
                        {SKILL_LEVELS.map((level) => (
                            <button
                                key={level.id}
                                type="button"
                                className={skillLevel === level.id ? 'is-active' : ''}
                                aria-pressed={skillLevel === level.id}
                                onClick={() => setSkillLevel(skillLevel === level.id ? '' : level.id)}
                            >
                                {level.label}
                            </button>
                        ))}
                    </div>

                    {!skillLevel && <p className="resort-panel-note">Pick your level to see mountains that suit you.</p>}
                    {fit && <p className={`skill-fit is-${fit}`}>{FIT_MESSAGES[fit]}</p>}
                    {skillLevel && (skillMatches.length ? (
                        <ul className="resort-nearby-list">
                            {skillMatches.map((item) => (
                                <li key={item.slug}>
                                    <Link to={`/resorts/${item.slug}`}>
                                        <strong>{item.name}</strong>
                                        <small>{formatLocation(item)}</small>
                                    </Link>
                                    {item.miles !== null && <span>{Math.round(item.miles)} mi</span>}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="resort-panel-note">No other {getSkillLevel(skillLevel).label.toLowerCase()} mountains found.</p>
                    ))}
                </section>

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

// Green / blue / black split as a bar with a legend. Catalog figures have no
// `sources`; ones researched by Claude list where the numbers came from.
const TRAIL_RATINGS = [
    { key: 'beginnerPct', label: 'Green', className: 'is-beginner' },
    { key: 'intermediatePct', label: 'Blue', className: 'is-intermediate' },
    { key: 'advancedPct', label: 'Black', className: 'is-advanced' }
];

const TrailMix = ({ terrain }) => (
    <div className="trail-mix">
        <div className="trail-mix-bar" role="img" aria-label={TRAIL_RATINGS.map((rating) => `${terrain[rating.key]}% ${rating.label.toLowerCase()}`).join(', ')}>
            {TRAIL_RATINGS.map((rating) => terrain[rating.key] > 0 && (
                <span key={rating.key} className={rating.className} style={{ width: `${terrain[rating.key]}%` }} />
            ))}
        </div>
        <ul className="trail-mix-legend">
            {TRAIL_RATINGS.map((rating) => (
                <li key={rating.key}><span className={`trail-mix-swatch ${rating.className}`} aria-hidden="true" />{rating.label} {terrain[rating.key]}%</li>
            ))}
        </ul>
        {terrain.summary && <p className="resort-panel-note">{terrain.summary}</p>}
        {terrain.sources && (
            <p className="trail-mix-source">
                Researched by Claude (AI) from the web. Check the resort's trail map to confirm.
                {terrain.sources.map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer"> Source {index + 1}</a>
                ))}
            </p>
        )}
    </div>
);

// The stat tiles in the conditions report, read from formatConditions().
const CONDITION_TILES = [
    { key: 'temp', label: 'Temperature' },
    { key: 'newSnow', label: 'New snow (24h)' },
    { key: 'baseDepth', label: 'Base depth' },
    { key: 'lifts', label: 'Lifts open' },
    { key: 'trails', label: 'Trails open' },
    { key: 'ticket', label: 'Adult day ticket' }
];

const STATUS_LABELS = { open: 'Open today', closed: 'Closed', unknown: 'Status unknown' };

// Report dates are calendar days (YYYY-MM-DD); noon keeps them on the same day in every time zone.
function formatReportDate(day) {
    return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// Current conditions researched by Claude: open status, weather, snow, lifts,
// trails, ticket price, and webcam links, plus where they came from.
const ConditionsReport = ({ report, loaded, refreshing, error, signedIn, onRefresh }) => {
    if (!loaded) return <p className="resort-panel-note" role="status">Loading conditions…</p>;

    const values = report?.found ? formatConditions(report) : null;
    const canRefresh = !refreshing && (!report || report.stale);

    return (
        <div className="resort-conditions-report">
            {refreshing && <p className="resort-panel-note" role="status">Checking today's conditions with AI. This can take up to a minute…</p>}
            {!report && !refreshing && !signedIn && (
                <p className="resort-panel-note"><Link to="/login">Sign in</Link> to load today's conditions for this resort.</p>
            )}
            {report && !report.found && (
                <p className="resort-panel-note">No current conditions could be found for this resort. Check the official website for today's report.</p>
            )}

            {values && (
                <>
                    <div className="conditions-status">
                        <span className={`conditions-status-pill is-${report.operatingStatus}`}>{STATUS_LABELS[report.operatingStatus] || STATUS_LABELS.unknown}</span>
                        {report.reportDate && <span>Report from {formatReportDate(report.reportDate)}</span>}
                    </div>

                    <dl className="conditions-grid">
                        {CONDITION_TILES.map((tile) => (
                            <div key={tile.key} className={values[tile.key] ? '' : 'is-missing'}>
                                <dt>{tile.label}</dt>
                                <dd>{values[tile.key] || 'Not reported'}</dd>
                            </div>
                        ))}
                    </dl>

                    {report.weatherSummary && <p className="resort-panel-note"><strong>Weather:</strong> {report.weatherSummary}</p>}
                    {report.forecast && <p className="resort-panel-note"><strong>Forecast:</strong> {report.forecast}</p>}
                    {report.ticketNote && values.ticket && <p className="resort-panel-note"><strong>Ticket:</strong> {report.ticketNote}</p>}
                    {report.summary && <p className="resort-panel-note">{report.summary}</p>}

                    {report.webcams?.length > 0 && (
                        <div className="conditions-webcams">
                            <h3>Webcams</h3>
                            <ul>
                                {report.webcams.map((camera) => (
                                    <li key={camera.url}>
                                        <a href={camera.url} target="_blank" rel="noopener noreferrer">{camera.label} <span aria-hidden="true">↗</span></a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <p className="trail-mix-source">
                        Researched by Claude (AI) from the web {timeAgo(report.updatedAt)}. Conditions change quickly, so check the resort before you go.
                        {report.sources?.map((url, index) => (
                            <a key={url} href={url} target="_blank" rel="noopener noreferrer"> Source {index + 1}</a>
                        ))}
                    </p>
                </>
            )}

            {error && <p className="resort-panel-note resort-comment-error" role="alert">{error}</p>}
            {canRefresh && (signedIn || report) && (
                <button type="button" className="resort-hero-secondary conditions-refresh" onClick={onRefresh}>
                    {signedIn ? (report ? 'Refresh conditions' : "Load today's conditions") : 'Sign in to refresh'}
                </button>
            )}
        </div>
    );
};

export default ResortDetailPage;
