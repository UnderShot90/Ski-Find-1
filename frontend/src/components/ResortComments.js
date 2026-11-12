import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import getUserInfo from '../utilities/decodeJwt';
import { API_URL } from '../utilities/resortHooks';

// ---------------------------------------------------------------------------
// Comment thread for one resort page.
// Anyone can read comments; posting and deleting use the existing login
// (the JWT in localStorage). Users only see a delete button on their own,
// and can report anyone else's for an admin to review.
// ---------------------------------------------------------------------------
const MAX_LENGTH = 1000;
const MAX_REPORT_DETAILS = 500;
export const REPORT_REASONS = [
    { value: 'spam', label: 'Spam or advertising' },
    { value: 'harassment', label: 'Harassment' },
    { value: 'offensive', label: 'Offensive language' },
    { value: 'off-topic', label: 'Off-topic' },
    { value: 'other', label: 'Something else' }
];

function formatDate(isoDate) {
    return new Date(isoDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const ResortComments = ({ slug, resortName }) => {
    // Read once per mount; the resort page remounts this component per resort.
    const [user] = useState(() => getUserInfo());
    const [token] = useState(() => localStorage.getItem('accessToken'));

    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [draft, setDraft] = useState('');
    const [posting, setPosting] = useState(false);
    const [deletingId, setDeletingId] = useState('');
    // The comment whose report form is open, and its in-progress report.
    const [reportingId, setReportingId] = useState('');
    const [report, setReport] = useState({ reason: '', details: '', sending: false, error: '' });
    // Comment id -> confirmation shown in place of the Report button.
    const [reported, setReported] = useState({});

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        axios.get(`${API_URL}/comments/${encodeURIComponent(slug)}`, { signal: controller.signal })
            .then((response) => setComments(response.data))
            .catch((requestError) => {
                if (requestError.code !== 'ERR_CANCELED') setError('Comments are unavailable right now.');
            })
            .finally(() => setLoading(false));
        return () => controller.abort();
    }, [slug]);

    // An expired token gets a clear "sign in again" message instead of a generic error.
    function messageFor(requestError, fallback) {
        if (requestError.response?.status === 401) return 'Your session has expired. Please sign in again to comment.';
        return requestError.response?.data?.message || fallback;
    }

    async function postComment(event) {
        event.preventDefault();
        if (!draft.trim()) return;

        setPosting(true);
        setError('');
        try {
            const response = await axios.post(
                `${API_URL}/comments/${encodeURIComponent(slug)}`,
                { body: draft },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setComments((current) => [response.data, ...current]);
            setDraft('');
        } catch (requestError) {
            setError(messageFor(requestError, 'Could not post your comment.'));
        } finally {
            setPosting(false);
        }
    }

    async function deleteComment(comment) {
        if (!window.confirm('Delete this comment?')) return;

        setDeletingId(comment._id);
        setError('');
        try {
            await axios.delete(`${API_URL}/comments/${encodeURIComponent(slug)}/${comment._id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setComments((current) => current.filter((item) => item._id !== comment._id));
        } catch (requestError) {
            setError(messageFor(requestError, 'Could not delete the comment.'));
        } finally {
            setDeletingId('');
        }
    }

    function openReport(comment) {
        setReportingId(comment._id);
        setReport({ reason: '', details: '', sending: false, error: '' });
    }

    async function submitReport(event, comment) {
        event.preventDefault();
        if (!report.reason) return;

        setReport((current) => ({ ...current, sending: true, error: '' }));
        try {
            const response = await axios.post(
                `${API_URL}/comments/${encodeURIComponent(slug)}/${comment._id}/report`,
                { reason: report.reason, details: report.details },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setReported((current) => ({ ...current, [comment._id]: response.data.message }));
            setReportingId('');
        } catch (requestError) {
            // Already reported counts as done; there is nothing more to send.
            if (requestError.response?.status === 409) {
                setReported((current) => ({ ...current, [comment._id]: requestError.response.data.message }));
                setReportingId('');
                return;
            }
            setReport((current) => ({ ...current, sending: false, error: messageFor(requestError, 'Could not send the report.') }));
        }
    }

    return (
        <section className="resort-panel resort-comments" aria-labelledby="comments-title">
            <div className="resort-comments-heading">
                <div>
                    <p className="resorts-eyebrow">From the lift line</p>
                    <h2 id="comments-title">Comments</h2>
                </div>
                {!loading && <span>{comments.length}{comments.length === 50 ? '+' : ''}</span>}
            </div>

            {user ? (
                <form className="resort-comment-form" onSubmit={postComment}>
                    <label htmlFor="comment-body" className="sr-only">Comment on {resortName}</label>
                    <textarea
                        id="comment-body"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        maxLength={MAX_LENGTH}
                        rows={3}
                        placeholder={`How was ${resortName}? Share conditions, tips, or favorite runs.`}
                    />
                    <div className="resort-comment-form-footer">
                        <small>Posting as <strong>{user.username}</strong> · {draft.length}/{MAX_LENGTH}</small>
                        <button type="submit" className="resort-save" disabled={posting || !draft.trim()}>
                            {posting ? 'Posting…' : 'Post comment'}
                        </button>
                    </div>
                </form>
            ) : (
                <p className="resort-panel-note">
                    <Link to="/login">Sign in</Link> or <Link to="/signup">create an account</Link> to leave a comment.
                </p>
            )}

            {error && <p className="resort-panel-note resort-comment-error" role="alert">{error}</p>}
            {loading && <p className="resort-panel-note" role="status">Loading comments…</p>}
            {!loading && !error && !comments.length && <p className="resort-panel-note">No comments yet. Be the first to share how {resortName} is skiing.</p>}

            <ul className="resort-comment-list">
                {comments.map((comment) => (
                    <li key={comment._id}>
                        <div className="resort-comment-meta">
                            <span className="resort-comment-avatar" aria-hidden="true">{comment.username.charAt(0).toUpperCase()}</span>
                            <strong>{comment.username}</strong>
                            <time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
                            {user && user.id === comment.userId && (
                                <button
                                    type="button"
                                    className="resort-clear"
                                    onClick={() => deleteComment(comment)}
                                    disabled={deletingId === comment._id}
                                >
                                    {deletingId === comment._id ? 'Deleting…' : 'Delete'}
                                </button>
                            )}
                            {user && user.id !== comment.userId && !reported[comment._id] && reportingId !== comment._id && (
                                <button type="button" className="resort-clear" onClick={() => openReport(comment)}>
                                    Report
                                </button>
                            )}
                        </div>
                        {/* Rendered as text, so comment content can never inject HTML. */}
                        <p>{comment.body}</p>
                        {reported[comment._id] && <p className="resort-report-note" role="status">{reported[comment._id]}</p>}
                        {reportingId === comment._id && (
                            <form className="resort-report-form" onSubmit={(event) => submitReport(event, comment)}>
                                <fieldset>
                                    <legend>Why are you reporting this comment?</legend>
                                    {REPORT_REASONS.map((reason) => (
                                        <label key={reason.value}>
                                            <input
                                                type="radio"
                                                name={`report-reason-${comment._id}`}
                                                value={reason.value}
                                                checked={report.reason === reason.value}
                                                onChange={() => setReport((current) => ({ ...current, reason: reason.value }))}
                                            />
                                            {reason.label}
                                        </label>
                                    ))}
                                </fieldset>
                                <label htmlFor={`report-details-${comment._id}`} className="sr-only">Details (optional)</label>
                                <textarea
                                    id={`report-details-${comment._id}`}
                                    value={report.details}
                                    onChange={(event) => setReport((current) => ({ ...current, details: event.target.value }))}
                                    maxLength={MAX_REPORT_DETAILS}
                                    rows={2}
                                    placeholder="Anything the admin should know? (optional)"
                                />
                                {report.error && <p className="resort-comment-error" role="alert">{report.error}</p>}
                                <div className="resort-comment-form-footer">
                                    <button type="button" className="resort-clear" onClick={() => setReportingId('')}>Cancel</button>
                                    <button type="submit" className="resort-save" disabled={report.sending || !report.reason}>
                                        {report.sending ? 'Sending…' : 'Send report'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
};

export default ResortComments;
