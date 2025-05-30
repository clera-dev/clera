export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[calc(100vh+400px)] flex flex-col">
      <main className="flex-grow w-full flex flex-col items-center pt-20 pb-64">
        {children}
      </main>
    </div>
  );
}
