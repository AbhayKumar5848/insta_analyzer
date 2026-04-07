import './globals.css';

export const metadata = {
  title: 'IG Follower Analyzer',
  description: 'Upload your Instagram following list and analyze follower counts for every account.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
