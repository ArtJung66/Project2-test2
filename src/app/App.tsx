import { RouterProvider } from 'react-router';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider } from './contexts/AuthContext';
import { router } from './routes';

export default function App() {
  return (
    // ==========================================
    // APP ENTRY POINT (จุดเริ่มต้นแอปพลิเคชัน ครอบด้วย Provider ที่จำเป็น)
    // ==========================================
    <LanguageProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </LanguageProvider>
  );
}
