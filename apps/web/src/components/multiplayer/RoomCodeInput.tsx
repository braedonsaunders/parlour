'use client';

import { useRef } from 'react';
import { ROOM_CODE_LENGTH } from '@/lib/rooms/code';
import styles from '@/styles/join.module.css';

export function RoomCodeInput({
  value,
  onChange,
  onConfirm,
  disabled,
  autoFocus,
  label,
}: {
  value: string;
  onChange(value: string): void;
  onConfirm(): void;
  disabled: boolean;
  autoFocus: boolean;
  label: string;
}) {
  const composing = useRef(false);

  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        onChange(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (
          event.key !== 'Enter' ||
          composing.current ||
          event.nativeEvent.isComposing ||
          event.keyCode === 229
        )
          return;
        if (!disabled) onConfirm();
      }}
      maxLength={ROOM_CODE_LENGTH}
      inputMode="text"
      enterKeyHint="go"
      autoCapitalize="characters"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      autoFocus={autoFocus}
      disabled={disabled}
      data-filled={value.length > 0}
      aria-label={label}
      className={styles.codeInput}
    />
  );
}
