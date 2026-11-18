import { useEffect, useRef, useState } from 'react';
import { api, assetUrl, upload } from '../api';
import {
    ErrorToast, formatDate, formatDateTime, initials, InlineSpinner, PageLoader, Toast,
} from '../components/ui';

function passwordScore(value) {
    let score = 0;
    if (value.length >= 6) score += 1;
    if (value.length >= 10) score += 1;
    if (/[A-Z]/.test(value) && /[0-9]/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    return score;
}

const STRENGTH = [
    null,
    { label: 'Weak', color: '#e24b4a' },
    { label: 'Fair', color: '#e25c1a' },
    { label: 'Good', color: '#BA7517' },
    { label: 'Strong', color: 'var(--green)' },
];

export default function Profile() {
    const [profileUser, setProfileUser] = useState(null);
    const [stats, setStats] = useState({ watchlistCount: 0, targetCount: 0, activeTargets: 0 });
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [fullName, setFullName] = useState('');
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState('');
    const [saving, setSaving] = useState(false);
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '', newPassword: '', confirmPassword: '',
    });
    const [showPasswords, setShowPasswords] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordNotice, setPasswordNotice] = useState('');
    const fileRef = useRef(null);

    async function load() {
        setBusy(true);
        setError('');
        try {
            const data = await api('/profile');
            setProfileUser(data.user);
            setStats(data.stats || {});
            setFullName(data.user?.fullName || '');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => { load(); }, []);

    useEffect(() => () => {
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    }, [avatarPreview]);

    function onAvatarChange(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setError('');
        if (file.size > 2 * 1024 * 1024) {
            setError('Avatar must be 2 MB or smaller.');
            e.target.value = '';
            return;
        }
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            setError('Avatar must be a JPG, PNG, GIF or WebP image.');
            e.target.value = '';
            return;
        }
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
    }

    async function saveProfile(e) {
        e.preventDefault();
        setError('');
        setNotice('');
        setSaving(true);
        try {
            await api('/profile', { method: 'PUT', body: { fullName } });
            if (avatarFile) {
                await upload('/profile/avatar', avatarFile);
            }
            await load();
            setAvatarFile(null);
            setAvatarPreview('');
            if (fileRef.current) fileRef.current.value = '';
            setNotice(avatarFile ? 'Profile and avatar updated.' : 'Profile updated.');
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    async function changePassword(e) {
        e.preventDefault();
        setPasswordError('');
        setPasswordNotice('');
        if (passwordForm.newPassword.length < 6) {
            setPasswordError('New password must be at least 6 characters.');
            return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setPasswordError('The new passwords do not match.');
            return;
        }
        setSavingPassword(true);
        try {
            const data = await api('/auth/change-password', {
                method: 'POST',
                body: {
                    currentPassword: passwordForm.currentPassword,
                    newPassword: passwordForm.newPassword,
                },
            });
            setPasswordNotice(data.message || 'Password updated successfully.');
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err) {
            setPasswordError(err.message);
        } finally {
            setSavingPassword(false);
        }
    }

    if (busy && !profileUser) return <PageLoader text="Loading your profile…" />;

    if (!profileUser) {
        return (
            <>
                <ErrorToast error={error || 'Could not load your profile.'} />
                <button type="button" className="btn btn-primary" onClick={load}>
                    <i className="fas fa-rotate-right" /> Retry
                </button>
            </>
        );
    }

    const displayAvatar = avatarPreview || assetUrl(profileUser.avatarUrl);
    const userInitials = initials(profileUser.fullName);
    const memberSince = profileUser.createdAt
        ? formatDate(profileUser.createdAt, { month: 'long', year: 'numeric' })
        : '—';
    const lastLogin = profileUser.lastLoginAt ? formatDateTime(profileUser.lastLoginAt) : '—';
    const memberSinceValue = profileUser.createdAt
        ? new Date(profileUser.createdAt.replace(' ', 'T')).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
        : memberSince;
    const score = passwordScore(passwordForm.newPassword);
    const strength = STRENGTH[score];

    return (
        <>
            {error && <ErrorToast error={error} />}
            {notice && <Toast type="success">{notice}</Toast>}

            <div className="profile-layout">
                <div className="profile-stack">
                    <div className="card profile-card">
                        <div className="profile-avatar-wrap">
                            {displayAvatar ? (
                                <img src={displayAvatar} alt="Avatar" className="profile-avatar" />
                            ) : (
                                <div className="profile-avatar avatar-fallback">{userInitials}</div>
                            )}
                        </div>

                        <div className="profile-name">{profileUser.fullName}</div>
                        <div className="profile-email">{profileUser.email}</div>

                        <div className="profile-badges">
                            {profileUser.emailVerified && (
                                <span className="badge badge-green">
                                    <i className="fas fa-circle-check" style={{ fontSize: 10 }} /> Verified
                                </span>
                            )}
                            {profileUser.googleId && (
                                <span className="badge badge-google">
                                    <i className="fab fa-google" style={{ fontSize: 10 }} /> Google
                                </span>
                            )}
                        </div>

                        <div className="profile-meta">
                            <div><span>Member since</span><strong>{memberSinceValue}</strong></div>
                            <div><span>Last login</span><strong>{lastLogin}</strong></div>
                            <div>
                                <span>Account status</span>
                                <strong style={{ color: profileUser.isActive ? 'var(--green)' : 'var(--red)' }}>
                                    {profileUser.isActive ? 'Active' : 'Inactive'}
                                </strong>
                            </div>
                        </div>
                    </div>

                    <div className="card profile-stats-card">
                        <div className="section-eyebrow">Activity</div>
                        <div className="profile-stat-row">
                            <span><i className="fas fa-heart" style={{ color: 'var(--red)', marginRight: 6, fontSize: 12 }} /> Watchlist stocks</span>
                            <strong>{stats.watchlistCount ?? 0}</strong>
                        </div>
                        <div className="profile-stat-row">
                            <span><i className="fas fa-bullseye" style={{ color: 'var(--amber)', marginRight: 6, fontSize: 12 }} /> Total targets</span>
                            <strong>{stats.targetCount ?? 0}</strong>
                        </div>
                        <div className="profile-stat-row">
                            <span><i className="fas fa-circle-dot" style={{ color: 'var(--green)', marginRight: 6, fontSize: 12 }} /> Active targets</span>
                            <strong style={{ color: 'var(--green)' }}>{stats.activeTargets ?? 0}</strong>
                        </div>
                    </div>
                </div>

                <div className="profile-right">
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">
                                <i className="fas fa-user" style={{ marginRight: 8, color: 'var(--text-secondary)' }} />
                                Profile Information
                            </span>
                        </div>
                        <div className="card-body-pad">
                            <form onSubmit={saveProfile}>
                                <div className="form-grid-2">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="fullName">Full Name</label>
                                        <input
                                            id="fullName"
                                            className="form-input"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="profileEmail">Email</label>
                                        <input
                                            id="profileEmail"
                                            type="email"
                                            className="form-input input-disabled"
                                            value={profileUser.email}
                                            disabled
                                        />
                                        <span className="form-hint">Email cannot be changed</span>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label" htmlFor="avatarFile">Profile Picture</label>
                                    <div className="avatar-edit-row">
                                        {displayAvatar ? (
                                            <img src={displayAvatar} alt="Current avatar" className="avatar-edit-preview" />
                                        ) : (
                                            <div className="avatar-edit-preview avatar-fallback">{userInitials}</div>
                                        )}
                                        <div style={{ flex: 1 }}>
                                            <input
                                                ref={fileRef}
                                                id="avatarFile"
                                                type="file"
                                                accept=".jpg,.jpeg,.png,.webp,.gif"
                                                className="form-input file-input"
                                                onChange={onAvatarChange}
                                            />
                                            <span className="form-hint">JPG, PNG, GIF or WEBP — max 2MB</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="form-actions">
                                    <button type="submit" className="btn btn-primary" disabled={saving}>
                                        {saving ? <InlineSpinner /> : <i className="fas fa-floppy-disk" />}
                                        {saving ? 'Saving…' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">
                                <i className="fas fa-lock" style={{ marginRight: 8, color: 'var(--text-secondary)' }} />
                                Change Password
                            </span>
                        </div>
                        <div className="card-body-pad">
                            {!profileUser.hasPassword ? (
                                <div className="provider-notice">
                                    <i className="fab fa-google" style={{ marginRight: 6 }} />
                                    Your account uses Google login — password change is not available.
                                </div>
                            ) : (
                                <form onSubmit={changePassword}>
                                    {passwordError && <Toast type="error">{passwordError}</Toast>}
                                    {passwordNotice && <Toast type="success">{passwordNotice}</Toast>}

                                    <div className="form-group">
                                        <label className="form-label" htmlFor="currentPwd">Current Password</label>
                                        <div className="password-wrap">
                                            <input
                                                id="currentPwd"
                                                type={showPasswords ? 'text' : 'password'}
                                                className="form-input password-input"
                                                placeholder="Enter current password"
                                                autoComplete="current-password"
                                                value={passwordForm.currentPassword}
                                                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                                required
                                            />
                                            <button
                                                type="button"
                                                className="password-toggle"
                                                onClick={() => setShowPasswords((v) => !v)}
                                                aria-label="Toggle password visibility"
                                            >
                                                <i className={`fas ${showPasswords ? 'fa-eye-slash' : 'fa-eye'}`} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="form-grid-2">
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="newPwd">New Password</label>
                                            <div className="password-wrap">
                                                <input
                                                    id="newPwd"
                                                    type={showPasswords ? 'text' : 'password'}
                                                    className="form-input password-input"
                                                    placeholder="Min 6 characters"
                                                    autoComplete="new-password"
                                                    value={passwordForm.newPassword}
                                                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    className="password-toggle"
                                                    onClick={() => setShowPasswords((v) => !v)}
                                                    aria-label="Toggle password visibility"
                                                >
                                                    <i className={`fas ${showPasswords ? 'fa-eye-slash' : 'fa-eye'}`} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="confirmPwd">Confirm New Password</label>
                                            <div className="password-wrap">
                                                <input
                                                    id="confirmPwd"
                                                    type={showPasswords ? 'text' : 'password'}
                                                    className="form-input password-input"
                                                    placeholder="Repeat new password"
                                                    autoComplete="new-password"
                                                    value={passwordForm.confirmPassword}
                                                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    className="password-toggle"
                                                    onClick={() => setShowPasswords((v) => !v)}
                                                    aria-label="Toggle password visibility"
                                                >
                                                    <i className={`fas ${showPasswords ? 'fa-eye-slash' : 'fa-eye'}`} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="strength-section">
                                        <div className="section-eyebrow">Password strength</div>
                                        <div className="strength-bars">
                                            {[1, 2, 3, 4].map((n) => (
                                                <span
                                                    key={n}
                                                    className={n <= score ? 'filled' : ''}
                                                    style={n <= score && strength ? { background: strength.color } : undefined}
                                                />
                                            ))}
                                        </div>
                                        <div className="strength-label" style={{ color: strength?.color }}>
                                            {passwordForm.newPassword ? strength?.label : ''}
                                        </div>
                                    </div>

                                    <div className="form-actions">
                                        <button type="submit" className="btn btn-primary" disabled={savingPassword}>
                                            {savingPassword ? <InlineSpinner /> : <i className="fas fa-lock" />}
                                            {savingPassword ? 'Updating…' : 'Update Password'}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
