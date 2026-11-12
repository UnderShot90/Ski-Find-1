import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import getUserInfo from '../../utilities/decodeJwt';
import { API_URL } from '../../utilities/resortHooks';
import { REPORT_REASONS } from '../ResortComments';
import AdminConditionsRefresh from '../AdminConditionsRefresh';
import RESORT_CATALOG from '../../data/resortCatalog';
import '../../css/resorts.css';

// ---------------------------------------------------------------------------
// Admin review queue for reported comments, served at /admin/reports.
// The backend returns comments with open reports, most reported first. An
// admin either keeps the comment (dismissing its reports) or removes it.
// Comments with enough reports are already hidden from the public until then.
// Admin rights are enforced by the backend; the token's isAdmin claim only
// decides whether this page tries to load.
// ---------------------------------------------------------------------------
const REASON_LABELS = Object.fromEntries(REPORT_REASONS.map((reason) => [reason.value, reason.label]));
const RESORT_NAMES = Object.fromEntries(RESORT_CATALOG.map((resort) => [resort.slug, resort.name]));

function formatDate(isoDate) {
    return new Date(isoDate).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Turns ['spam', 'spam', 'offensive'] into [['spam', 2], ['offensive', 1]].
function countReasons(reasons) {
    const counts = {};
    reasons.forEach((reason) => { counts[reason] = (counts[reason] || 0) + 1; });
    return Object.entries(counts).sort((first, second) => second[1] - first[1]);
}

const AdminReportsPage = () => {
    const [user] = useState(() => getUserInfo());
    const [token] = useState(() => localStorage.getItem('accessToken'));

    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actingId, setActingId] = useState('');

    const messageFor = (requestError, fallback) => {
        const status = requestError.response?.status;
        if (status === 401) return 'Your session has expired. Please sign in again.';
        if (status === 403) return 'Your account does not have admin access.';
        return requestError.response?.data?.message || fallback;
    };

    const loadQueue = useCallback(() => {
        setLoading(true);
        setError('');
        axios.get(`${API_URL}/admin/reports`, { headers: { Authorization: `Bearer ${token}` } })
            .then((response) => setQueue(response.data))
            .catch((requestError) => setError(messageFor(requestError, 'Could not load reported comments.')))
            .finally(() => setLoading(false));
    }, [token]);

    useEffect(() => {
        if (user?.isAdmin) loadQueue();
    }, [user, loadQueue]);

    async function review(item, action) {
        const commentId = item.comment._id;
        if (action === 'remove' && !window.confirm(`Remove ${item.comment.username}'s comment? This cannot be undone.`)) return;

        setActingId(commentId);
        setError('');
        try {
            const headers = { Authorization: `Bearer ${token}` };
            if (action === 'remove') {
                await axios.delete(`${API_URL}/admin/reports/${commentId}`, { headers });
            } else {
                await axios.post(`${API_URL}/admin/reports/${commentId}/dismiss`, null, { headers });
            }
            setQueue((current) => current.filter((entry) => entry.comment._id !== commentId));
        } catch (requestError) {
            setError(messageFor(requestError, 'Could not update the report.'));
        } finally {
            setActingId('');
        }
    }

    if (!user?.isAdmin) {
        return (
            <main className="resorts-page">
                <div className="resorts-shell">
                    <div className="resorts-empty">
                        <h2>Admins only</h2>
                        <p>{user ? 'Your account does not have access to the review queue.' : 'Sign in with an admin account to review reported comments.'}</p>
                        <Link to={user ? '/resorts' : '/login'}>{user ? 'Back to resorts' : 'Sign in'}</Link>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="resorts-page">
            <div className="resorts-shell">
                <header className="resorts-heading admin-reports-heading">
                    <div>
                        <p className="resorts-eyebrow">Moderation</p>
                        <h1>Reported comments</h1>
                        <p className="resorts-heading-summary">Comments with the most open reports are listed first. Comments with 5 or more reports are hidden until reviewed. Keep a comment to dismiss its reports and show it again, or remove it for good.</p>
                    </div>
                    <button type="button" className="resort-save" onClick={loadQueue} disabled={loading}>
                        {loading ? 'Refreshing…' : 'Refresh'}
                    </button>
                </header>

                <AdminConditionsRefresh token={token} />

                {error && <p className="resorts-message resort-comment-error" role="alert">{error}</p>}
                {loading && !queue.length && <p className="resort-panel-note" role="status">Loading reports…</p>}
                {!loading && !error && !queue.length && (
                    <div className="resorts-empty">
                        <h2>All clear</h2>
                        <p>There are no reported comments waiting for review.</p>
                    </div>
                )}

                <ol className="admin-report-list">
                    {queue.map((item) => {
                        const { comment } = item;
                        const busy = actingId === comment._id;
                        return (
                            <li key={comment._id} className="resort-panel">
                                <div className="admin-report-top">
                                    <span className="admin-report-count">
                                        {item.reportCount} {item.reportCount === 1 ? 'report' : 'reports'}
                                    </span>
                                    {comment.hiddenForReview && <span className="admin-report-hidden">Hidden from resort page</span>}
                                    <Link to={`/resorts/${comment.resortSlug}`}>{RESORT_NAMES[comment.resortSlug] || comment.resortSlug}</Link>
                                    <time dateTime={item.lastReportedAt}>Last reported {formatDate(item.lastReportedAt)}</time>
                                </div>

                                <div className="resort-comment-meta">
                                    <span className="resort-comment-avatar" aria-hidden="true">{comment.username.charAt(0).toUpperCase()}</span>
                                    <strong>{comment.username}</strong>
                                    <time dateTime={comment.createdAt}>Posted {formatDate(comment.createdAt)}</time>
                                </div>
                                {/* Rendered as text, so reported content can never inject HTML. */}
                                <blockquote className="admin-report-body">{comment.body}</blockquote>

                                <ul className="admin-report-reasons" aria-label="Report reasons">
                                    {countReasons(item.reasons).map(([reason, count]) => (
                                        <li key={reason}>{REASON_LABELS[reason] || reason}{count > 1 && ` × ${count}`}</li>
                                    ))}
                                </ul>
                                {item.details.length > 0 && (
                                    <details className="admin-report-details">
                                        <summary>Notes from reporters ({item.details.length})</summary>
                                        <ul>
                                            {item.details.map((note, index) => <li key={index}>{note}</li>)}
                                        </ul>
                                    </details>
                                )}

                                <div className="admin-report-actions">
                                    <button type="button" className="resort-save" onClick={() => review(item, 'dismiss')} disabled={busy}>
                                        Keep comment
                                    </button>
                                    <button type="button" className="resort-save admin-report-remove" onClick={() => review(item, 'remove')} disabled={busy}>
                                        {busy ? 'Working…' : 'Remove comment'}
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </div>
        </main>
    );
};

export default AdminReportsPage;
