// src/components/ThemeToggle.tsx
import { useTheme } from '../hooks/useTheme';

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: '20px',
        padding: '6px 14px',
        cursor: 'pointer',
        color: 'var(--text-primary)',
        fontSize: '13px',
      }}
    >
      {/* Toggle pill */}
      <span style={{
        width: '32px',
        height: '18px',
        borderRadius: '9px',
        background: theme === 'dark' ? '#444' : '#ccc',
        position: 'relative',
        display: 'inline-block',
        transition: 'background 0.2s',
      }}>
        <span style={{
          position: 'absolute',
          top: '2px',
          left: theme === 'dark' ? '2px' : '14px',
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
        }} />
      </span>
      {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
    </button>
  );
};

export default ThemeToggle;