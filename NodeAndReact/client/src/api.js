const TOKEN_KEY = 'sma_token';
const USER_KEY = 'sma_user';

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function saveSession({ token, user }) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

function handleUnauthorized() {
    clearSession();
    const isAuthPage = ['/login', '/register', '/forgot-password', '/reset-password', '/google-callback']
        .some((p) => window.location.pathname.startsWith(p));
    if (!isAuthPage) {
        window.location.href = `/login?expired=1&from=${encodeURIComponent(window.location.pathname)}`;
    }
}

async function parseResponse(res) {
    let data = {};
    try {
        data = await res.json();
    } catch {
        // Some endpoints (e.g. 204) have no body.
    }

    if (res.status === 401) {
        handleUnauthorized();
        throw new Error(data.error || 'Please log in again.');
    }
    if (!res.ok) {
        const err = new Error(data.error || `Request failed (${res.status})`);
        err.code = data.code;
        err.status = res.status;
        throw err;
    }
    return data;
}

/** Fetch wrapper: JSON in/out, attaches the JWT, handles 401 globally. */
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
    const token = getToken();
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

    let res;
    try {
        res = await fetch(`/api${path}`, {
            method,
            headers: {
                ...(body !== undefined && !isFormData ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers,
            },
            body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
        });
    } catch {
        throw new Error('Cannot reach the API server. Make sure it is running (npm run dev).');
    }

    return parseResponse(res);
}

/**
 * Stream a chat answer from POST /api/chat/stream (Server-Sent Events).
 * Calls onMeta once (sources + live quote), onDelta for every token chunk,
 * and onDone with the final answer.
 */
export async function streamChat({ question }, { onMeta, onDelta, onDone, signal } = {}) {
    const token = getToken();
    let res;
    try {
        res = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ question }),
            signal,
        });
    } catch (err) {
        if (err?.name === 'AbortError') throw err;
        throw new Error('Cannot reach the API server. Make sure it is running (npm run dev).');
    }

    if (!res.ok) {
        await parseResponse(res); // throws with the server's message (and handles 401)
        throw new Error(`Request failed (${res.status})`);
    }
    if (!res.body) throw new Error('Streaming is not supported by this browser.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let doneReceived = false;

    const dispatch = (raw) => {
        let eventType = 'message';
        const dataLines = [];
        for (const line of raw.split('\n')) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length === 0) return;

        let payload;
        try {
            payload = JSON.parse(dataLines.join('\n'));
        } catch {
            payload = { text: dataLines.join('\n') };
        }

        if (eventType === 'meta') {
            onMeta?.(payload);
        } else if (eventType === 'delta') {
            onDelta?.(payload.text ?? '');
        } else if (eventType === 'done') {
            doneReceived = true;
            onDone?.(payload);
        } else if (eventType === 'error') {
            const err = new Error(payload.message || 'The assistant failed to respond.');
            err.code = 'CHATBOT_FAILED';
            throw err;
        }
    };

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let boundary;
            while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                const raw = buffer.slice(0, boundary).replace(/\r/g, '');
                buffer = buffer.slice(boundary + 2);
                if (raw.trim()) dispatch(raw);
            }
        }

        buffer += decoder.decode();
        if (buffer.trim()) dispatch(buffer.replace(/\r/g, ''));
    } finally {
        try {
            reader.releaseLock();
        } catch {
            // already released
        }
    }

    if (!doneReceived) {
        throw new Error('The connection ended before the answer finished. Please try again.');
    }
}

/** Multipart upload helper. */
export async function upload(path, file, field = 'avatar') {
    const form = new FormData();
    form.append(field, file);
    const token = getToken();
    let res;
    try {
        res = await fetch(`/api${path}`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: form,
        });
    } catch {
        throw new Error('Cannot reach the API server. Make sure it is running (npm run dev).');
    }
    return parseResponse(res);
}

/** Resolve a relative upload path for display. */
export function assetUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
    return url.startsWith('/') ? url : `/${url}`;
}
