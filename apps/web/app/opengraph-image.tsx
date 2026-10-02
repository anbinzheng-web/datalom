import { ImageResponse } from 'next/og';
export const alt = 'Datalom — Social data infrastructure for builders';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: 72,
        background: '#fcfcfd',
        color: '#242733',
      }}
    >
      <div style={{ display: 'flex', fontSize: 35, fontWeight: 700 }}> datalom</div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontSize: 79,
          fontWeight: 700,
          letterSpacing: -4,
        }}
      >
        <span>The social web.</span>
        <span>Structured for your next idea.</span>
      </div>
      <div style={{ display: 'flex', fontSize: 23 }}>APIs · Datasets · AI workflows</div>
    </div>,
    size,
  );
}
