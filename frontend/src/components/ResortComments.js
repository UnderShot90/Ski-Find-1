import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import getUserInfo from '../utilities/decodeJwt';
import { API_URL } from '../utilities/resortHooks';

// ---------------------------------------------------------------------------
// Comment thread for one resort page.
// Anyone can read comments; posting and deleting use the existing login
// (the JWT in localStorage). Users only see a delete button on their own.
// ---------------------------------------------------------------------------
const MAX_LENGTH = 1000;

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
                        </div>
                        {/* Rendered as text, so comment content can never inject HTML. */}
                        <p>{comment.body}</p>
                    </li>
                ))}
            </ul>
        </section>
    );
};

export default ResortComments;
