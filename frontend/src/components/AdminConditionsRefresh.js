import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../utilities/resortHooks';
import RESORT_CATALOG from '../data/resortCatalog';

// ---------------------------------------------------------------------------
// Admin panel that refreshes AI conditions for every catalog resort at once,
// so the directory has data to sort by. The backend skips reports that are
// still fresh and runs the rest in the background; this polls its progress.
// ---------------------------------------------------------------------------
const POLL_MS = 5000;

const AdminConditionsRefresh = ({ token }) => {
    const [job, setJob] = useState(null);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState('');

    const headers = { Authorization: `Bearer ${token}` };
    const loadStatus = useCallback(() => axios.get(`${API_URL}/conditions/refresh`, { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => setJob(response.data))
        .catch(() => { /* The panel just keeps its last status. */ }), [token]);

    useEffect(() => { loadStatus(); }, [loadStatus]);

    const running = Boolean(job?.running);
    useEffect(() => {
        if (!running) return undefined;
        const timer = setInterval(loadStatus, POLL_MS);
        return () => clearInterval(timer);
    }, [running, loadStatus]);

    async function startRefresh() {
        setStarting(true);
        setError('');
        try {
            const resorts = RESORT_CATALOG.map(({ slug, name, region, website }) => ({ slug, name, region, website }));
            const response = await axios.post(`${API_URL}/conditions/refresh`, { resorts }, { headers });
            setJob(response.data);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Could not start the refresh.');
        } finally {
            setStarting(false);
        }
    }

    return (
        <section className="resort-panel admin-conditions" aria-labelledby="admin-conditions-title">
            <p className="resorts-eyebrow">Live conditions</p>
            <h2 id="admin-conditions-title">Refresh every catalog resort</h2>
            <p className="resort-panel-note">
                Looks up today's conditions with Claude for all {RESORT_CATALOG.length} East Coast catalog resorts so the directory can sort by snow, lifts, trails, ticket price, and temperature.
                Reports that are still fresh are skipped. Each lookup is a paid Anthropic API call and counts toward the daily limit.
            </p>

            {job?.startedAt && (
                <p className="resort-panel-note" role="status">
                    {job.running ? 'Running: ' : 'Last refresh: '}
                    {job.done} of {job.total} updated
                    {job.failed > 0 && `, ${job.failed} failed`}
                    {job.alreadyFresh > 0 && `, ${job.alreadyFresh} already fresh`}
                    {job.limitReached && '. Stopped at the daily lookup limit'}
                    .
                </p>
            )}
            {error && <p className="resort-panel-note resort-comment-error" role="alert">{error}</p>}

            <div className="admin-report-actions">
                <button type="button" className="resort-save" onClick={startRefresh} disabled={starting || running}>
                    {running ? 'Refreshing…' : starting ? 'Starting…' : 'Refresh conditions'}
                </button>
            </div>
        </section>
    );
};

export default AdminConditionsRefresh;
