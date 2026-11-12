// ---------------------------------------------------------------------------
// React hooks for resort data, shared by every page that shows resorts.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { extractResorts, mergeResorts, normalizeResort } from './resorts';
import getUserInfo from './decodeJwt';

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

// Trail mixes stored by the backend, loaded once per browser session.
let terrainRequest = null;

function loadStoredTerrain() {
    if (!terrainRequest) {
        terrainRequest = axios.get(`${API_URL}/terrain`)
            .then((response) => Object.fromEntries(response.data.map((terrain) => [terrain.resortSlug, terrain])))
            .catch(() => {
                terrainRequest = null;
                return {};
            });
    }
    return terrainRequest;
}

// Trail difficulty breakdowns ({ [slug]: terrain }) plus `lookUp(resort)`,
// which asks the backend to research one with Claude. `notFound` holds slugs
// where Claude could not find a published breakdown.
export function useTerrain() {
    const [terrainBySlug, setTerrainBySlug] = useState({});
    const [notFound, setNotFound] = useState(() => new Set());
    const [lookingUp, setLookingUp] = useState('');
    const [lookupError, setLookupError] = useState('');

    useEffect(() => {
        let active = true;
        loadStoredTerrain().then((stored) => {
            if (active) setTerrainBySlug((current) => ({ ...stored, ...current }));
        });
        return () => { active = false; };
    }, []);

    // Resolves false when the user must log in first.
    const lookUp = useCallback(async (resort) => {
        // getUserInfo clears an expired token, so this catches stale logins too.
        const token = getUserInfo() && localStorage.getItem('accessToken');
        if (!token) return false;

        setLookingUp(resort.slug);
        setLookupError('');
        try {
            const { slug, name, region, website } = resort;
            const response = await axios.post(
                `${API_URL}/terrain/${encodeURIComponent(slug)}`,
                { name, region, website },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (response.data.found) {
                setTerrainBySlug((current) => ({ ...current, [slug]: response.data }));
                terrainRequest = null;
            } else {
                setNotFound((current) => new Set(current).add(slug));
            }
        } catch (requestError) {
            if (requestError.response?.status === 401) {
                // The backend rejected the token (e.g. its secret changed), so sign out.
                localStorage.removeItem('accessToken');
                return false;
            }
            setLookupError(requestError.response?.data?.message || 'Could not reach the server. Make sure the backend is running.');
        } finally {
            setLookingUp('');
        }
        return true;
    }, []);

    return { terrainBySlug, notFound, lookingUp, lookupError, lookUp };
}

const SKILL_LEVEL_KEY = 'skiFindSkillLevel';

// The visitor's skill level, remembered in this browser so recommendations
// follow them from resort to resort. '' until they pick one.
export function useSkillLevel() {
    const [skillLevel, setSkillLevelState] = useState(() => {
        try {
            return localStorage.getItem(SKILL_LEVEL_KEY) || '';
        } catch (error) {
            return '';
        }
    });

    const setSkillLevel = useCallback((level) => {
        setSkillLevelState(level);
        try {
            if (level) localStorage.setItem(SKILL_LEVEL_KEY, level);
            else localStorage.removeItem(SKILL_LEVEL_KEY);
        } catch (error) {
            // Storage blocked; the choice still applies for this visit.
        }
    }, []);

    return [skillLevel, setSkillLevel];
}

// Conditions reports stored by the backend, loaded once per browser session.
let conditionsRequest = null;

function loadStoredConditions() {
    if (!conditionsRequest) {
        conditionsRequest = axios.get(`${API_URL}/conditions`)
            .then((response) => Object.fromEntries(response.data.map((report) => [report.resortSlug, report])))
            .catch(() => {
                conditionsRequest = null;
                return {};
            });
    }
    return conditionsRequest;
}

// Current conditions ({ [slug]: report }) plus `refresh(resort)`, which asks
// the backend to research one with Claude. Reports carry `stale: true` once
// they are old enough to refresh. `loaded` is false until the stored reports
// have arrived.
export function useConditions() {
    const [conditionsBySlug, setConditionsBySlug] = useState({});
    const [loaded, setLoaded] = useState(false);
    const [refreshing, setRefreshing] = useState('');
    const [refreshError, setRefreshError] = useState('');

    useEffect(() => {
        let active = true;
        loadStoredConditions().then((stored) => {
            if (!active) return;
            setConditionsBySlug((current) => ({ ...stored, ...current }));
            setLoaded(true);
        });
        return () => { active = false; };
    }, []);

    // Resolves false when the user must log in first.
    const refresh = useCallback(async (resort) => {
        // getUserInfo clears an expired token, so this catches stale logins too.
        const token = getUserInfo() && localStorage.getItem('accessToken');
        if (!token) return false;

        setRefreshing(resort.slug);
        setRefreshError('');
        try {
            const { slug, name, region, website } = resort;
            const response = await axios.post(
                `${API_URL}/conditions/${encodeURIComponent(slug)}`,
                { name, region, website },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setConditionsBySlug((current) => ({ ...current, [slug]: response.data }));
            // The next page load should see this report too.
            conditionsRequest = null;
        } catch (requestError) {
            if (requestError.response?.status === 401) {
                localStorage.removeItem('accessToken');
                return false;
            }
            setRefreshError(requestError.response?.data?.message || 'Could not reach the server. Make sure the backend is running.');
        } finally {
            setRefreshing('');
        }
        return true;
    }, []);

    return { conditionsBySlug, loaded, refreshing, refreshError, refresh };
}
