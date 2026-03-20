export const metadata = {
  title: 'Admin Portal',
  description: 'Manage your e-commerce store',
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
