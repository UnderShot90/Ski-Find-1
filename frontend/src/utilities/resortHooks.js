// ---------------------------------------------------------------------------
// React hooks for resort data, shared by every page that shows resorts.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { extractResorts, mergeResorts, normalizeResort } from './resorts';

export const API_URL = process.env.REACT_APP_BACKEND_SERVER_URI || 'http://localhost:8081';
const LIVE_CACHE_KEY = 'skiFindResortDirectory';

// One request per browser session: moving between the directory and resort
// pages reuses the same promise instead of calling the backend again.
let directoryRequest = null;

function readCachedDirectory() {
    try {
        const cached = JSON.parse(localStorage.getItem(LIVE_CACHE_KEY) || 'null');
        return Array.isArray(cached) && cached.length ? cached : null;
    } catch (error) {
        return null;
    }
}

function loadLiveDirectory() {
    if (!directoryRequest) {
        directoryRequest = axios.get(`${API_URL}/ski/resorts`)
            .then((response) => {
                const live = extractResorts(response.data).map(normalizeResort).filter(Boolean);
                if (!live.length) throw new Error('Empty resort list');
                try {
                    localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify(live));
                } catch (error) {
                    // Storage full or blocked; the list still works for this visit.
                }
                return { live, notice: '' };
            })
            .catch(() => {
                // Allow a retry on the next page load.
                directoryRequest = null;
                const cached = readCachedDirectory();
                return {
                    live: cached,
                    notice: cached
                        ? 'The live resort feed is unavailable, so some resorts are from your last visit.'
                        : 'The live resort feed is unavailable. Showing the built-in East Coast directory.'
                };
            });
    }
    return directoryRequest;
}

// Returns the merged resort directory: curated catalog plus the live API list.
// The catalog renders instantly; live resorts are added when they arrive.
export function useResortDirectory() {
    const [state, setState] = useState(() => ({
        resorts: mergeResorts(readCachedDirectory()),
        loading: true,
        notice: ''
    }));

    useEffect(() => {
        let active = true;
        loadLiveDirectory().then(({ live, notice }) => {
            if (active) setState({ resorts: mergeResorts(live), loading: false, notice });
        });
        return () => { active = false; };
    }, []);

    return state;
}

// Tracks which resorts the signed-in user has saved and lets them toggle one.
// `toggleSaved` returns false when the user must sign in first.
export function useSavedResorts() {
    const [token] = useState(() => localStorage.getItem('accessToken'));
    const [savedSlugs, setSavedSlugs] = useState(() => new Set());
    const [savingSlug, setSavingSlug] = useState('');
    const [savedError, setSavedError] = useState('');

    useEffect(() => {
        if (!token) return undefined;
        const controller = new AbortController();
        axios.get(`${API_URL}/resorts`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
            .then((response) => setSavedSlugs(new Set(response.data.map((resort) => resort.slug))))
            .catch((requestError) => {
                if (requestError.code !== 'ERR_CANCELED') {
                    setSavedError(requestError.response?.data?.message || 'Could not load your saved resorts.');
                }
            });
        return () => controller.abort();
    }, [token]);

    const toggleSaved = useCallback(async (resort) => {
        if (!token) return false;

        setSavingSlug(resort.slug);
        setSavedError('');
        const headers = { Authorization: `Bearer ${token}` };
        try {
            if (savedSlugs.has(resort.slug)) {
                await axios.delete(`${API_URL}/resorts/${encodeURIComponent(resort.slug)}`, { headers });
                setSavedSlugs((current) => {
                    const next = new Set(current);
                    next.delete(resort.slug);
                    return next;
                });
            } else {
                // Only send the fields the saved-resorts API stores.
                const { slug, name, country, region } = resort;
                await axios.post(`${API_URL}/resorts`, { slug, name, country, region }, { headers });
                setSavedSlugs((current) => new Set(current).add(resort.slug));
            }
        } catch (requestError) {
            setSavedError(requestError.response?.data?.message || 'Could not update your saved resorts.');
        } finally {
            setSavingSlug('');
        }
        return true;
    }, [token, savedSlugs]);

    return { token, savedSlugs, savingSlug, savedError, toggleSaved };
}
