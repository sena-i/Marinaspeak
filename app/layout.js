import './globals.css';

export const metadata = {
  title: 'Speakalize',
  description: 'Speech practice and AI analysis tool'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
