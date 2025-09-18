const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://monkeypaw.onrender.com";

export default function Home() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-purple-600 mb-4">Welcome to Wisher!</h1>
        <p className="text-gray-700">Backend: {BACKEND_URL}</p>
      </div>
    </div>
  );
}