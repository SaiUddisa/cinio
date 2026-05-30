import "./globals.css";

export const metadata = {
  title: "Cinio - MinIO Web Explorer",
  description: "A sleek, minimalistic, and premium web GUI for MinIO object storage.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
