import { AVATARS, getAvatar } from '@/lib/avatars';
import styles from '@/styles/avatar.module.css';

export function AvatarBadge({
  avatarId,
  size = 56,
  className = '',
}: {
  avatarId: string;
  size?: number | string;
  className?: string;
}) {
  const avatar = getAvatar(avatarId);
  const character = Math.max(
    0,
    AVATARS.findIndex(({ id }) => id === avatar.id),
  );
  return (
    <span
      className={`${styles.badge} ${className}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(160deg, ${avatar.accent} 0%, ${avatar.shade} 100%)`,
        boxShadow: `inset 0 2px 0 rgba(255,244,226,0.5), inset 0 -4px 0 rgba(30,12,4,0.35), 0 6px 16px -8px ${avatar.shade}`,
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" role="presentation">
        <path d="M10 64c1-13 9-20 22-20s21 7 22 20" fill={avatar.shade} />
        <circle cx="32" cy="31" r="17" fill="#f4c49a" />
        <path d={HAIR[character % HAIR.length]!} fill="#432b27" />
        <circle cx="26" cy="31" r="1.7" fill="#25333a" />
        <circle cx="38" cy="31" r="1.7" fill="#25333a" />
        {character % 2 === 0 ? (
          <path
            d="M27 38c3 3 7 3 10 0"
            fill="none"
            stroke="#8b4d45"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : (
          <path d="M28 39h8" fill="none" stroke="#8b4d45" strokeWidth="2" strokeLinecap="round" />
        )}
        {character === 1 || character === 7 ? (
          <path
            d="M18 19c-6-8-8-1-3 3M46 19c6-8 8-1 3 3"
            fill="none"
            stroke={avatar.accent}
            strokeWidth="4"
            strokeLinecap="round"
          />
        ) : null}
        {character === 4 ? <circle cx="32" cy="15" r="5" fill="#f9e8d2" /> : null}
        {character === 6 ? (
          <path d="M21 30h9m4 0h9m-13 0h4" fill="none" stroke="#244a5c" strokeWidth="2" />
        ) : null}
      </svg>
    </span>
  );
}

const HAIR = [
  'M16 29c0-16 8-23 17-23 10 0 18 8 16 24-4-8-7-13-13-16-4 7-10 11-20 15Z',
  'M15 27c1-14 8-21 18-21 8 0 16 6 17 18-9-6-24-6-35 3Z',
  'M16 31C13 17 21 7 32 7s20 10 16 24c-3-9-9-15-16-15s-13 6-16 15Z',
  'M14 28C17 9 30 5 39 9c8 4 12 12 10 20-9-10-22-12-35-1Z',
] as const;
