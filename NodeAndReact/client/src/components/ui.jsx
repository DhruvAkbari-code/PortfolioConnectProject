import { useEffect } from 'react';

/* ---------- formatting helpers ---------- */

export function initials(name, fallback = 'U') {
    if (!name) return fallback;
    return String(name)
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || fallback;
}

export function formatINR(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `₹${n.toLocaleString('en-IN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })}`;
}

export function formatCompactINR(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatVolume(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return '—';
    if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
    if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)} K`;
    return n.toLocaleString('en-IN');
}

/** Parse SQLite's "YYYY-MM-DD HH:MM:SS" (UTC) as well as ISO strings. */
function toDate(value) {
    if (value instanceof Date) return value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)) {
        return new Date(`${value.replace(' ', 'T')}Z`);
    }
    return new Date(value);
}

export function formatDate(value, opts) {
    if (!value) return '—';
    const d = toDate(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', opts || { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
    if (!value) return '—';
    const d = toDate(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export function pctClass(value) {
    return Number(value) >= 0 ? 'text-up' : 'text-down';
}

/* ---------- reusable components ---------- */

export function PageLoader({ text = 'Loading…', full = false }) {
    return (
        <div className={full ? 'page-loader-full' : 'loading-state'}>
            <i className="fas fa-circle-notch fa-spin" />
            {text && <p>{text}</p>}
        </div>
    );
}

export function InlineSpinner() {
    return <i className="fas fa-circle-notch fa-spin" aria-hidden="true" />;
}

export function Toast({ type = 'success', children }) {
    if (!children) return null;
    const cls = type === 'error' ? 'toast-error' : type === 'info' ? 'toast-info' : 'toast-success';
    const icon = type === 'error'
        ? 'fa-circle-exclamation'
        : type === 'info'
            ? 'fa-circle-info'
            : 'fa-circle-check';
    return (
        <div className={`toast-msg ${cls}`} role="status">
            <i className={`fas ${icon}`} />
            <span>{children}</span>
        </div>
    );
}

export function EmptyState({ icon = 'fa-inbox', title, children, action }) {
    return (
        <div className="empty-state">
            <i className={`fas ${icon}`} />
            <h4>{title}</h4>
            {children && <p>{children}</p>}
            {action}
        </div>
    );
}

export function Modal({ open, onClose, title, subtitle, icon, iconColor, children }) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="modal-overlay open"
            role="presentation"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
        >
            <div className="modal-box" role="dialog" aria-modal="true" aria-label={title}>
                <div className="modal-title">
                    {icon && <i className={`fas ${icon}`} style={{ color: iconColor, marginRight: 8 }} />}
                    {title}
                </div>
                {subtitle && <p className="modal-subtitle">{subtitle}</p>}
                {children}
            </div>
        </div>
    );
}

export function ErrorToast({ error }) {
    return <Toast type="error">{error}</Toast>;
}
