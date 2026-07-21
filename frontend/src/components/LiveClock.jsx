import { useState, useEffect } from 'react';

/** DD/MM/YYYY H:i:s AM/PM — e.g. 21/07/2026 12:10:45 PM */
export function formatDateTimeAmPm(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  let h = date.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const hh = String(h).padStart(2, '0');
  const i = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${i}:${s} ${ampm}`;
}

export default function LiveClock({ className = '' }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const label = formatDateTimeAmPm(now);

  return (
    <time
      dateTime={now.toISOString()}
      className={className}
      title={label}
    >
      {label}
    </time>
  );
}
