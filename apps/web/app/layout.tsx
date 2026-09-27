import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Datalom 数据集',
  description: '发现、购买和下载高质量平台数据集。',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
