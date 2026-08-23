import { getAvatar } from '@/lib/avatars';
import styles from '@/styles/avatar.module.css';

export function AvatarBadge({
  avatarId,
  size = 56,
  className = '',
}: {
  avatarId: string;
  size?: number;
  className?: string;
}) {
  const avatar = getAvatar(avatarId);
  return (
    <span
      className={`${styles.badge} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.46),
        background: `linear-gradient(160deg, ${avatar.accent} 0%, ${avatar.shade} 100%)`,
        boxShadow: `inset 0 2px 0 rgba(255,244,226,0.5), inset 0 -4px 0 rgba(30,12,4,0.35), 0 6px 16px -8px ${avatar.shade}`,
      }}
      aria-hidden="true"
    >
      {avatar.name.charAt(0)}
    </span>
  );
}
